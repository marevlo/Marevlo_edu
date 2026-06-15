import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    X, ChevronLeft, ChevronRight, Play, Code2, Network, Layers,
    Loader2, Upload, Film,
} from 'lucide-react';
import { reelsApi } from './reelsApi';
import ReelsOverlay from './ReelsOverlay';
import ReelUploadModal from './ReelUploadModal';
import { CreatorStudio } from './ReelsAdmin';

const isAuthed = () => !!localStorage.getItem('access_token');

/* ════════════════════════════════════════════════════════════════
   ReelsBrowser — the floater experience.

   Pill (bottom-right, above MIRA) → panel pops up in place:
     view 1: three sections (DSA / AI & Data Science / Software Eng)
     view 2: all topics in the chosen section, with live reel counts
     topic tap → ReelsOverlay plays that topic's reels; closing it
     returns to the topics view. Never navigates the page.

   Counts come from GET /reels/topics (approved reels only), so at
   launch everything legitimately reads "No reels yet" — the empty
   state recruits creators instead of hiding.
   ════════════════════════════════════════════════════════════════ */

const SECTIONS = {
    dsa: {
        name: 'Data Structures & Algorithms',
        short: 'DSA',
        desc: 'Problem-anchored explainers — watch, then solve the exact problem.',
        route: 'Reels here route to the problem bank',
        Icon: Code2,
        text: 'text-indigo-700', soft: 'bg-indigo-50', ring: 'hover:border-indigo-500',
        dot: 'bg-indigo-500',
    },
    ai: {
        name: 'AI & Data Science',
        short: 'AI & DS',
        desc: 'ML, deep learning, GenAI, agents, RAG and more — with MIRA one tap away.',
        route: 'Reels here open MIRA — never redirect',
        Icon: Network,
        text: 'text-purple-700', soft: 'bg-purple-50', ring: 'hover:border-purple-500',
        dot: 'bg-purple-500',
    },
    eng: {
        name: 'Software Engineering',
        short: 'Engineering',
        desc: 'Web, cloud, security, DevOps — everything you build and ship with.',
        route: 'Reels here open MIRA — never redirect',
        Icon: Layers,
        text: 'text-sky-700', soft: 'bg-sky-50', ring: 'hover:border-sky-500',
        dot: 'bg-sky-500',
    },
};
const SECTION_ORDER = ['dsa', 'ai', 'eng'];
const LAST_KEY = 'reels:lastTopic';

export function ReelsPill() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="fixed right-5 bottom-24 z-40 flex items-center gap-2 bg-gray-900 text-white
                           rounded-full pl-3 pr-4 py-2.5 text-sm font-semibold shadow-xl
                           hover:scale-105 transition-transform"
                aria-label="Open reels"
            >
                <span className="w-6 h-6 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center">
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                </span>
                Reels
            </button>
            {open && <ReelsBrowser onClose={() => setOpen(false)} />}
        </>
    );
}

