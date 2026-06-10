import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, User, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getFirebaseFirestore } from '../lib/firebase';

function timeAgo(ts) {
    if (!ts) return '';
    const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
    if (secs < 60)   return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
}

function Avatar({ name, size = 32 }) {
    const initials = (name || '?')
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    // Deterministic colour from name
    const hue = [...(name || '')].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
    return (
        <div
            style={{ width: size, height: size, background: `hsl(${hue},55%,45%)`, flexShrink: 0 }}
            className="rounded-full flex items-center justify-center text-white font-black text-[0.65rem]">
            {initials}
        </div>
    );
}

export default function ProjectComments({ projectId, isDark }) {
    const [comments, setComments]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const [text, setText]           = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError]         = useState('');
    const bottomRef = useRef(null);
    const { user } = useAuth();

    // Real-time listener
    useEffect(() => {
        let unsub;
        (async () => {
            try {
                const { db, collection, query, orderBy, onSnapshot } =
                    await getFirebaseFirestore();
                const q = query(
                    collection(db, `project_comments/${projectId}/comments`),
                    orderBy('createdAt', 'asc')
                );
                unsub = onSnapshot(q, snap => {
                    setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setLoading(false);
                });
            } catch {
                setLoading(false);
            }
        })();
        return () => unsub && unsub();
    }, [projectId]);

    const handleSubmit = async () => {
        const trimmed = text.trim();
        if (!trimmed || submitting) return;
        // Basic sanity: max 1000 chars
        if (trimmed.length > 1000) { setError('Comment must be under 1000 characters.'); return; }
        setError('');
        setSubmitting(true);
        try {
            const { db, collection, addDoc, serverTimestamp } =
                await getFirebaseFirestore();
            await addDoc(collection(db, `project_comments/${projectId}/comments`), {
                text:       trimmed,
                authorName: user?.full_name || user?.username || user?.email?.split('@')[0] || 'Anonymous',
                authorId:   user?.id ?? null,
                createdAt:  serverTimestamp(),
            });
            setText('');
            // Scroll to bottom after new comment renders
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch {
            setError('Failed to post comment. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleKey = e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className={`flex items-center gap-2 text-[0.7rem] font-extrabold uppercase tracking-widest text-violet-400`}>
                <MessageSquare size={13} />
                Discussion
                {!loading && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-muted text-muted-foreground">{comments.length}</span>
                )}
            </div>

            {/* Comment list */}
            <div className="space-y-3">
                {loading && (
                    <div className="text-[0.82rem] text-muted-foreground/70">Loading comments…</div>
                )}
                {!loading && comments.length === 0 && (
                    <div className="rounded-2xl p-8 text-center border border-dashed border-border text-muted-foreground/70">
                        <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="text-[0.83rem] font-medium">No comments yet.</p>
                        <p className="text-[0.75rem] mt-1">Be the first to share your approach or ask a question.</p>
                    </div>
                )}
                {comments.map(c => (
                    <div key={c.id} className="flex gap-3 p-4 rounded-xl border bg-muted border-border">
                        <Avatar name={c.authorName} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-1.5">
                                <span className="text-[0.8rem] font-bold text-foreground">
                                    {c.authorName}
                                </span>
                                <span className="text-[0.7rem] text-muted-foreground/70">
                                    {timeAgo(c.createdAt)}
                                </span>
                            </div>
                            <p className="text-[0.85rem] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">{c.text}</p>
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Compose area */}
            {user ? (
                <div className="rounded-2xl border overflow-hidden bg-card border-border">
                    <div className="flex gap-3 p-4">
                        <Avatar name={user?.full_name || user?.username || user?.email} />
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={handleKey}
                            placeholder="Share your approach, ask a question, or give feedback… (Ctrl+Enter to send)"
                            rows={3}
                            maxLength={1000}
                             className="flex-1 resize-none text-[0.85rem] leading-relaxed bg-transparent outline-none placeholder:opacity-40 text-foreground/80"
                        />
                    </div>
                    {error && (
                        <p className="px-4 pb-2 text-[0.75rem] text-red-400">{error}</p>
                    )}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                        <span className="text-[0.7rem] text-muted-foreground/70">
                            {text.length}/1000 · Ctrl+Enter to post
                        </span>
                        <button
                            onClick={handleSubmit}
                            disabled={!text.trim() || submitting}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[0.8rem] font-bold bg-violet-500 text-white hover:bg-violet-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            <Send size={13} />{submitting ? 'Posting…' : 'Post'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl p-5 text-center border bg-muted border-border text-muted-foreground/70">
                    <LogIn size={18} className="mx-auto mb-2 opacity-50" />
                    <p className="text-[0.82rem]">Log in to join the discussion.</p>
                </div>
            )}
        </div>
    );
}
