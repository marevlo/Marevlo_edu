import React, { useState, useEffect } from 'react';
import { Trophy, Send, Medal, LogIn, TrendingUp, ChevronUp, ChevronDown, Minus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getFirebaseFirestore } from '../lib/firebase';

const RANK_STYLES = [
    { bg: 'bg-amber-500/15',   text: 'text-amber-400',   label: '🥇' },
    { bg: 'bg-slate-400/10',   text: 'text-slate-300',   label: '🥈' },
    { bg: 'bg-orange-700/10',  text: 'text-orange-400',  label: '🥉' },
];

function ScoreBadge({ score, minimumScore }) {
    const min = parseFloat((minimumScore || '').match(/[\d.]+/)?.[0] || '0');
    const passes = min > 0 ? score >= min : true;
    return (
        <span className={`font-mono text-[0.88rem] font-black ${passes ? 'text-emerald-400' : 'text-rose-400'}`}>
            {(score * 100).toFixed(1)}%
        </span>
    );
}

function timeAgo(ts) {
    if (!ts) return '';
    const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
    if (secs < 60)    return 'just now';
    if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
}

export default function ProjectLeaderboard({ projectId, minimumScore, isDark }) {
    const [entries, setEntries]       = useState([]);
    const [loading, setLoading]       = useState(true);
    const [score, setScore]           = useState('');
    const [notes, setNotes]           = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError]           = useState('');
    const [success, setSuccess]       = useState('');
    const { user } = useAuth();

    // Load leaderboard entries (ordered by score desc)
    useEffect(() => {
        let unsub;
        (async () => {
            try {
                const { db, collection, query, orderBy, onSnapshot } =
                    await getFirebaseFirestore();
                const q = query(
                    collection(db, `project_leaderboard/${projectId}/entries`),
                    orderBy('score', 'desc')
                );
                unsub = onSnapshot(q, snap => {
                    setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setLoading(false);
                });
            } catch {
                setLoading(false);
            }
        })();
        return () => unsub && unsub();
    }, [projectId]);

    const userEntry = user ? entries.find(e => e.authorId === user.id) : null;

    const handleSubmit = async () => {
        setError('');
        setSuccess('');
        const parsed = parseFloat(score);
        if (isNaN(parsed) || parsed < 0 || parsed > 1) {
            setError('Enter your primary metric score as a decimal between 0 and 1. Example: 0.87 for 87% F1.');
            return;
        }
        if (notes.length > 500) {
            setError('Notes must be under 500 characters.');
            return;
        }
        if (!user) return;
        setSubmitting(true);
        try {
            const { db, doc, setDoc, serverTimestamp } =
                await getFirebaseFirestore();
            // One entry per user — upsert
            await setDoc(doc(db, `project_leaderboard/${projectId}/entries`, String(user.id)), {
                score:      parsed,
                notes:      notes.trim(),
                authorName: user?.full_name || user?.username || user?.email?.split('@')[0] || 'Anonymous',
                authorId:   user.id,
                submittedAt: serverTimestamp(),
            });
            setScore('');
            setNotes('');
            setSuccess('Score submitted! Your entry is on the leaderboard.');
        } catch {
            setError('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Parse the minimum passing value from minimumScore string (first number)
    const minVal = minimumScore
        ? parseFloat(minimumScore.match(/[\d.]+/)?.[0] || '0')
        : null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-2 text-[0.7rem] font-extrabold uppercase tracking-widest text-amber-400">
                <Trophy size={13} />
                Leaderboard
                {!loading && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-muted text-muted-foreground">{entries.length} submissions</span>
                )}
            </div>

            {/* Minimum score banner */}
            {minimumScore && (
                <div className="rounded-xl p-3.5 border-l-4 border-emerald-400 bg-emerald-400/[0.06] border border-emerald-400/20 text-[0.8rem] text-emerald-500">
                    <span className="font-bold uppercase tracking-widest text-[0.65rem] block mb-1 text-emerald-400">Target to Beat</span>
                    {minimumScore}
                </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border overflow-hidden bg-card border-border">
                {/* Table header */}
                <div className="grid grid-cols-[40px_1fr_100px_auto] gap-3 px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest border-b border-border text-muted-foreground/70">
                    <span>#</span>
                    <span>Name</span>
                    <span className="text-right">Score</span>
                    <span className="text-right">When</span>
                </div>

                {loading && (
                    <div className="px-4 py-6 text-[0.82rem] text-muted-foreground/70">Loading…</div>
                )}

                {!loading && entries.length === 0 && (
                    <div className="px-4 py-8 text-center text-muted-foreground/70">
                        <Trophy size={28} className="mx-auto mb-2 opacity-20" />
                        <p className="text-[0.83rem]">No submissions yet. Be the first!</p>
                    </div>
                )}

                {entries.map((entry, i) => {
                    const isMe = user?.id === entry.authorId;
                    const rowStyle = i < 3 ? RANK_STYLES[i] : null;
                    const passes = minVal && entry.score >= minVal;
                    return (
                        <div
                            key={entry.id}
                            className={`grid grid-cols-[40px_1fr_100px_auto] gap-3 items-center px-4 py-3 border-b last:border-0 transition-colors ${
                                isMe
                                    ? 'bg-primary/[0.08] border-primary/10'
                                    : 'border-border hover:bg-muted'
                            }`}>
                            {/* Rank */}
                            <span className={`text-[0.8rem] font-black text-center ${rowStyle ? rowStyle.text : 'text-muted-foreground/70'}`}>
                                {rowStyle ? rowStyle.label : `${i + 1}`}
                            </span>

                            {/* Name + notes */}
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[0.83rem] font-bold truncate text-foreground">
                                        {entry.authorName}
                                    </span>
                                    {isMe && (
                                        <span className="text-[0.6rem] font-black bg-primary/20 text-primary px-1.5 py-0.5 rounded-full whitespace-nowrap">You</span>
                                    )}
                                </div>
                                {entry.notes && (
                                    <p className="text-[0.72rem] truncate mt-0.5 text-muted-foreground">
                                        {entry.notes}
                                    </p>
                                )}
                            </div>

                            {/* Score */}
                            <div className="text-right">
                                <ScoreBadge score={entry.score} minimumScore={minimumScore} />
                                {passes !== null && (
                                    <span className={`block text-[0.6rem] font-bold mt-0.5 ${passes ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {passes ? '✓ Passes' : '✗ Below target'}
                                    </span>
                                )}
                            </div>

                            {/* Time */}
                            <span className="text-[0.7rem] whitespace-nowrap text-right text-muted-foreground/70">
                                {timeAgo(entry.submittedAt)}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Submit form */}
            {user ? (
                <div className="rounded-2xl border p-5 space-y-4 bg-card border-border">
                    <p className="text-[0.7rem] font-black uppercase tracking-widest text-muted-foreground/70">
                        {userEntry ? 'Update Your Score' : 'Submit Your Score'}
                    </p>

                    {userEntry && (
                        <div className="text-[0.78rem] px-3 py-2 rounded-lg bg-primary/10 text-primary">
                            Your current score: <strong>{(userEntry.score * 100).toFixed(1)}%</strong>. Submitting again will overwrite it.
                        </div>
                    )}

                    <div className="flex gap-3 flex-wrap">
                        <div className="flex flex-col gap-1">
                            <label className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground/70">
                                Primary Score (0–1)
                            </label>
                            <input
                                type="number"
                                min="0" max="1" step="0.001"
                                value={score}
                                onChange={e => setScore(e.target.value)}
                                placeholder="e.g. 0.872"
                                className="w-36 px-3 py-2 rounded-lg text-[0.85rem] font-mono border outline-none focus:ring-1 focus:ring-primary bg-muted border-border text-foreground/80"
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 160 }}>
                            <label className="text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground/70">
                                Method / Notes (optional)
                            </label>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                maxLength={500}
                                placeholder="e.g. RoBERTa + SMOTE, no external data"
                                className="w-full px-3 py-2 rounded-lg text-[0.85rem] border outline-none focus:ring-1 focus:ring-primary bg-muted border-border text-foreground/80"
                            />
                        </div>
                    </div>

                    {error   && <p className="text-[0.78rem] text-rose-400">{error}</p>}
                    {success && <p className="text-[0.78rem] text-emerald-400">{success}</p>}

                    <button
                        onClick={handleSubmit}
                        disabled={!score || submitting}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg text-[0.82rem] font-bold bg-accent text-black hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <Trophy size={14} />{submitting ? 'Submitting…' : userEntry ? 'Update Score' : 'Submit to Leaderboard'}
                    </button>
                </div>
            ) : (
                <div className="rounded-2xl p-5 text-center border bg-muted border-border text-muted-foreground/70">
                    <LogIn size={18} className="mx-auto mb-2 opacity-50" />
                    <p className="text-[0.82rem]">Log in to submit your score to the leaderboard.</p>
                </div>
            )}
        </div>
    );
}
