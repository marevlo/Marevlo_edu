import React, { useState, useEffect, useCallback } from 'react';
import { Check, X, EyeOff, RotateCcw, Trash2, Loader2, ShieldAlert, Film } from 'lucide-react';
import { reelsApi } from './reelsApi';
import { fmtDur, fmtViews } from './ReelRail';

/* ════════════════════════════════════════════════════════════════
   ReelsModerationDashboard — route behind your admin guard:
     <Route path="/admin/reels" element={<ReelsModerationDashboard />} />
   ════════════════════════════════════════════════════════════════ */
export function ReelsModerationDashboard() {
    const [counts, setCounts] = useState({});
    const [tab, setTab] = useState('pending');
    const [rows, setRows] = useState([]);
    const [reports, setReports] = useState([]);
    const [audit, setAudit] = useState([]);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        setBusy(true);
        try {
            const [c, q, rep, au] = await Promise.all([
                reelsApi.admin.queues(),
                tab === 'reports' ? Promise.resolve({ reels: [] }) : reelsApi.admin.queue(tab),
                reelsApi.admin.reports('open'),
                reelsApi.admin.audit(),
            ]);
            setCounts(c); setRows(q.reels || []); setReports(rep.reports || []); setAudit(au.actions || []);
        } finally { setBusy(false); }
    }, [tab]);

    useEffect(() => { refresh(); }, [refresh]);

    const act = async (id, action) => {
        const reason = (action === 'reject' || action === 'takedown')
            ? window.prompt('Reason (sent to the creator):') : null;
        if ((action === 'reject' || action === 'takedown') && !reason) return;
        await reelsApi.admin.act(id, action, reason, null);
        refresh();
    };
    const resolveReport = async (id, outcome) => { await reelsApi.admin.resolveReport(id, outcome); refresh(); };

    const TABS = [
        ['pending', `Pending (${counts.pending ?? 0})`],
        ['approved', `Approved (${counts.approved ?? 0})`],
        ['hidden', `Hidden (${counts.hidden ?? 0})`],
        ['rejected', `Rejected (${counts.rejected ?? 0})`],
        ['reports', `Reports (${counts.open_reports ?? 0})`],
    ];

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <ShieldAlert className="w-6 h-6 text-indigo-500" /> Reels moderation
            </h1>
            <p className="text-sm text-gray-500 mt-1">Review before publish. Every action is logged to the audit trail.</p>

            <div className="flex gap-1 border-b border-gray-200 dark:border-zinc-800 mt-6">
                {TABS.map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                            tab === k ? 'border-indigo-600 text-indigo-600'
                                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                        {l}
                    </button>
                ))}
            </div>

            {busy && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>}

            {!busy && tab !== 'reports' && (
                <div className="space-y-3 mt-5">
                    {rows.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">Queue clear.</p>}
                    {rows.map((r) => (
                        <div key={r.id} className="grid grid-cols-[72px_1fr_auto] gap-4 items-start p-4 rounded-xl
                                                   border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                            <div className="w-[72px] h-[104px] rounded-lg overflow-hidden bg-gray-900 relative">
                                {r.thumbnailUrl && <img src={r.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                                <span className="absolute bottom-1 right-1 text-[9px] font-mono text-white bg-black/60 px-1 rounded">
                                    {fmtDur(r.durationSeconds)}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-[14px] text-gray-900 dark:text-gray-100">{r.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    @{r.author} · {r.language} · {String(r.type).replace(/_/g, ' ')} · {r.difficulty || '—'}
                                </p>
                                <div className="flex gap-1.5 flex-wrap mt-2">
                                    {(r.anchors || []).map((a) => (
                                        <span key={a.type + a.id} className="text-[10px] font-semibold px-2 py-0.5 rounded-full
                                            bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                            {a.label} <span className="opacity-50">({a.source})</span>
                                        </span>
                                    ))}
                                </div>
                                {r.transcript && (
                                    <details className="mt-2">
                                        <summary className="text-xs font-semibold text-gray-500 cursor-pointer">Transcript</summary>
                                        <p className="text-xs text-gray-500 mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap
                                                      bg-gray-50 dark:bg-zinc-800 rounded-lg p-2.5">{r.transcript}</p>
                                    </details>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5 w-32">
                                {tab === 'pending' && (<>
                                    <Btn icon={Check} label="Approve" tone="ok" onClick={() => act(r.id, 'approve')} />
                                    <Btn icon={X} label="Reject" tone="bad" onClick={() => act(r.id, 'reject')} />
                                </>)}
                                {tab === 'approved' && (<>
                                    <Btn icon={EyeOff} label="Hide" onClick={() => act(r.id, 'hide')} />
                                    <Btn icon={Trash2} label="Take down" tone="bad" onClick={() => act(r.id, 'takedown')} />
                                </>)}
                                {(tab === 'hidden' || tab === 'rejected') && (
                                    <Btn icon={RotateCcw} label="Restore" tone="ok" onClick={() => act(r.id, 'restore')} />
                                )}
                                <a href={`/reels/${r.slug}`} target="_blank" rel="noreferrer"
                                   className="text-center text-xs text-indigo-600 font-semibold mt-1">Preview ↗</a>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!busy && tab === 'reports' && (
                <div className="space-y-3 mt-5">
                    {reports.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">No open reports.</p>}
                    {reports.map((rep) => (
                        <div key={rep.id} className="p-4 rounded-xl border border-gray-200 dark:border-zinc-800
                                                     bg-white dark:bg-zinc-900 flex items-start gap-4">
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                    {rep.reason === 'copyright' ? '© Copyright complaint' : `⚑ ${rep.reason.replace(/_/g, ' ')}`}
                                    <span className="text-gray-400 font-normal"> · reel #{rep.reelId}</span>
                                </p>
                                {rep.description && <p className="text-xs text-gray-500 mt-1">{rep.description}</p>}
                                {rep.reason === 'copyright' && (
                                    <p className="text-[11px] text-amber-600 mt-1.5 font-medium">
                                        Reel auto-hidden on filing. Awaiting creator response.
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5 w-40">
                                <Btn label="Dismiss + restore" tone="ok" onClick={() => resolveReport(rep.id, 'restore_and_dismiss')} />
                                <Btn label="Dismiss only" onClick={() => resolveReport(rep.id, 'dismiss')} />
                                <Btn label="Take down" tone="bad" onClick={() => resolveReport(rep.id, 'takedown')} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <h3 className="font-semibold text-sm mt-8 text-gray-900 dark:text-gray-100">Audit log</h3>
            <div className="mt-2 rounded-xl bg-gray-950 text-gray-400 font-mono text-[11.5px] p-4 max-h-56 overflow-y-auto">
                {audit.map((a) => (
                    <div key={a.id}>
                        <span className="text-gray-600">{new Date(a.at).toLocaleString()}</span>{' '}
                        <span className={a.action === 'approve' || a.action === 'restore' ? 'text-emerald-400' : 'text-rose-300'}>
                            {a.reviewerId ? `mod#${a.reviewerId}` : 'system'} · {a.action}
                        </span>{' '}
                        — reel #{a.reelId}{a.reason ? ` · ${a.reason}` : ''}
                    </div>
                ))}
            </div>
        </div>
    );
}

function Btn({ icon: Icon, label, tone, onClick }) {
    const t = tone === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900'
        : tone === 'bad' ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900'
        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800';
    return (
        <button onClick={onClick}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${t}`}>
            {Icon && <Icon className="w-3.5 h-3.5" />}{label}
        </button>
    );
}

/* ════════════════════════════════════════════════════════════════
   CreatorStudio — the creator's own reels + transparent status.
     <Route path="/reels/studio" element={<CreatorStudio />} />
   ════════════════════════════════════════════════════════════════ */
export function CreatorStudio({ onUploadClick }) {
    const [reels, setReels] = useState(null);
    useEffect(() => { reelsApi.mine().then((d) => setReels(d.reels)).catch(() => setReels([])); }, []);

    if (!reels) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>;

    const badge = (s) => ({
        approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        processing: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
        rejected: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300',
        hidden: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400',
    }[s] || 'bg-gray-100 text-gray-500');

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                    <Film className="w-6 h-6 text-indigo-500" /> Your reels
                </h1>
                {onUploadClick && (
                    <button onClick={onUploadClick}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                        Upload a reel
                    </button>
                )}
            </div>
            <div className="space-y-3 mt-6">
                {reels.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                        <Film className="w-9 h-9 mx-auto mb-2" />
                        <p className="font-semibold text-gray-700 dark:text-gray-200">Nothing here yet</p>
                        <p className="text-sm mt-1">Explain one concept in 60 seconds — that's a reel.</p>
                    </div>
                )}
                {reels.map((r) => (
                    <div key={r.id} className="flex items-center gap-4 p-4 rounded-xl border border-gray-200
                                               dark:border-zinc-800 bg-white dark:bg-zinc-900">
                        <div className="w-14 h-20 rounded-lg overflow-hidden bg-gray-900 shrink-0">
                            {r.thumbnailUrl && <img src={r.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">{r.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {fmtViews(r.views)} views · {r.likes} likes · {r.saves} saves · {Math.round(r.avgCompletion)}% completion
                            </p>
                        </div>
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${badge(r.status)}`}>
                            {r.status === 'pending' ? 'In review' : r.status}
                        </span>
                        {r.status === 'approved' && (
                            <a href={`/reels/${r.slug}`} className="text-xs font-semibold text-indigo-600">View ↗</a>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