export default function ReelsBrowser({ onClose }) {
    const [topics, setTopics] = useState(null);          // all rows from /reels/topics
    const [view, setView] = useState('sections');        // sections | topics
    const [section, setSection] = useState(null);
    const [emptyTopic, setEmptyTopic] = useState(null);  // {slug,name} for the banner
    const [loadingTopic, setLoadingTopic] = useState(null);
    const [player, setPlayer] = useState(null);          // {reels, name}
    const [uploadFor, setUploadFor] = useState(null);    // {slug,name,kind}
    const [uploadOpen, setUploadOpen] = useState(false); // footer "Upload a reel" (no preset anchor)
    const [authHint, setAuthHint] = useState(false);
    const [studioKey, setStudioKey] = useState(0);       // bump to force CreatorStudio refetch
    const [lastWatch, setLastWatch] = useState(() => {
        try { return JSON.parse(localStorage.getItem(LAST_KEY)) || null; } catch { return null; }
    });

    useEffect(() => {
        reelsApi.topics().then(setTopics).catch(() => setTopics([]));
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // browser shows topic-level rows only; concepts stay for anchoring/search
    const bySection = useMemo(() => {
        const g = { dsa: [], ai: [], eng: [] };
        (topics || []).forEach((t) => {
            if (t.kind === 'topic' && g[t.category]) g[t.category].push(t);
        });
        return g;
    }, [topics]);

    const openTopic = async (t) => {
        if (t.reel_count === 0) { setEmptyTopic(t); return; }
        setEmptyTopic(null);
        setLoadingTopic(t.slug);
        try {
            const d = await reelsApi.railForTopic(t.slug);
            if (!d.reels?.length) { setEmptyTopic(t); return; }
            const lw = { slug: t.slug, name: t.name, category: t.category, title: d.reels[0].title };
            setLastWatch(lw);
            try { localStorage.setItem(LAST_KEY, JSON.stringify(lw)); } catch { /* private mode */ }
            setPlayer({ reels: d.reels, name: t.name });
        } catch {
            setEmptyTopic(t);
        } finally {
            setLoadingTopic(null);
        }
    };

    const openUpload = () => {
        setAuthHint(false);
        if (!isAuthed()) { setAuthHint(true); return; }
        setUploadOpen(true);
    };

    const resumeTopic = () => {
        if (!lastWatch || !topics) return;
        const t = topics.find((x) => x.slug === lastWatch.slug);
        if (t && t.reel_count > 0) { setSection(t.category); setView('topics'); openTopic(t); }
    };

    const S = section ? SECTIONS[section] : null;

    return createPortal(
        <>
            <div
                className="fixed right-5 bottom-24 z-50 w-[404px] max-w-[calc(100vw-28px)] h-[660px]
                           max-h-[calc(100vh-130px)] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl
                           border border-gray-100 dark:border-zinc-800 flex flex-col overflow-hidden"
                role="dialog" aria-label="Reels"
            >
                {/* header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
                    {view !== 'sections' ? (
                        <button onClick={() => { setView('sections'); setEmptyTopic(null); }} aria-label="Back"
                            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500
                                       hover:bg-gray-100 dark:hover:bg-zinc-800">
                            <ChevronLeft className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                        </button>
                    ) : <span className="w-8" />}
                    <h2 className="flex-1 font-bold text-[15px] text-gray-900 dark:text-white">
                        {view === 'sections' ? 'Reels'
                            : view === 'studio' ? 'Your reels'
                                : <>{S.short} <span className="text-[11px] font-semibold text-gray-400">· pick a topic</span></>}
                    </h2>
                    <button onClick={onClose} aria-label="Close"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500
                                   hover:bg-gray-100 dark:hover:bg-zinc-800">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* body */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                    {!topics && (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        </div>
                    )}

                    {topics && view === 'sections' && (
                        <>
                            <h3 className="font-bold text-[19px] leading-snug text-gray-900 dark:text-white">
                                What do you want to<br />learn in 60 seconds?
                            </h3>
                            <p className="text-[12.5px] text-gray-500 mt-1">
                                Short explainers, wired to Marevlo's learning graph.
                            </p>
                            {SECTION_ORDER.map((key) => {
                                const s = SECTIONS[key];
                                const list = bySection[key];
                                const total = list.reduce((a, t) => a + t.reel_count, 0);
                                return (
                                    <button key={key}
                                        onClick={() => { setSection(key); setView('topics'); setEmptyTopic(null); }}
                                        className={`relative w-full text-left flex gap-3.5 items-start mt-3 p-4 rounded-2xl
                                                    border-[1.5px] border-gray-200 dark:border-zinc-700 transition-all
                                                    hover:-translate-y-0.5 hover:shadow-lg ${s.ring}`}>
                                        <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${s.soft} ${s.text}`}>
                                            <s.Icon className="w-5.5 h-5.5" style={{ width: 22, height: 22 }} />
                                        </span>
                                        <span className="pr-5">
                                            <span className="block font-bold text-[14.5px] text-gray-900 dark:text-white">{s.name}</span>
                                            <span className="block text-[11.5px] text-gray-500 mt-0.5 leading-relaxed">{s.desc}</span>
                                            <span className={`inline-block text-[11px] font-semibold mt-1.5 ${s.text}`}>
                                                {list.length} topics · {total === 0 ? 'be the first to upload' : `${total} reels`}
                                            </span>
                                        </span>
                                        <ChevronRight className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                    </button>
                                );
                            })}
                            {lastWatch && topics.find((t) => t.slug === lastWatch.slug)?.reel_count > 0 && (
                                <div className="mt-4">
                                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">Jump back in</p>
                                    <button onClick={resumeTopic}
                                        className="w-full flex items-center gap-3 text-left bg-gray-50 dark:bg-zinc-800
                                                   border border-gray-200 dark:border-zinc-700 rounded-xl px-3.5 py-3
                                                   hover:border-gray-300">
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[12.5px] font-semibold truncate text-gray-900 dark:text-gray-100">
                                                {lastWatch.title}
                                            </span>
                                            <span className="block text-[11px] text-gray-500">{lastWatch.name} · continue watching</span>
                                        </span>
                                        <span className="w-8 h-8 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center shrink-0">
                                            <Play className="w-3.5 h-3.5 ml-0.5" />
                                        </span>
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {topics && view === 'topics' && S && (
                        <>
                            <span className={`inline-block text-[10.5px] font-semibold rounded-full px-3 py-1 mb-3 ${S.soft} ${S.text}`}>
                                {S.route}
                            </span>
                            {emptyTopic && (
                                <div className="mb-3 rounded-xl border border-indigo-100 dark:border-indigo-900
                                                bg-indigo-50 dark:bg-indigo-950/40 px-3.5 py-3">
                                    <p className="text-[12.5px] font-semibold text-indigo-800 dark:text-indigo-300">
                                        No reels in {emptyTopic.name} yet.
                                    </p>
                                    <p className="text-[11.5px] text-indigo-700/80 dark:text-indigo-300/70 mt-0.5">
                                        Explain one concept in 60 seconds — the first reel in a topic owns it.
                                    </p>
                                    <button
                                        onClick={() => setUploadFor(emptyTopic)}
                                        className="mt-2 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-[11.5px]
                                                   font-semibold rounded-full px-3.5 py-1.5 hover:bg-indigo-700">
                                        <Upload className="w-3 h-3" /> Upload the first reel
                                    </button>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2.5">
                                {bySection[section].map((t) => {
                                    const zero = t.reel_count === 0;
                                    return (
                                        <button key={t.slug} onClick={() => openTopic(t)}
                                            className={`text-left rounded-xl border p-3.5 transition-all
                                                        hover:-translate-y-0.5 hover:shadow-md ${S.ring}
                                                        ${zero ? 'bg-gray-50 dark:bg-zinc-800/60 border-gray-100 dark:border-zinc-800'
                                                               : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700'}`}>
                                            <span className={`block font-bold text-[12.5px] leading-snug
                                                              ${zero ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                                                {t.name}
                                            </span>
                                            <span className="flex items-center gap-1.5 mt-1.5 text-[10.5px] text-gray-400">
                                                {loadingTopic === t.slug
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <span className={`w-1.5 h-1.5 rounded-full ${zero ? 'bg-gray-300 dark:bg-zinc-600' : S.dot}`} />}
                                                {zero ? 'No reels yet' : `${t.reel_count} reel${t.reel_count > 1 ? 's' : ''}`}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {topics && view === 'studio' && (
                        <CreatorStudio key={studioKey} onUploadClick={() => openUpload()} />
                    )}
                </div>

                {/* persistent create bar */}
                <div className="border-t border-gray-100 dark:border-zinc-800 px-3 py-2.5 flex items-center gap-2">
                    <button
                        onClick={() => openUpload()}
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white
                                   text-[13px] font-semibold rounded-xl px-3.5 py-2.5 hover:bg-indigo-700 transition-colors">
                        <Upload className="w-4 h-4" /> Upload a reel
                    </button>
                    <button
                        onClick={() => { if (!isAuthed()) { setAuthHint(true); return; } setView('studio'); }}
                        className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold rounded-xl
                                   px-3.5 py-2.5 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200
                                   hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                        <Film className="w-4 h-4" /> Your reels
                    </button>
                </div>
                {authHint && (
                    <div className="px-3 pb-2.5 -mt-1">
                        <p className="text-[11.5px] text-amber-600 dark:text-amber-400 text-center">
                            Please sign in to upload or manage your reels.
                        </p>
                    </div>
                )}
            </div>

            {player && (
                <ReelsOverlay mode="list" reels={player.reels} startIndex={0} source="floater"
                    onClose={() => setPlayer(null)} />
            )}
            {uploadFor && (
                <ReelUploadModal
                    defaultAnchors={[{
                        anchor_type: uploadFor.kind === 'concept' ? 'concept' : 'topic',
                        anchor_id: uploadFor.slug, label: uploadFor.name, source: 'creator',
                    }]}
                    onClose={() => setUploadFor(null)}
                    onUploaded={() => {
                        setUploadFor(null); setEmptyTopic(null);
                        reelsApi.topics().then(setTopics).catch(() => {});
                    }}
                />
            )}
            {uploadOpen && (
                <ReelUploadModal
                    onClose={() => setUploadOpen(false)}
                    onUploaded={() => {
                        setUploadOpen(false);
                        reelsApi.topics().then(setTopics).catch(() => {});
                        setStudioKey((k) => k + 1);  // force CreatorStudio to refetch
                        setView('studio');           // land the creator on their reels
                    }}
                />
            )}
        </>,
        document.body
    );
}
