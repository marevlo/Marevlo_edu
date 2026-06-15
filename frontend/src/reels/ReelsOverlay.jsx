import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Heart, Bookmark, Share2, Flag, Play, ChevronUp, ChevronDown,
    Captions, Loader2, Film, Lock, Sparkles, MessageCircle, UserPlus, UserCheck,
} from 'lucide-react';
import { reelsApi, shareReel } from './reelsApi';
import ReelComments from './ReelComments';

const isAuthed = () => !!localStorage.getItem('access_token');

// ReelsPill moved to ReelsBrowser.jsx (the pill now opens the 3-section
// browser panel, not a raw feed). Re-exported here so existing imports —
// `import { ReelsPill } from './reels/ReelsOverlay'` — keep working.
export { ReelsPill } from './ReelsBrowser';

/* ────────────────────────────────────────────────────────────────
   ReelsOverlay — full-screen vertical player.
   props:
     mode: 'feed' | 'list'
     reels: pre-fetched reel objects (mode='list', e.g. from a rail)
     startIndex
     source: problem_page | topic_page | floater | public | search
     onClose
   ──────────────────────────────────────────────────────────────── */
export default function ReelsOverlay({ mode = 'feed', reels: initial = [], startIndex = 0, source = 'floater', onClose }) {
    const [reels, setReels] = useState(initial);
    const [idx, setIdx] = useState(startIndex);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(mode === 'feed');
    const [loading, setLoading] = useState(false);

    const loadMore = useCallback(async (p) => {
        if (mode !== 'feed') return;
        setLoading(true);
        try {
            const d = await reelsApi.feed(p, 10, source);
            setReels((prev) => (p === 1 ? d.reels : [...prev, ...d.reels]));
            setHasMore(p < d.pagination.total_pages);
        } finally { setLoading(false); }
    }, [mode, source]);

    useEffect(() => {
        if (mode === 'feed' && initial.length === 0) loadMore(1);
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const step = useCallback((d) => {
        setIdx((i) => {
            const n = i + d;
            if (n < 0) return i;
            if (n >= reels.length) {
                if (hasMore && !loading) { const np = page + 1; setPage(np); loadMore(np); }
                return i;
            }
            return n;
        });
    }, [reels.length, hasMore, loading, page, loadMore]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
            if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [step, onClose]);

    // touch swipe
    const touchY = useRef(null);
    const onTouchStart = (e) => { touchY.current = e.touches[0].clientY; };
    const onTouchEnd = (e) => {
        if (touchY.current == null) return;
        const dy = touchY.current - e.changedTouches[0].clientY;
        if (Math.abs(dy) > 60) step(dy > 0 ? 1 : -1);
        touchY.current = null;
    };

    const reel = reels[idx];

    return createPortal(
        <div
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            role="dialog" aria-label="Eds player"
        >
            <div className="relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                <button onClick={() => step(-1)} aria-label="Previous Ed"
                    className="absolute -top-14 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white/15 text-white
                               hover:bg-white/30 hidden sm:flex items-center justify-center">
                    <ChevronUp className="w-5 h-5" />
                </button>
                {reel ? (
                    <ReelPlayer key={reel.id} reel={reel} source={source} onClose={onClose}
                        onEnded={() => step(1)}
                        onUpdate={(patch) => setReels((rs) => rs.map((r) => r.id === reel.id ? { ...r, ...patch } : r))} />
                ) : (
                    <div className="w-[min(400px,92vw)] h-[min(720px,90vh)] bg-gray-900 rounded-3xl flex flex-col
                                    items-center justify-center text-gray-400 gap-3">
                        {loading ? <Loader2 className="w-7 h-7 animate-spin" />
                                 : <><Film className="w-9 h-9" /><p className="text-sm">No Eds yet — be the first to upload one.</p></>}
                    </div>
                )}
                <button onClick={() => step(1)} aria-label="Next Ed"
                    className="absolute -bottom-14 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white/15 text-white
                               hover:bg-white/30 hidden sm:flex items-center justify-center">
                    <ChevronDown className="w-5 h-5" />
                </button>
            </div>
        </div>,
        document.body
    );
}

/* ── single reel ── */
function ReelPlayer({ reel, source, onClose, onEnded, onUpdate }) {
    const videoRef = useRef(null);
    const [playing, setPlaying] = useState(true);
    const [cc, setCc] = useState(true);
    const [liked, setLiked] = useState(reel.likedByMe);
    const [saved, setSaved] = useState(reel.savedByMe);
    const [likes, setLikes] = useState(reel.likes);
    const [showComments, setShowComments] = useState(false);
    const [commentCount, setCommentCount] = useState(reel.commentCount ?? null);
    const [following, setFollowing] = useState(!!reel.followedByMe);
    const [progress, setProgress] = useState(0);
    const maxWatched = useRef(0);
    const viewSent = useRef(false);

    // HLS attach (hls.js must be in package.json: npm i hls.js)
    useEffect(() => {
        const vid = videoRef.current;
        if (!vid) return;
        let hls;
        if (reel.isHls && reel.videoUrl) {
            import('hls.js').then(({ default: Hls }) => {
                if (Hls.isSupported()) {
                    hls = new Hls();
                    hls.loadSource(reel.videoUrl);
                    hls.attachMedia(vid);
                } else { vid.src = reel.videoUrl; } // Safari plays HLS natively
            }).catch(() => { vid.src = reel.videoUrl; });
        } else {
            vid.src = reel.videoUrl;
        }
        vid.play().catch(() => setPlaying(false));
        return () => { if (hls) hls.destroy(); flushView(); };
    }, [reel.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const flushView = () => {
        if (viewSent.current) return;
        viewSent.current = true;
        const pct = Math.round((maxWatched.current / (reel.durationSeconds || 1)) * 100);
        reelsApi.view(reel.id, { watched_seconds: Math.round(maxWatched.current), completion_percent: Math.min(100, pct), source }).catch(() => {});
    };

    const onTime = () => {
        const vid = videoRef.current;
        if (!vid || !vid.duration) return;
        maxWatched.current = Math.max(maxWatched.current, vid.currentTime);
        setProgress((vid.currentTime / vid.duration) * 100);
    };

    const togglePlay = () => {
        const vid = videoRef.current;
        if (!vid) return;
        if (vid.paused) { vid.play(); setPlaying(true); } else { vid.pause(); setPlaying(false); }
    };

    const doLike = async () => {
        setLiked((v) => !v); setLikes((n) => (liked ? n - 1 : n + 1));
        try { const d = await reelsApi.like(reel.id); setLiked(d.on); setLikes(d.count); onUpdate({ likedByMe: d.on, likes: d.count }); }
        catch { /* requires login — keep optimistic */ }
    };
    const doSave = async () => {
        setSaved((v) => !v);
        try { const d = await reelsApi.save(reel.id); setSaved(d.on); onUpdate({ savedByMe: d.on }); } catch { /* noop */ }
    };
    const doFollow = async () => {
        if (!isAuthed()) { window.location.href = `/signup?from=reel&slug=${reel.slug}`; return; }
        setFollowing((v) => !v);  // optimistic
        try { const d = await reelsApi.followCreator(reel.authorId); setFollowing(d.following); onUpdate({ followedByMe: d.following }); }
        catch { setFollowing((v) => !v); } // revert on error (e.g. self-follow)
    };
    const doCTA = async () => {
        reelsApi.ctaClick(reel.id, source).catch(() => {});
        const { cta } = reel;
        // Route per action — adjust paths to your router if they differ.
        if (cta.action === 'practice_free') {
            // metered paywall: consume one free unlock, then open the problem
            try {
                const r = await reelsApi.unlockProblem(reel.id);
                window.location.href = `/problems/${r.problemId}`;
            } catch (e) {
                // quota raced out between render and click — send to pricing
                window.location.href = `/pricing?from=reel&slug=${reel.slug}`;
            }
            return;
        }
        if (cta.action === 'unlock_paywall') {
            window.location.href = `/pricing?from=reel&problem=${cta.targetId}&slug=${reel.slug}`;
            return;
        }
        if (cta.action === 'open_problem' || cta.action === 'reattempt' || cta.action === 'back_to_ide' || cta.action === 'open_problem_guest' || cta.action === 'variant') {
            window.location.href = `/problems/${cta.targetId}`;
        } else if (cta.action === 'topic_problems') {
            window.location.href = `/topics/${cta.targetId}`;
        } else if (cta.action === 'course') {
            window.location.href = `/courses`;
        } else if (cta.action === 'signup') {
            window.location.href = `/signup?from=reel&slug=${reel.slug}`;
        } else if (cta.action === 'mira') {
            window.dispatchEvent(new CustomEvent('mira:open', { detail: { context: `Reel: ${reel.title}` } }));
        }
        onClose();
    };

    return (
        <div className="relative w-[min(400px,92vw)] h-[min(720px,90vh)] bg-gray-950 rounded-3xl overflow-hidden
                        shadow-2xl flex flex-col">
            <div className="absolute top-0 inset-x-0 h-1 bg-white/15 z-20">
                <div className="h-full bg-emerald-400 transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>

            <div className="relative flex-1" onClick={togglePlay}>
                <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-black"
                    poster={reel.thumbnailUrl || undefined} playsInline loop={false}
                    onTimeUpdate={onTime} onEnded={() => { flushView(); onEnded(); }} />

                {!playing && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="w-16 h-16 rounded-full bg-black/55 flex items-center justify-center">
                            <Play className="w-7 h-7 text-white ml-1" />
                        </span>
                    </div>
                )}

                {/* top bar */}
                <div className="absolute top-2 inset-x-0 px-3 pt-2 flex items-start gap-2 z-10">
                    {reel.difficulty && (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/15 text-white backdrop-blur">
                            {reel.difficulty}
                        </span>
                    )}
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/15 text-white/90 backdrop-blur">
                        {String(reel.type || '').replace(/_/g, ' ')}
                    </span>
                    <span className="flex-1" />
                    {reel.captionsAvailable && (
                        <button onClick={(e) => { e.stopPropagation(); setCc(!cc); }} aria-label="Toggle captions"
                            className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur
                                        ${cc ? 'bg-emerald-400 text-emerald-950' : 'bg-white/15 text-white'}`}>
                            <Captions className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                        </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); flushView(); onClose(); }} aria-label="Close"
                        className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center backdrop-blur hover:bg-white/30">
                        <X className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                    </button>
                </div>

                {/* right action rail */}
                <div className="absolute right-2.5 bottom-32 flex flex-col items-center gap-4 z-10 text-white">
                    <button onClick={(e) => { e.stopPropagation(); doLike(); }} aria-label="Like" className="flex flex-col items-center gap-0.5">
                        <Heart className={`w-7 h-7 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
                        <span className="text-[11px]">{likes}</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setShowComments(true); }} aria-label="Comments" className="flex flex-col items-center gap-0.5">
                        <MessageCircle className="w-6 h-6" />
                        <span className="text-[11px]">{commentCount ?? 'Comment'}</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); doSave(); }} aria-label="Save for revision" className="flex flex-col items-center gap-0.5">
                        <Bookmark className={`w-6 h-6 ${saved ? 'fill-emerald-400 text-emerald-400' : ''}`} />
                        <span className="text-[11px]">Save</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); shareReel(reel); }} aria-label="Share" className="flex flex-col items-center gap-0.5">
                        <Share2 className="w-6 h-6" />
                        <span className="text-[11px]">Share</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); reportFlow(reel); }} aria-label="Report"
                        className="opacity-70 hover:opacity-100"><Flag className="w-5 h-5" /></button>
                </div>

                {/* meta */}
                <div className="absolute bottom-0 inset-x-0 p-4 pr-16 bg-gradient-to-t from-black/85 via-black/40 to-transparent z-[5] text-white">
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-[10px] font-bold flex items-center justify-center">
                            {(reel.author || '?')[0].toUpperCase()}
                        </span>
                        <span className="text-[13px] font-semibold">@{reel.author}</span>
                        <button onClick={(e) => { e.stopPropagation(); doFollow(); }}
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 transition-colors
                                        ${following ? 'bg-white/15 text-white/90' : 'bg-white text-gray-900 hover:bg-gray-100'}`}>
                            {following ? <><UserCheck className="w-3 h-3" /> Following</> : <><UserPlus className="w-3 h-3" /> Follow</>}
                        </button>
                        <span className="text-[11px] text-white/55">{reel.time}</span>
                    </div>
                    <p className="text-[15px] font-semibold leading-snug">{reel.title}</p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                        {(reel.anchors || []).slice(0, 3).map((a) => (
                            <span key={a.type + a.id}
                                className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-white/14 text-indigo-100 backdrop-blur">
                                {a.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* smart CTA dock — locked state gets the Pro treatment */}
            <div className="bg-gray-900 border-t border-white/10 p-3.5">
                <button onClick={doCTA}
                    className={`w-full py-3 rounded-xl font-bold text-[15px] transition-colors flex items-center justify-center gap-2 ${
                        reel.cta?.action === 'unlock_paywall'
                            ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                            : 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300'}`}>
                    {reel.cta?.action === 'unlock_paywall' && <Lock className="w-4 h-4" />}
                    {reel.cta?.action === 'practice_free' && <Sparkles className="w-4 h-4" />}
                    {reel.cta?.label || 'Open on Marevlo'} {reel.cta?.action !== 'unlock_paywall' && '↗'}
                </button>
                {reel.cta?.why && (
                    <p className="text-center text-[10.5px] text-white/35 mt-1.5">resolver: {reel.cta.why}</p>
                )}
            </div>

            {showComments && (
                <ReelComments reelId={reel.id} onClose={() => setShowComments(false)}
                    onCountChange={setCommentCount} />
            )}
        </div>
    );
}

function reportFlow(reel) {
    const reason = window.prompt(
        'Report reason — type one of:\ncopyright, spam, wrong_explanation, offensive, personal_info, low_quality, other');
    if (!reason) return;
    reelsApi.report(reel.id, reason.trim(), null)
        .then(() => window.alert('Report submitted. Our team will review it.'))
        .catch((e) => window.alert(e.message));
}
