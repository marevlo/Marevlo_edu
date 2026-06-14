import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, Loader2, Send, Trash2, CornerDownRight } from 'lucide-react';
import { reelsApi } from './reelsApi';

const isAuthed = () => !!localStorage.getItem('access_token');

/* ReelComments — slide-up comment sheet over the player.
   props: reelId, onClose, onCountChange(total) */
export default function ReelComments({ reelId, onClose, onCountChange }) {
    const [data, setData] = useState(null);   // {comments, total, pages}
    const [text, setText] = useState('');
    const [replyTo, setReplyTo] = useState(null); // {id, author}
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const d = await reelsApi.comments(reelId, 1);
            setData(d);
            onCountChange?.(d.total);
        } catch {
            setData({ comments: [], total: 0, pages: 0 });
        }
    }, [reelId, onCountChange]);

    useEffect(() => { load(); }, [load]);

    const submit = async () => {
        const body = text.trim();
        if (!body) return;
        if (!isAuthed()) { setError('Please sign in to comment.'); return; }
        setBusy(true); setError('');
        try {
            await reelsApi.postComment(reelId, body, replyTo?.id || null);
            setText(''); setReplyTo(null);
            await load();
        } catch (e) {
            setError(e.message || 'Could not post comment');
        } finally { setBusy(false); }
    };

    const toggleLike = async (c) => {
        if (!isAuthed()) { setError('Please sign in to like.'); return; }
        try {
            const r = await reelsApi.likeComment(c.id);
            setData((d) => ({ ...d, comments: mapTree(d.comments, c.id, (x) => ({ ...x, likedByMe: r.on, likeCount: r.count })) }));
        } catch { /* ignore */ }
    };

    const remove = async (c) => {
        if (!window.confirm('Delete this comment?')) return;
        try {
            await reelsApi.deleteComment(c.id);
            await load();
        } catch (e) { setError(e.message); }
    };

    const startReply = (c) => { setReplyTo({ id: c.id, author: c.author }); inputRef.current?.focus(); };

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
            onClick={onClose}>
            <div className="absolute inset-0 bg-black/50" />
            <div onClick={(e) => e.stopPropagation()}
                className="relative w-[min(440px,100vw)] max-h-[72vh] bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl
                           shadow-2xl flex flex-col overflow-hidden">
                {/* header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
                    <h3 className="font-bold text-[15px] text-gray-900 dark:text-white">
                        {data ? `${data.total} comment${data.total === 1 ? '' : 's'}` : 'Comments'}
                    </h3>
                    <button onClick={onClose} aria-label="Close"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* list */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                    {!data && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>}
                    {data && data.comments.length === 0 && (
                        <p className="text-center text-gray-400 py-12 text-sm">No comments yet — be the first.</p>
                    )}
                    {data?.comments.map((c) => (
                        <CommentRow key={c.id} c={c} onLike={toggleLike} onReply={startReply} onDelete={remove} depth={0} />
                    ))}
                </div>

                {/* composer */}
                <div className="border-t border-gray-100 dark:border-zinc-800 px-3 py-2.5">
                    {replyTo && (
                        <div className="flex items-center justify-between text-[11.5px] text-gray-500 mb-1.5 px-1">
                            <span>Replying to <span className="font-semibold">@{replyTo.author}</span></span>
                            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">cancel</button>
                        </div>
                    )}
                    {error && <p className="text-[11.5px] text-rose-500 mb-1.5 px-1">{error}</p>}
                    <div className="flex items-end gap-2">
                        <textarea ref={inputRef} value={text} rows={1}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                            placeholder={isAuthed() ? 'Add a comment…' : 'Sign in to comment'}
                            className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800
                                       px-3 py-2 text-[13px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400
                                       max-h-24" />
                        <button onClick={submit} disabled={busy || !text.trim()} aria-label="Post"
                            className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center
                                       hover:bg-indigo-700 disabled:opacity-40 shrink-0">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function CommentRow({ c, onLike, onReply, onDelete, depth }) {
    return (
        <div className={depth > 0 ? 'pl-7' : ''}>
            <div className="flex gap-2.5">
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {(c.author || '?')[0].toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                    <p className="text-[12.5px]">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">@{c.author}</span>
                        {c.isPinned && <span className="ml-1.5 text-[10px] font-semibold text-amber-600">📌 pinned</span>}
                        <span className="text-gray-400 ml-1.5">{c.time}</span>
                    </p>
                    <p className="text-[13px] text-gray-800 dark:text-gray-200 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                    <div className="flex items-center gap-4 mt-1.5 text-[11.5px] text-gray-500">
                        {depth === 0 && (
                            <button onClick={() => onReply(c)} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
                                <CornerDownRight className="w-3.5 h-3.5" /> Reply
                            </button>
                        )}
                        {c.mine && (
                            <button onClick={() => onDelete(c)} className="flex items-center gap-1 hover:text-rose-500">
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                        )}
                    </div>
                </div>
                <button onClick={() => onLike(c)} className="flex flex-col items-center gap-0.5 text-gray-400 shrink-0">
                    <Heart className={`w-4 h-4 ${c.likedByMe ? 'fill-rose-500 text-rose-500' : ''}`} />
                    {c.likeCount > 0 && <span className="text-[10px]">{c.likeCount}</span>}
                </button>
            </div>
            {(c.replies || []).map((r) => (
                <div className="mt-3" key={r.id}>
                    <CommentRow c={r} onLike={onLike} onReply={onReply} onDelete={onDelete} depth={depth + 1} />
                </div>
            ))}
        </div>
    );
}

// Update a comment in the (one-level) tree by id.
function mapTree(comments, id, fn) {
    return comments.map((c) => {
        if (c.id === id) return fn(c);
        if (c.replies?.length) return { ...c, replies: c.replies.map((r) => (r.id === id ? fn(r) : r)) };
        return c;
    });
}
