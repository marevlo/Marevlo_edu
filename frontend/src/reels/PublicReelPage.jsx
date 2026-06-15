import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Share2, Flag, Loader2 } from 'lucide-react';
import { reelsApi, shareReel } from './reelsApi';
import ReelsOverlay from './ReelsOverlay';
import { fmtDur, fmtViews } from './ReelRail';

/* PublicReelPage — route: <Route path="/reels/:slug" element={<PublicReelPage />} />
   Works logged out. This page is the share-link landing — its only job is
   to play the reel and convert the visitor via the smart CTA.

   OG tags: client-rendered React can't serve per-reel OG tags to crawlers.
   See INTEGRATION.md §OG for the small server-side snippet (CloudFront
   function or FastAPI HTML route) that injects them — required for rich
   WhatsApp/LinkedIn previews. */
export default function PublicReelPage() {
    const { slug } = useParams();
    const [reel, setReel] = useState(null);
    const [err, setErr] = useState('');
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        reelsApi.watch(slug).then(setReel).catch((e) => setErr(e.message));
        // record landing as a view source for analytics
    }, [slug]);

    useEffect(() => {
        if (reel) document.title = `${reel.title} — Marevlo Reels`;
    }, [reel]);

    if (err) return (
        <div className="max-w-xl mx-auto py-24 text-center text-gray-500">
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">This reel isn't available</p>
            <p className="text-sm mt-1">It may have been removed or is still in review.</p>
            <a href="/" className="inline-block mt-4 text-indigo-600 font-semibold text-sm">Explore Marevlo →</a>
        </div>
    );
    if (!reel) return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>;

    const doCTA = async () => {
        reelsApi.ctaClick(reel.id, 'public').catch(() => {});
        const c = reel.cta;
        if (c.action === 'practice_free') {
            try { const r = await reelsApi.unlockProblem(reel.id); window.location.href = `/problems/${r.problemId}`; }
            catch { window.location.href = `/pricing?from=reel&slug=${reel.slug}`; }
            return;
        }
        if (c.action === 'unlock_paywall') { window.location.href = `/pricing?from=reel&problem=${c.targetId}&slug=${reel.slug}`; return; }
        if (c.targetType === 'problem') window.location.href = `/problems/${c.targetId}`;
        else if (c.action === 'signup') window.location.href = `/signup?from=reel&slug=${reel.slug}`;
        else window.location.href = '/';
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 grid md:grid-cols-[340px_1fr] gap-8">
            <div className="relative aspect-[9/16] max-h-[600px] rounded-2xl overflow-hidden bg-gray-950 shadow-xl">
                {reel.thumbnailUrl && <img src={reel.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
                <button onClick={() => setPlaying(true)} aria-label="Play reel"
                    className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white/90 text-gray-900
                               flex items-center justify-center hover:scale-105 transition-transform">
                    <Play className="w-7 h-7 ml-1" />
                </button>
                <div className="absolute bottom-0 inset-x-0 p-4 text-white">
                    <p className="text-sm font-semibold">{reel.title}</p>
                    <p className="text-xs opacity-70 mt-0.5">@{reel.author} · {fmtDur(reel.durationSeconds)} · {fmtViews(reel.views)} views</p>
                </div>
            </div>

            <div>
                <div className="flex gap-1.5 flex-wrap">
                    {(reel.anchors || []).map((a) => (
                        <span key={a.type + a.id}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700
                                       dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900">
                            {a.label}
                        </span>
                    ))}
                </div>
                <h1 className="text-2xl font-bold mt-3 text-gray-900 dark:text-white leading-tight">{reel.title}</h1>
                {reel.description && <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">{reel.description}</p>}

                <button onClick={doCTA}
                    className="mt-6 px-6 py-3.5 rounded-xl bg-emerald-500 text-emerald-950 font-bold text-[15px]
                               hover:bg-emerald-400 transition-colors">
                    {reel.cta?.label} ↗
                </button>

                <div className="flex gap-2 mt-4">
                    <button onClick={() => shareReel(reel)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700
                                   text-sm font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800">
                        <Share2 className="w-4 h-4" /> Share
                    </button>
                    <button onClick={() => {
                        const reason = window.prompt('Reason: copyright, spam, wrong_explanation, offensive, personal_info, low_quality, other');
                        if (reason) reelsApi.report(reel.id, reason.trim(), null).then(() => window.alert('Report submitted.')).catch((e) => window.alert(e.message));
                    }} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700
                                   text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800">
                        <Flag className="w-4 h-4" /> Report
                    </button>
                </div>

                {reel.transcript && (
                    <details className="mt-6">
                        <summary className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">Transcript</summary>
                        <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-wrap
                                      bg-gray-50 dark:bg-zinc-900 rounded-xl p-4 max-h-64 overflow-y-auto">{reel.transcript}</p>
                    </details>
                )}
            </div>

            {playing && <ReelsOverlay mode="list" reels={[reel]} startIndex={0} source="public" onClose={() => setPlaying(false)} />}
        </div>
    );
}
