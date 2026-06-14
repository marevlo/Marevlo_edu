import React, { useState, useEffect } from 'react';
import { Play, Captions, Film } from 'lucide-react';
import { reelsApi } from './reelsApi';
import ReelsOverlay from './ReelsOverlay';

/* ────────────────────────────────────────────────────────────────
   ReelRail — drop into problem / topic / course pages.

   <ReelRail kind="problem" problemId={53} topicSlugs={['dynamic-programming','kadanes-algorithm']} />
   <ReelRail kind="topic" topicSlug="dynamic-programming" title="Reels for Dynamic programming" />

   Renders nothing while loading and nothing if the rail is empty for
   non-creators — a rail must help, never clutter.
   ──────────────────────────────────────────────────────────────── */
export default function ReelRail({ kind, problemId, topicSlugs = [], topicSlug, title }) {
    const [reels, setReels] = useState(null);
    const [openAt, setOpenAt] = useState(-1);
    const source = kind === 'problem' ? 'problem_page' : 'topic_page';

    useEffect(() => {
        let dead = false;
        const load = kind === 'problem'
            ? reelsApi.railForProblem(problemId, topicSlugs)
            : reelsApi.railForTopic(topicSlug);
        load.then((d) => { if (!dead) setReels(d.reels); }).catch(() => { if (!dead) setReels([]); });
        return () => { dead = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, problemId, topicSlug]);

    if (!reels || reels.length === 0) return null;

    return (
        <section className="mt-6">
            <div className="flex items-baseline gap-3 mb-3">
                <h3 className="font-semibold text-[15px] text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Film className="w-4 h-4 text-indigo-500" />
                    {title || (kind === 'problem' ? 'Short explainers for this problem' : 'Reels for this topic')}
                </h3>
                <span className="text-xs text-gray-400">{reels.length} reels</span>
            </div>
            <div className="flex gap-3.5 overflow-x-auto pb-3 snap-x snap-mandatory">
                {reels.map((r, i) => (
                    <button key={r.id} onClick={() => setOpenAt(i)} className="shrink-0 w-[150px] text-left snap-start group"
                        aria-label={`Play: ${r.title}`}>
                        <div className="relative w-[150px] h-[224px] rounded-xl overflow-hidden bg-gray-900 shadow
                                        group-hover:-translate-y-1 transition-transform">
                            {r.thumbnailUrl
                                ? <img src={r.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                                : <div className="absolute inset-0 flex items-center justify-center text-white/30"><Play className="w-8 h-8" /></div>}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <span className="absolute right-2 bottom-2 text-[10px] font-mono text-white bg-black/60 px-1.5 py-0.5 rounded">
                                {fmtDur(r.durationSeconds)}
                            </span>
                            {r.captionsAvailable && (
                                <span className="absolute left-2 bottom-2 text-white/90"><Captions className="w-3.5 h-3.5" /></span>
                            )}
                            {r.difficulty && (
                                <span className="absolute left-2 top-2 text-[9.5px] font-semibold text-white bg-black/50 px-2 py-0.5 rounded-full">
                                    {r.difficulty}
                                </span>
                            )}
                        </div>
                        <p className="text-[13px] font-semibold mt-2 leading-snug line-clamp-2 text-gray-900 dark:text-gray-100">{r.title}</p>
                        <p className="text-[11.5px] text-gray-500 mt-0.5">@{r.author} · {fmtViews(r.views)} views</p>
                    </button>
                ))}
            </div>
            {openAt >= 0 && (
                <ReelsOverlay mode="list" reels={reels} startIndex={openAt} source={source}
                    onClose={() => setOpenAt(-1)} />
            )}
        </section>
    );
}

export function fmtDur(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
export function fmtViews(n) { return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : `${n}`; }
