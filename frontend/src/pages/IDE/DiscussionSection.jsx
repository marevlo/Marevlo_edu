
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Send, ThumbsUp, MessageCircle, Trash2, ChevronDown, ChevronUp, Pencil, Copy, CheckCircle, Eye, EyeOff, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MAX_POST_LENGTH = 600;
const MAX_REPLY_LENGTH = 300;
const EDIT_WINDOW_MS   = 15 * 60 * 1000;   // 15 min edit window
const REACTIONS        = ['\u{1F44D}', '\u{1F4A1}', '\u{1F914}', '\u{1F602}'];

/* ─── Helpers ─── */
function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60)     return 'Just now';
    if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
}
function fullDate(d) { return new Date(d).toLocaleString(); }
function hotScore(post) {
    const ageSec = (Date.now() - new Date(post.created_at)) / 1000;
    const score  = (post.upvotes || 0) + (post.replies?.length || 0) * 2;
    return ageSec < 604800 ? score : score * 0.3;   // decay posts older than 7 days
}

/* ─── Code Block Renderer ─── */
function parseContent(text) {
    const parts = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIdx = 0, match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIdx) parts.push({ type: 'text', content: text.slice(lastIdx, match.index) });
        parts.push({ type: 'code', lang: match[1] || 'text', content: match[2].trimEnd() });
        lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) parts.push({ type: 'text', content: text.slice(lastIdx) });
    return parts.length ? parts : [{ type: 'text', content: text }];
}

function CodeBlock({ lang, code }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    };
    return (
        <div style={{ position: 'relative', margin: '8px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 12px', background: 'var(--color-app-bg)', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted-text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lang}</span>
                <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#41bd78' : 'var(--color-muted-text)', padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {copied ? <><Check size={10} /> Copied!</> : <><Copy size={10} /> Copy</>}
                </button>
            </div>
            <pre style={{ margin: 0, padding: '12px 14px', background: 'var(--color-app-bg)', color: 'var(--color-primary-text)', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre' }}>
                <code>{code}</code>
            </pre>
        </div>
    );
}

const READ_MORE_THRESHOLD = 220;
function ContentRenderer({ text, collapsed, onExpand }) {
    const parts  = parseContent(text);
    const isLong = text.length > READ_MORE_THRESHOLD;
    const display = collapsed && isLong
        ? [{ type: 'text', content: text.slice(0, READ_MORE_THRESHOLD) + '\u2026' }]
        : parts;
    return (
        <div>
            {display.map((part, i) =>
                part.type === 'code'
                    ? <CodeBlock key={i} lang={part.lang} code={part.content} />
                    : <p key={i} style={{ fontSize: 13, color: 'var(--color-primary-text)', lineHeight: 1.62, margin: '0 0 4px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{part.content}</p>
            )}
            {collapsed && isLong && (
                <button onClick={onExpand} style={{ fontSize: 11, fontWeight: 700, color: '#6672e0', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2 }}>
                    Read more \u2193
                </button>
            )}
        </div>
    );
}

/* ─── Avatar ─── */
function Avatar({ name = '?', size = 32 }) {
    const initials = (name || '?').slice(0, 2).toUpperCase();
    const hue = [...(name || '?')].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg,hsl(${hue},55%,56%),hsl(${(hue+60)%360},55%,44%))`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: size * 0.35,
            letterSpacing: '-0.02em', userSelect: 'none',
        }}>{initials}</div>
    );
}

/* ─── Tags ─── */
const TAGS = [
    { id: 'question',    label: '\u2753 Question',    color: '#5d8ede', bg: 'rgba(93,142,222,0.1)'  },
    { id: 'approach',    label: '\u{1F9E0} Approach',    color: '#9180e8', bg: 'rgba(145,128,232,0.1)'  },
    { id: 'walkthrough', label: '\u{1F4D6} Walkthrough', color: '#41bd78', bg: 'rgba(65,189,120,0.1)'  },
    { id: 'bug',         label: '\u{1F41B} Bug',          color: '#e06661', bg: 'rgba(224,102,97,0.1)'   },
];

function TagBadge({ tagId, small = false }) {
    const tag = TAGS.find(t => t.id === tagId);
    if (!tag) return null;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: small ? '2px 7px' : '3px 9px', borderRadius: 20,
            fontSize: small ? 9 : 10, fontWeight: 700, color: tag.color,
            background: tag.bg, border: `1px solid ${tag.color}28`,
            whiteSpace: 'nowrap', letterSpacing: '0.01em',
        }}>{tag.label}</span>
    );
}

/* ─── Toast ─── */
function Toast({ message, onUndo, onDismiss }) {
    useEffect(() => { const t = setTimeout(onDismiss, 3800); return () => clearTimeout(t); }, [onDismiss]);
    return (
        <div style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            background: '#18181b', color: '#fff', borderRadius: 14,
            padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 9999,
            fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap',
            animation: 'dsSlideUp 0.28s ease',
        }}>
            <span>{message}</span>
            {onUndo && (
                <button onClick={onUndo} style={{
                    background: '#6672e0', border: 'none', borderRadius: 8,
                    color: '#fff', padding: '5px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
                }}>Undo</button>
            )}
        </div>
    );
}

/* ─── Skeleton ─── */
function SkeletonPost() {
    return (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', animation: 'dsPulse 1.6s ease-in-out infinite' }}>
            <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ width: 80, height: 10, borderRadius: 6, background: 'var(--color-border)' }} />
                        <div style={{ width: 40, height: 10, borderRadius: 6, background: 'var(--color-border)' }} />
                    </div>
                    <div style={{ width: '90%', height: 10, borderRadius: 6, background: 'var(--color-border)' }} />
                    <div style={{ width: '70%', height: 10, borderRadius: 6, background: 'var(--color-border)' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <div style={{ width: 50, height: 22, borderRadius: 8, background: 'var(--color-border)' }} />
                        <div style={{ width: 50, height: 22, borderRadius: 8, background: 'var(--color-border)' }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Reply Card ─── */
function ReplyCard({ reply, currentUsername, onDelete, onUpvote, onAccept, isPostOwner, onReact }) {
    const [hovered, setHovered] = useState(false);
    const isOwn    = currentUsername && currentUsername === reply.author;
    const canAccept = isPostOwner && !reply.isAccepted;
    const reacts   = reply.reactions   || {};
    const myReacts = reply.myReactions || [];

    return (
        <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{ display: 'flex', gap: 9, padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
            <Avatar name={reply.author} size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary-text)' }}>{reply.author}</span>
                    <span title={fullDate(reply.created_at || reply.timestamp)} style={{ fontSize: 10, color: 'var(--color-muted-text)' }}>
                        {timeAgo(reply.created_at || reply.timestamp)}
                    </span>
                    {reply.isAccepted && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#41bd78', background: 'rgba(65,189,120,0.12)', padding: '2px 7px', borderRadius: 20, border: '1px solid rgba(65,189,120,0.25)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <CheckCircle size={9} fill="#41bd78" /> Accepted
                        </span>
                    )}
                </div>

                <p style={{ fontSize: 12, color: 'var(--color-primary-text)', lineHeight: 1.55, margin: '0 0 8px', wordBreak: 'break-word' }}>
                    {reply.content}
                </p>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Upvote */}
                    <button onClick={() => onUpvote(reply.id)} aria-pressed={reply.isUpvoted} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8,
                        border: `1px solid ${reply.isUpvoted ? '#6672e0' : 'var(--color-border)'}`,
                        background: reply.isUpvoted ? 'rgba(102,114,224,0.12)' : 'transparent',
                        color: reply.isUpvoted ? '#6672e0' : 'var(--color-muted-text)',
                        fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s',
                    }}>
                        <ThumbsUp size={10} fill={reply.isUpvoted ? 'currentColor' : 'none'} />
                        {reply.upvotes || 0}
                    </button>

                    {/* Emoji reactions */}
                    {REACTIONS.map(emoji => {
                        const count  = reacts[emoji] || 0;
                        const active = myReacts.includes(emoji);
                        return (
                            <button key={emoji} onClick={() => onReact(reply.id, emoji)} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 20,
                                border: `1px solid ${active ? '#6672e0' : 'var(--color-border)'}`,
                                background: active ? 'rgba(102,114,224,0.1)' : 'transparent',
                                fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
                                color: count > 0 ? 'var(--color-primary-text)' : 'var(--color-muted-text)',
                                lineHeight: 1,
                            }}>
                                {emoji}{count > 0 && <span style={{ fontSize: 10, fontWeight: 600 }}>{count}</span>}
                            </button>
                        );
                    })}

                    {/* Accept answer (only post owner sees this) */}
                    {(canAccept || reply.isAccepted) && (
                        <button onClick={() => canAccept && onAccept(reply.id)} title={canAccept ? 'Mark as accepted answer' : 'Accepted answer'} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8,
                            border: `1px solid ${reply.isAccepted ? '#41bd78' : 'var(--color-border)'}`,
                            background: reply.isAccepted ? 'rgba(65,189,120,0.1)' : 'transparent',
                            color: reply.isAccepted ? '#41bd78' : 'var(--color-muted-text)',
                            fontSize: 10, fontWeight: 600, cursor: canAccept ? 'pointer' : 'default', transition: 'all 0.18s',
                        }}>
                            <CheckCircle size={10} />{reply.isAccepted ? 'Accepted' : 'Accept'}
                        </button>
                    )}
                </div>
            </div>

            {isOwn && hovered && (
                <button onClick={() => onDelete(reply.id)} title="Delete reply" style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
                    borderRadius: 6, color: '#e06661', opacity: 0.75, flexShrink: 0, alignSelf: 'flex-start',
                }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.75'}>
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    );
}

/* ─── Post Card ─── */
function PostCard({ post, currentUsername, onUpvote, onDelete, onEdit, onReplyUpvote, onReplyDelete, onAddReply, onMarkAccepted, onReplyReact }) {
    const [showReplies,   setShowReplies]   = useState(false);
    const [replyOpen,     setReplyOpen]     = useState(false);
    const [replyText,     setReplyText]     = useState('');
    const [submitting,    setSubmitting]    = useState(false);
    const [collapsed,     setCollapsed]     = useState(true);       // read-more
    const [revealed,      setRevealed]      = useState(false);      // spoiler
    const [editing,       setEditing]       = useState(false);
    const [editText,      setEditText]      = useState(post.content);
    const [editSaving,    setEditSaving]    = useState(false);
    const [copied,        setCopied]        = useState(false);
    const replyRef = useRef(null);

    const isOwn      = currentUsername && currentUsername === post.author;
    const replyCount = post.replies?.length || 0;
    const canEdit    = isOwn && (Date.now() - new Date(post.created_at)) < EDIT_WINDOW_MS;
    const hasAccepted = post.replies?.some(r => r.isAccepted);

    const submitReply = async () => {
        if (!replyText.trim() || submitting) return;
        setSubmitting(true);
        await onAddReply(post.id, replyText.trim());
        setReplyText(''); setReplyOpen(false); setShowReplies(true);
        setSubmitting(false);
    };

    const handleReplyKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitReply();
        if (e.key === 'Escape') { setReplyOpen(false); setReplyText(''); }
    };

    const handleShare = () => {
        const base = window.location.href.split('?')[0];
        navigator.clipboard.writeText(`${base}?tab=discussion&post=${post.id}`)
            .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    };

    const handleSaveEdit = async () => {
        if (!editText.trim() || editSaving) return;
        setEditSaving(true);
        await onEdit(post.id, editText.trim());
        setEditing(false);
        setEditSaving(false);
    };

    useEffect(() => { if (replyOpen && replyRef.current) replyRef.current.focus(); }, [replyOpen]);

    return (
        <div style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ display: 'flex', gap: 10, padding: '14px 16px' }}>

                {/* Upvote column */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, width: 32, paddingTop: 2 }}>
                    <button onClick={() => onUpvote(post.id)} aria-pressed={post.isUpvoted} title="Upvote" style={{
                        width: 28, height: 28, borderRadius: 8, border: 'none',
                        background: post.isUpvoted ? 'rgba(102,114,224,0.15)' : 'var(--color-surface-hover)',
                        color: post.isUpvoted ? '#6672e0' : 'var(--color-muted-text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.18s',
                        transform: post.isUpvoted ? 'scale(1.12)' : 'scale(1)',
                    }}
                        onMouseEnter={e => { if (!post.isUpvoted) e.currentTarget.style.background = 'rgba(102,114,224,0.1)'; }}
                        onMouseLeave={e => { if (!post.isUpvoted) e.currentTarget.style.background = 'var(--color-surface-hover)'; }}>
                        <ThumbsUp size={13} fill={post.isUpvoted ? 'currentColor' : 'none'} />
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 700, color: post.isUpvoted ? '#6672e0' : 'var(--color-muted-text)', lineHeight: 1 }}>
                        {post.upvotes || 0}
                    </span>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Avatar name={post.author} size={22} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary-text)' }}>{post.author}</span>
                            <span title={fullDate(post.created_at || post.timestamp)} style={{ fontSize: 10, color: 'var(--color-muted-text)' }}>
                                {timeAgo(post.created_at || post.timestamp)}
                            </span>
                            {post.isEdited && <span style={{ fontSize: 9, color: 'var(--color-muted-text)', fontStyle: 'italic' }}>edited</span>}
                            {post.isSpoiler && !revealed && <span style={{ fontSize: 9, fontWeight: 700, color: '#e0a050' }}>🚫 Spoiler</span>}
                            {post.tag && <TagBadge tagId={post.tag} small />}
                            {post.isPinned && (
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#e0a050', background: 'rgba(224,160,80,0.12)', padding: '2px 7px', borderRadius: 20, border: '1px solid rgba(224,160,80,0.25)' }}>
                                    📌 PINNED
                                </span>
                            )}
                            {hasAccepted && (
                                <span style={{ fontSize: 9, fontWeight: 800, color: '#41bd78', background: 'rgba(65,189,120,0.1)', padding: '2px 7px', borderRadius: 20, border: '1px solid rgba(65,189,120,0.25)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    <CheckCircle size={9} fill="#41bd78" /> Solved
                                </span>
                            )}
                        </div>

                        {/* Icon buttons: share, edit, delete */}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button onClick={handleShare} title="Copy link to post" style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 6,
                                color: copied ? '#41bd78' : 'var(--color-muted-text)', opacity: 0.65,
                            }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '0.65'}>
                                {copied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                            {canEdit && !editing && (
                                <button onClick={() => { setEditing(true); setEditText(post.content); }} title="Edit post (within 15 min)" style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 6,
                                    color: 'var(--color-muted-text)', opacity: 0.65,
                                }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.65'}>
                                    <Pencil size={12} />
                                </button>
                            )}
                            {isOwn && (
                                <button onClick={() => onDelete(post.id)} title="Delete post" style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 6,
                                    color: '#e06661', opacity: 0.55,
                                }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}>
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Body: inline edit / spoiler / normal */}
                    {editing ? (
                        <div style={{ marginBottom: 10 }}>
                            <textarea
                                value={editText}
                                onChange={e => setEditText(e.target.value.slice(0, MAX_POST_LENGTH))}
                                rows={4}
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #6672e0',
                                    background: 'var(--color-surface-hover)', color: 'var(--color-primary-text)',
                                    fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                                <button onClick={() => setEditing(false)} style={{
                                    padding: '5px 12px', borderRadius: 7, border: '1px solid var(--color-border)',
                                    background: 'transparent', color: 'var(--color-muted-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                }}>Cancel</button>
                                <button onClick={handleSaveEdit} disabled={editSaving || !editText.trim()} style={{
                                    padding: '5px 14px', borderRadius: 7, border: 'none',
                                    background: editText.trim() ? '#6672e0' : 'var(--color-surface-hover)',
                                    color: editText.trim() ? '#fff' : 'var(--color-muted-text)',
                                    fontSize: 11, fontWeight: 700, cursor: editText.trim() ? 'pointer' : 'default',
                                }}>{editSaving ? 'Saving\u2026' : 'Save'}</button>
                            </div>
                        </div>
                    ) : post.isSpoiler && !revealed ? (
                        /* ── Spoiler blur ── */
                        <div style={{ position: 'relative', marginBottom: 10, borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ filter: 'blur(5px)', userSelect: 'none', fontSize: 13, color: 'var(--color-primary-text)', lineHeight: 1.62, padding: '4px 0' }}>
                                {post.content.slice(0, 140)}\u2026
                            </div>
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <button onClick={() => setRevealed(true)} style={{
                                    padding: '7px 18px', borderRadius: 10, border: 'none',
                                    background: 'rgba(102,114,224,0.85)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(4px)',
                                }}>
                                    <Eye size={13} /> Reveal Spoiler
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ── Normal content with read-more ── */
                        <div style={{ marginBottom: 10 }}>
                            <ContentRenderer text={post.content} collapsed={collapsed} onExpand={() => setCollapsed(false)} />
                        </div>
                    )}

                    {/* Action row */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => { setReplyOpen(o => !o); if (!replyOpen) setShowReplies(true); }} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8,
                            border: `1px solid ${replyOpen ? '#5d8ede' : 'var(--color-border)'}`,
                            background: replyOpen ? 'rgba(93,142,222,0.1)' : 'transparent',
                            color: replyOpen ? '#5d8ede' : 'var(--color-muted-text)',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s',
                        }}>
                            <MessageCircle size={12} />Reply
                        </button>
                        {replyCount > 0 && (
                            <button onClick={() => setShowReplies(s => !s)} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8,
                                border: '1px solid var(--color-border)', background: 'transparent',
                                color: 'var(--color-muted-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}>
                                {showReplies ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                            </button>
                        )}
                    </div>

                    {/* Reply compose */}
                    {replyOpen && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start', animation: 'dsSlideDown 0.2s ease' }}>
                            {currentUsername && <Avatar name={currentUsername} size={26} />}
                            <div style={{ flex: 1 }}>
                                <textarea ref={replyRef} value={replyText}
                                    onChange={e => setReplyText(e.target.value.slice(0, MAX_REPLY_LENGTH))}
                                    onKeyDown={handleReplyKeyDown}
                                    placeholder="Write a reply\u2026 (Ctrl+Enter to send)" rows={2} style={{
                                        width: '100%', padding: '8px 10px', borderRadius: 8,
                                        border: '1px solid var(--color-border)', background: 'var(--color-surface-hover)',
                                        color: 'var(--color-primary-text)', fontSize: 12, fontFamily: 'inherit',
                                        resize: 'none', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
                                    }}
                                    onFocus={e => e.currentTarget.style.borderColor = '#6672e0'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                    <span style={{ fontSize: 10, color: replyText.length > MAX_REPLY_LENGTH * 0.85 ? '#e06661' : 'var(--color-muted-text)' }}>
                                        {replyText.length}/{MAX_REPLY_LENGTH}
                                    </span>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => { setReplyOpen(false); setReplyText(''); }} style={{
                                            padding: '5px 12px', borderRadius: 7, border: '1px solid var(--color-border)',
                                            background: 'transparent', color: 'var(--color-muted-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                        }}>Cancel</button>
                                        <button onClick={submitReply} disabled={!replyText.trim() || submitting} style={{
                                            padding: '5px 14px', borderRadius: 7, border: 'none',
                                            background: replyText.trim() ? '#5d8ede' : 'var(--color-surface-hover)',
                                            color: replyText.trim() ? '#fff' : 'var(--color-muted-text)',
                                            fontSize: 11, fontWeight: 700, cursor: replyText.trim() ? 'pointer' : 'default',
                                            display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.18s',
                                        }}>
                                            <Send size={11} />{submitting ? 'Posting\u2026' : 'Reply'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Replies list */}
                    {showReplies && replyCount > 0 && (
                        <div style={{ marginTop: 10, paddingLeft: 8, borderLeft: '2px solid var(--color-border)' }}>
                            {post.replies.map(reply => (
                                <ReplyCard key={reply.id} reply={reply} currentUsername={currentUsername}
                                    onDelete={rId => onReplyDelete(post.id, rId)}
                                    onUpvote={rId => onReplyUpvote(post.id, rId)}
                                    onAccept={rId => onMarkAccepted(post.id, rId)}
                                    isPostOwner={isOwn}
                                    onReact={(rId, emoji) => onReplyReact(post.id, rId, emoji)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════
   Backend Response Normalization (snake_case → camelCase)
═══════════════════════════════════ */
function normalizeReply(reply) {
    if (!reply) return reply;
    return {
        id: reply.id,
        author: reply.author,
        content: reply.content,
        upvotes: reply.upvotes,
        isUpvoted: reply.isUpvoted ?? reply.is_upvoted ?? false,
        isAccepted: reply.isAccepted ?? reply.is_accepted ?? false,
        reactions: reply.reactions || {},
        myReactions: reply.myReactions ?? reply.my_reactions ?? [],
        createdAt: reply.createdAt ?? reply.created_at,
    };
}

function normalizePost(post) {
    if (!post) return post;
    return {
        id: post.id,
        author: post.author,
        content: post.content,
        tag: post.tag,
        isSpoiler: post.isSpoiler ?? post.is_spoiler ?? false,
        isPinned: post.isPinned ?? post.is_pinned ?? false,
        isEdited: post.isEdited ?? post.is_edited ?? false,
        upvotes: post.upvotes,
        isUpvoted: post.isUpvoted ?? post.is_upvoted ?? false,
        replies: (post.replies || []).map(normalizeReply),
        createdAt: post.createdAt ?? post.created_at,
    };
}

/* ═══════════════════════════════════
   Main Component
═══════════════════════════════════ */
const DiscussionSection = memo(({ problem }) => {
    const { user, apiCall } = useAuth();
    const currentUsername = user?.username || user?.email?.split('@')[0] || null;

    const [posts,          setPosts]          = useState([]);
    const [loading,        setLoading]        = useState(true);
    const [sortBy,         setSortBy]         = useState('top');
    const [activeTag,      setActiveTag]      = useState(null);
    const [composeText,    setComposeText]    = useState('');
    const [composeTag,     setComposeTag]     = useState(null);
    const [composeSpoiler, setComposeSpoiler] = useState(false);
    const [isSubmitting,   setIsSubmitting]   = useState(false);
    const [loginHint,      setLoginHint]      = useState(false);
    const [toast,          setToast]          = useState(null);
    const [onlineCount,    setOnlineCount]    = useState(null);
    const [mentionQuery,   setMentionQuery]   = useState(null);
    const [mentionPos,     setMentionPos]     = useState(null);
    const textareaRef  = useRef(null);

    const problemId = problem?.id || problem?.slug;

    /* ─── Online count polling (30s) ─── */
    useEffect(() => {
        if (!problemId) return;
        const poll = async () => {
            try {
                const token = localStorage.getItem('access_token');
                const headers = token ? { Authorization: `Bearer ${token}` } : {};
                const res = await fetch(`${import.meta.env.VITE_API_URL}/problems/${problemId}/online`, { headers });
                if (res.ok) { const d = await res.json(); setOnlineCount(d.count ?? null); }
            } catch { /* backend may not implement this yet */ }
        };
        poll();
        const id = setInterval(poll, 30000);
        return () => clearInterval(id);
    }, [problemId]);

    /* ─── Load posts ─── */
    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(
                `${import.meta.env.VITE_API_URL}/problems/${problemId}/discussions`,
                { headers }
            );
            if (!res.ok) throw new Error();
            const data = await res.json();
            // Handle both { posts: [...] } and direct array responses
            const postsList = data.posts || data.discussions || data || [];
            setPosts(postsList.map(p => normalizePost(p)));
        } catch {
            setPosts([]);
        } finally {
            setLoading(false);
        }
    }, [problemId]);

    useEffect(() => { if (problemId) fetchPosts(); else setLoading(false); }, [fetchPosts, problemId]);

    /* ─── Auto-resize textarea ─── */
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }, [composeText]);

    /* ─── @mention helpers ─── */
    const knownUsers = [...new Set(posts.flatMap(p => [p.author, ...(p.replies || []).map(r => r.author)]))].filter(Boolean);

    const handleComposeChange = (e) => {
        const val    = e.target.value.slice(0, MAX_POST_LENGTH);
        const cursor = e.target.selectionStart;
        setComposeText(val);
        const before = val.slice(0, cursor);
        const match  = before.match(/@(\w*)$/);
        if (match) { setMentionQuery(match[1].toLowerCase()); setMentionPos(cursor - match[0].length); }
        else       { setMentionQuery(null); setMentionPos(null); }
    };

    const insertMention = (username) => {
        if (mentionPos === null) return;
        const cursor = textareaRef.current?.selectionStart ?? (mentionPos + (mentionQuery?.length ?? 0) + 1);
        const before = composeText.slice(0, mentionPos);
        const after  = composeText.slice(cursor);
        setComposeText(before + `@${username} ` + after);
        setMentionQuery(null);
        setMentionPos(null);
        setTimeout(() => textareaRef.current?.focus(), 0);
    };

    const mentionSuggestions = mentionQuery !== null
        ? knownUsers.filter(u => u.toLowerCase().startsWith(mentionQuery) && u !== currentUsername).slice(0, 5)
        : [];

    /* ─── Submit post ─── */
    const handleSubmitPost = async () => {
        if (!composeText.trim() || isSubmitting) return;
        if (!user) { setLoginHint(true); setTimeout(() => setLoginHint(false), 2800); return; }

        const optimistic = {
            id: `tmp-${Date.now()}`,
            author: currentUsername,
            content: composeText.trim(),
            tag: composeTag,
            isSpoiler: composeSpoiler,
            upvotes: 0, isUpvoted: false, isPinned: false, isEdited: false,
            replies: [],
            createdAt: new Date().toISOString(),
            _optimistic: true,
        };
        setPosts(prev => [optimistic, ...prev]);
        setComposeText(''); setComposeTag(null); setComposeSpoiler(false); setIsSubmitting(true);

        try {
            const data = await apiCall(`/problems/${problemId}/discussions`, {
                method: 'POST',
                body: JSON.stringify({ content: optimistic.content, tag: optimistic.tag, is_spoiler: optimistic.isSpoiler }),
            });
            const normalized = normalizePost(data);
            setPosts(prev => prev.map(p => p.id === optimistic.id ? { ...normalized, replies: [] } : p));
        } catch {
            setPosts(prev => prev.filter(p => p.id !== optimistic.id));
        } finally {
            setIsSubmitting(false);
        }
    };

    /* ─── Edit post ─── */
    const handleEditPost = async (postId, newContent) => {
        const snapshot = posts;
        setPosts(ps => ps.map(p => p.id === postId ? { ...p, content: newContent, isEdited: true } : p));
        try {
            await apiCall(`/problems/${problemId}/discussions/${postId}`, {
                method: 'PATCH',
                body: JSON.stringify({ content: newContent }),
            });
        } catch { setPosts(snapshot); }
    };

    /* ─── Upvote post ─── */
    const handleUpvote = async (postId) => {
        if (!user) { setLoginHint(true); setTimeout(() => setLoginHint(false), 2800); return; }
        setPosts(prev => prev.map(p => p.id === postId
            ? { ...p, isUpvoted: !p.isUpvoted, upvotes: p.isUpvoted ? (p.upvotes - 1) : (p.upvotes + 1) }
            : p));
        try {
            await apiCall(`/problems/${problemId}/discussions/${postId}/upvote`, { method: 'POST' });
        } catch {
            setPosts(prev => prev.map(p => p.id === postId
                ? { ...p, isUpvoted: !p.isUpvoted, upvotes: p.isUpvoted ? (p.upvotes - 1) : (p.upvotes + 1) }
                : p));
        }
    };

    /* ─── Delete post ─── */
    const handleDeletePost = async (postId) => {
        const snapshot = posts;
        setPosts(prev => prev.filter(p => p.id !== postId));
        setToast({ message: 'Post deleted.' });

        try {
            await apiCall(`/problems/${problemId}/discussions/${postId}`, { method: 'DELETE' });
        } catch {
            setPosts(snapshot);
            setToast({ message: 'Could not delete post.' });
        }
    };

    /* ─── Add reply ─── */
    const handleAddReply = async (postId, content) => {
        if (!user) { setLoginHint(true); setTimeout(() => setLoginHint(false), 2800); return; }
        const optimistic = {
            id: `tmp-${Date.now()}`, author: currentUsername, content,
            upvotes: 0, isUpvoted: false, isAccepted: false, reactions: {}, myReactions: [],
            createdAt: new Date().toISOString(), _optimistic: true,
        };
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, replies: [...p.replies, optimistic] } : p));
        try {
            const data = await apiCall(`/problems/${problemId}/discussions/${postId}/replies`, {
                method: 'POST', body: JSON.stringify({ content }),
            });
            const normalized = normalizeReply(data);
            setPosts(prev => prev.map(p => p.id === postId
                ? { ...p, replies: p.replies.map(r => r.id === optimistic.id ? normalized : r) }
                : p));
        } catch {
            setPosts(prev => prev.map(p => p.id === postId
                ? { ...p, replies: p.replies.filter(r => r.id !== optimistic.id) }
                : p));
        }
    };

    /* ─── Reply upvote ─── */
    const handleReplyUpvote = async (postId, replyId) => {
        if (!user) { setLoginHint(true); setTimeout(() => setLoginHint(false), 2800); return; }
        setPosts(prev => prev.map(p => p.id === postId ? {
            ...p, replies: p.replies.map(r => r.id === replyId
                ? { ...r, isUpvoted: !r.isUpvoted, upvotes: r.isUpvoted ? r.upvotes - 1 : r.upvotes + 1 }
                : r)
        } : p));
        try {
            await apiCall(`/problems/${problemId}/discussions/${postId}/replies/${replyId}/upvote`, { method: 'POST' });
        } catch {
            setPosts(prev => prev.map(p => p.id === postId ? {
                ...p, replies: p.replies.map(r => r.id === replyId
                    ? { ...r, isUpvoted: !r.isUpvoted, upvotes: r.isUpvoted ? r.upvotes - 1 : r.upvotes + 1 }
                    : r)
            } : p));
        }
    };

    /* ─── Emoji reactions ─── */
    const handleReplyReact = async (postId, replyId, emoji) => {
        if (!user) { setLoginHint(true); setTimeout(() => setLoginHint(false), 2800); return; }
        setPosts(prev => prev.map(p => p.id !== postId ? p : {
            ...p, replies: p.replies.map(r => {
                if (r.id !== replyId) return r;
                const myR   = r.myReactions || [];
                const active = myR.includes(emoji);
                return {
                    ...r,
                    myReactions: active ? myR.filter(e => e !== emoji) : [...myR, emoji],
                    reactions:   { ...r.reactions, [emoji]: Math.max(0, (r.reactions?.[emoji] || 0) + (active ? -1 : 1)) },
                };
            }),
        }));
        try {
            await apiCall(`/problems/${problemId}/discussions/${postId}/replies/${replyId}/react`, {
                method: 'POST', body: JSON.stringify({ emoji }),
            });
        } catch { /* reactions are non-critical; no rollback needed */ }
    };

    /* ─── Mark reply as accepted answer ─── */
    const handleMarkAccepted = async (postId, replyId) => {
        if (!user) return;
        setPosts(prev => prev.map(p => p.id !== postId ? p : {
            ...p, replies: p.replies.map(r => ({ ...r, isAccepted: r.id === replyId ? !r.isAccepted : false })),
        }));
        try {
            await apiCall(`/problems/${problemId}/discussions/${postId}/replies/${replyId}/accept`, { method: 'POST' });
        } catch { /* optimistic; ignore failure */ }
    };

    /* ─── Reply delete ─── */
    const handleReplyDelete = async (postId, replyId) => {
        setPosts(prev => prev.map(p => p.id === postId
            ? { ...p, replies: p.replies.filter(r => r.id !== replyId) }
            : p));
        try { await apiCall(`/problems/${problemId}/discussions/${postId}/replies/${replyId}`, { method: 'DELETE' }); } catch { /* silent */ }
    };

    /* ─── Dismiss toast ─── */
    const dismissToast = useCallback(() => {
        setToast(null);
    }, []);

    /* ─── Derived list ─── */
    const visiblePosts = (() => {
        let list = [...posts];
        if (activeTag) list = list.filter(p => p.tag === activeTag);
        if      (sortBy === 'new')        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        else if (sortBy === 'unanswered') list = list.filter(p => (p.replies?.length || 0) === 0);
        else if (sortBy === 'hot')        list.sort((a, b) => hotScore(b) - hotScore(a));
        else list.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return (b.upvotes || 0) - (a.upvotes || 0);
        });
        return list;
    })();

    const canPost  = composeText.trim().length > 0 && composeText.length <= MAX_POST_LENGTH;
    const overLimit = composeText.length > MAX_POST_LENGTH;

    const handleComposeKeyDown = (e) => {
        if (mentionSuggestions.length > 0 && e.key === 'Escape') { setMentionQuery(null); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmitPost();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-surface)', position: 'relative' }}>

            {/* ── Header ── */}
            <div style={{
                padding: '14px 16px 12px', borderBottom: '1px solid var(--color-border)',
                backdropFilter: 'blur(16px)', flexShrink: 0,
                background: 'color-mix(in srgb, var(--color-surface) 90%, transparent)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-primary-text)', margin: 0, letterSpacing: '-0.01em' }}>
                            Discussions
                        </h2>
                        <p style={{ fontSize: 11, color: 'var(--color-muted-text)', margin: '2px 0 0', fontWeight: 500 }}>
                            {loading ? 'Loading\u2026' : `${posts.length} post${posts.length !== 1 ? 's' : ''}`}
                            {onlineCount !== null && onlineCount > 0 && (
                                <span style={{ marginLeft: 8, color: '#41bd78', fontWeight: 600 }}>
                                    \u00b7 {onlineCount} viewing now
                                </span>
                            )}
                        </p>
                    </div>
                    <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: user ? '#41bd78' : 'var(--color-border)',
                        boxShadow: user ? '0 0 0 2px rgba(65,189,120,0.2)' : 'none', flexShrink: 0,
                    }} title={user ? 'Signed in' : 'Not signed in'} />
                </div>
            </div>

            {/* ── Compose box ── */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                {/* Tag + Spoiler row */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {TAGS.map(tag => (
                        <button key={tag.id} onClick={() => setComposeTag(composeTag === tag.id ? null : tag.id)} style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                            border: `1px solid ${composeTag === tag.id ? tag.color : 'var(--color-border)'}`,
                            background: composeTag === tag.id ? tag.bg : 'transparent',
                            color: composeTag === tag.id ? tag.color : 'var(--color-muted-text)',
                            cursor: 'pointer', transition: 'all 0.16s', whiteSpace: 'nowrap',
                        }}>{tag.label}</button>
                    ))}
                    {/* Spoiler toggle */}
                    <button onClick={() => setComposeSpoiler(s => !s)} style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${composeSpoiler ? '#e0a050' : 'var(--color-border)'}`,
                        background: composeSpoiler ? 'rgba(224,160,80,0.12)' : 'transparent',
                        color: composeSpoiler ? '#e0a050' : 'var(--color-muted-text)',
                        cursor: 'pointer', transition: 'all 0.16s', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                        {composeSpoiler ? <EyeOff size={10} /> : <Eye size={10} />} Spoiler
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    {user
                        ? <Avatar name={currentUsername} size={30} />
                        : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, position: 'relative' }}>
                        {loginHint && (
                            <div style={{
                                position: 'absolute', left: '50%', top: -40, zIndex: 50, transform: 'translateX(-50%)',
                                background: '#18181b', color: '#fff', borderRadius: 12,
                                padding: '9px 18px', fontSize: 12, fontWeight: 600,
                                boxShadow: '0 6px 24px rgba(0,0,0,0.35)', whiteSpace: 'nowrap',
                                animation: 'dsHintIn 0.25s ease',
                            }}>
                                Sign in to join the discussion
                            </div>
                        )}
                        <textarea
                            ref={textareaRef}
                            value={composeText}
                            onChange={handleComposeChange}
                            onKeyDown={handleComposeKeyDown}
                            onClick={() => { if (!user) { setLoginHint(true); setTimeout(() => setLoginHint(false), 2800); } }}
                            placeholder={user ? 'Share your approach\u2026 use ```python for code blocks | @mention a user | Ctrl+Enter to post' : 'Sign in to join the discussion'}
                            readOnly={!user}
                            rows={2}
                            style={{
                                width: '100%', padding: '9px 12px', borderRadius: 10,
                                border: `1px solid ${overLimit ? '#e06661' : 'var(--color-border)'}`,
                                background: 'var(--color-surface-hover)',
                                color: user ? 'var(--color-primary-text)' : 'var(--color-muted-text)',
                                fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none',
                                boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s',
                                cursor: user ? 'text' : 'pointer',
                            }}
                            onFocus={e => { if (user) e.currentTarget.style.borderColor = '#6672e0'; }}
                            onBlur={e => { e.currentTarget.style.borderColor = overLimit ? '#e06661' : 'var(--color-border)'; }}
                        />

                        {/* @mention dropdown */}
                        {mentionSuggestions.length > 0 && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
                                background: 'var(--color-card-bg)', border: '1px solid var(--color-border)',
                                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                                minWidth: 160, overflow: 'hidden', animation: 'dsSlideDown 0.15s ease',
                            }}>
                                {mentionSuggestions.map(u => (
                                    <button key={u} onMouseDown={() => insertMention(u)} style={{
                                        width: '100%', padding: '8px 14px', border: 'none', background: 'none',
                                        textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                        color: 'var(--color-primary-text)', fontSize: 12, fontWeight: 600,
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                        <Avatar name={u} size={20} />@{u}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                            <span style={{ fontSize: 10, color: overLimit ? '#e06661' : 'var(--color-muted-text)' }}>
                                {composeText.length > 0 && `${composeText.length}/${MAX_POST_LENGTH}`}
                            </span>
                            <button
                                onClick={handleSubmitPost}
                                disabled={!canPost || isSubmitting}
                                style={{
                                    padding: '6px 16px', borderRadius: 9, border: 'none',
                                    background: canPost ? 'linear-gradient(135deg,#6672e0,#5560cf)' : 'var(--color-surface-hover)',
                                    color: canPost ? '#fff' : 'var(--color-muted-text)',
                                    fontSize: 12, fontWeight: 700, cursor: canPost ? 'pointer' : 'default',
                                    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                                    boxShadow: canPost ? '0 3px 12px rgba(102,114,224,0.35)' : 'none',
                                }}
                                onMouseEnter={e => { if (canPost) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <Send size={12} />
                                {isSubmitting ? 'Posting\u2026' : 'Post'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Sort + Filter bar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderBottom: '1px solid var(--color-border)', flexShrink: 0, flexWrap: 'wrap',
            }}>
                {[
                    { id: 'top',        label: '\u{1F525} Top'        },
                    { id: 'hot',        label: '\u{1F4C8} Hot'        },
                    { id: 'new',        label: '\u2728 New'           },
                    { id: 'unanswered', label: '\u{1F4AC} Unanswered' },
                ].map(s => (
                    <button key={s.id} onClick={() => setSortBy(s.id)} style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${sortBy === s.id ? '#6672e0' : 'var(--color-border)'}`,
                        background: sortBy === s.id ? 'rgba(102,114,224,0.12)' : 'transparent',
                        color: sortBy === s.id ? '#6672e0' : 'var(--color-muted-text)',
                        cursor: 'pointer', transition: 'all 0.16s',
                    }}>{s.label}</button>
                ))}

                <div style={{ width: 1, height: 14, background: 'var(--color-border)', margin: '0 2px' }} />

                {TAGS.map(tag => (
                    <button key={tag.id} onClick={() => setActiveTag(activeTag === tag.id ? null : tag.id)} style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${activeTag === tag.id ? tag.color : 'var(--color-border)'}`,
                        background: activeTag === tag.id ? tag.bg : 'transparent',
                        color: activeTag === tag.id ? tag.color : 'var(--color-muted-text)',
                        cursor: 'pointer', transition: 'all 0.16s',
                    }}>{tag.label}</button>
                ))}
            </div>

            {/* ── Posts list ── */}
            <div className="ds-scroll" style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    [1, 2, 3].map(i => <SkeletonPost key={i} />)
                ) : visiblePosts.length === 0 ? (
                    <div style={{ padding: '52px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <MessageCircle size={32} style={{ color: 'var(--color-muted-text)', marginBottom: 14, opacity: 0.35 }} />
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-text)', margin: '0 0 6px' }}>
                            {activeTag || sortBy === 'unanswered' ? 'No posts match your filter' : 'No discussions yet'}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--color-muted-text)', margin: 0 }}>
                            {activeTag || sortBy === 'unanswered' ? 'Try clearing the filters' : 'Be the first to start a discussion!'}
                        </p>
                    </div>
                ) : (
                    visiblePosts.map(post => (
                        <PostCard
                            key={post.id}
                            post={post}
                            currentUsername={currentUsername}
                            onUpvote={handleUpvote}
                            onDelete={handleDeletePost}
                            onEdit={handleEditPost}
                            onAddReply={handleAddReply}
                            onReplyUpvote={handleReplyUpvote}
                            onReplyDelete={handleReplyDelete}
                            onMarkAccepted={handleMarkAccepted}
                            onReplyReact={handleReplyReact}
                        />
                    ))
                )}
            </div>

            {/* ── Toast ── */}
            {toast && <Toast message={toast.message} onUndo={toast.undoFn} onDismiss={dismissToast} />}
        </div>
    );
});

DiscussionSection.displayName = 'DiscussionSection';
export default DiscussionSection;
