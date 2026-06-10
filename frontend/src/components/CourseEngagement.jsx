import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, MessageCircle, Send, Trash2, ChevronDown, LogIn } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL;
const MAX_COMMENT_LENGTH = 500;

/* Helpers */
function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fullDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

function Avatar({ name = '?', size = 34 }) {
  const initials = name.slice(0, 2).toUpperCase();
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: `linear-gradient(135deg, hsl(${hue},60%,55%), hsl(${(hue + 60) % 360},60%,45%))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: size * 0.36,
        letterSpacing: '-0.02em', userSelect: 'none',
      }}
    >
      {initials}
    </div>
  );
}

/* Undo Toast */
function Toast({ message, onUndo, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: '#18181b', color: '#fff', borderRadius: 14,
      padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)', zIndex: 9999,
      fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap',
      animation: 'ceSlideUp 0.3s ease',
    }}>
      <span>{message}</span>
      {onUndo && (
        <button
          onClick={onUndo}
          style={{
            background: '#9180e8', border: 'none', borderRadius: 8,
            color: '#fff', padding: '5px 14px', cursor: 'pointer',
            fontWeight: 700, fontSize: '0.8rem',
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

/* Comment Card */
function CommentCard({ comment, currentUser, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const isOwn = currentUser && currentUser === comment.author;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', gap: 12, padding: '14px 0',
        borderBottom: '1px solid var(--color-border)',
        transition: 'background 0.2s',
      }}
    >
      <Avatar name={comment.author || '?'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span className="text-foreground" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
            {comment.author}
          </span>
          <span
            title={fullDate(comment.created_at || comment.time)}
            className="text-muted-foreground"
            style={{ fontSize: '0.72rem', cursor: 'default' }}
          >
            {timeAgo(comment.created_at || comment.time)}
          </span>
        </div>
        <p className="text-foreground" style={{ fontSize: '0.875rem', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
          {comment.content}
        </p>
      </div>
      {isOwn && hovered && (
        <button
          onClick={() => onDelete(comment.id)}
          title="Delete comment"
          aria-label="Delete comment"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
            borderRadius: 8, color: '#e06661', opacity: 0.7, transition: 'opacity 0.2s',
            flexShrink: 0, alignSelf: 'flex-start', marginTop: 2,
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

/* Main Component */
export default function CourseEngagement({ courseId }) {
  const token       = localStorage.getItem('access_token');
  const currentUser = (() => { try { return JSON.parse(atob(token?.split('.')[1] || ''))?.sub || null; } catch { return null; } })();

  /* Reactions */
  const [likes,      setLikes]      = useState(0);
  const [dislikes,   setDislikes]   = useState(0);
  const [myReaction, setMyReaction] = useState(null); // 'like' | 'dislike' | null
  const [reactLoading, setReactLoading] = useState(false);

  /* Comments */
  const [comments,      setComments]      = useState([]);
  const [commentInput,  setCommentInput]  = useState('');
  const [commentsOpen,  setCommentsOpen]  = useState(true);
  const [posting,       setPosting]       = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [page,          setPage]          = useState(1);
  const [hasMore,       setHasMore]       = useState(false);
  const [initialLoad,   setInitialLoad]   = useState(true);

  /* UI feedback */
  const [likeAnim,    setLikeAnim]    = useState(false);
  const [dislikeAnim, setDislikeAnim] = useState(false);
  const [loginHint,   setLoginHint]   = useState(false);
  const [toast,       setToast]       = useState(null);

  const textareaRef = useRef(null);
  const sentinelRef = useRef(null);
  const pendingDelete = useRef(null);

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [commentInput]);

  /* Fetch reactions */
  const fetchReactions = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/courses/${courseId}/reactions`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setLikes(data.likes ?? 0);
      setDislikes(data.dislikes ?? 0);
      setMyReaction(data.my_reaction ?? null);
    } catch { /* fail silently */ }
  }, [courseId, token]);

  /* Fetch comments */
  const fetchComments = useCallback(async (pageNum = 1, append = false) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/courses/${courseId}/comments?page=${pageNum}&limit=10`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setComments(prev => append ? [...prev, ...(data.comments || [])] : (data.comments || []));
      setHasMore(data.has_more ?? false);
      setPage(pageNum);
    } catch { /* fail silently */ }
    finally { setInitialLoad(false); }
  }, [courseId, token]);

  useEffect(() => {
    setLikes(0); setDislikes(0); setMyReaction(null);
    setComments([]); setPage(1); setHasMore(false); setInitialLoad(true);
    fetchReactions();
    fetchComments(1, false);
  }, [courseId]); // eslint-disable-line

  /* Infinite scroll */
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loadingMore) handleLoadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page]); // eslint-disable-line

  /* React handler */
  const handleReact = async (type) => {
    if (!token) {
      setLoginHint(true);
      setTimeout(() => setLoginHint(false), 2500);
      return;
    }
    if (reactLoading) return;
    setReactLoading(true);

    // Optimistic update
    const prev = myReaction;
    if (myReaction === type) {
      setMyReaction(null);
      type === 'like' ? setLikes(l => Math.max(0, l - 1)) : setDislikes(d => Math.max(0, d - 1));
    } else {
      if (myReaction === 'like')    setLikes(l => Math.max(0, l - 1));
      if (myReaction === 'dislike') setDislikes(d => Math.max(0, d - 1));
      setMyReaction(type);
      type === 'like' ? setLikes(l => l + 1) : setDislikes(d => d + 1);
    }

    // Animate
    type === 'like' ? setLikeAnim(true) : setDislikeAnim(true);
    setTimeout(() => { setLikeAnim(false); setDislikeAnim(false); }, 400);

    try {
      const res = await fetch(`${API_BASE}/courses/${courseId}/react`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLikes(data.likes ?? 0);
      setDislikes(data.dislikes ?? 0);
      setMyReaction(data.reaction);
    } catch {
      // rollback
      setMyReaction(prev);
      fetchReactions();
    } finally {
      setReactLoading(false);
    }
  };

  /* Post comment */
  const handlePostComment = async () => {
    if (!commentInput.trim() || posting || commentInput.length > MAX_COMMENT_LENGTH) return;
    if (!token) { textareaRef.current?.focus(); return; }
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE}/courses/${courseId}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      if (!res.ok) throw new Error();
      const newComment = await res.json();
      setComments(prev => [newComment, ...prev]);
      setCommentInput('');
    } catch { /* fail silently */ }
    finally { setPosting(false); }
  };

  /* Delete comment with undo */
  const handleDeleteComment = (commentId) => {
    const snapshot = comments;
    setComments(prev => prev.filter(c => c.id !== commentId));

    let undone = false;
    pendingDelete.current = commentId;

    const undoFn = () => {
      undone = true;
      pendingDelete.current = null;
      setComments(snapshot);
      setToast(null);
    };

    const commitFn = async () => {
      if (undone) return;
      try {
        await fetch(`${API_BASE}/courses/${courseId}/comments/${commentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* fail silently */ }
    };

    setToast({ message: 'Comment deleted.', undoFn, commitFn });
  };

  const dismissToast = useCallback(() => {
    if (toast?.commitFn) toast.commitFn();
    setToast(null);
  }, [toast]);

  /* Load more */
  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    await fetchComments(page + 1, true);
    setLoadingMore(false);
  };

  /* Keyboard shortcut: Ctrl+Enter to post */
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handlePostComment();
  };

  const totalReactions = likes + dislikes;
  const likePercent = totalReactions > 0 ? Math.round((likes / totalReactions) * 100) : null;
  const overLimit = commentInput.length > MAX_COMMENT_LENGTH;

  return (
    <>
    <div
      style={{
        maxWidth: '100%',
        margin: '0 auto',
        padding: '32px 0 48px',
        fontFamily: 'inherit',
      }}
    >
      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-muted-text)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Lesson Feedback
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>

      {/* REACTIONS SECTION */}
      <div
        className="bg-card"
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          padding: '28px 32px',
          marginBottom: 24,
        }}
      >
        {/* Top gradient bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #6672e0, #9180e8, #3fa9c9)', borderRadius: '20px 20px 0 0', margin: '-28px -32px 20px' }} />

        <p className="text-foreground" style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 6px' }}>
          Was this lesson helpful?
        </p>
        <p className="text-muted-foreground" style={{ fontSize: '0.78rem', margin: '0 0 20px' }}>
          Your feedback helps improve the course for everyone.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

          {/* 👍 Like Button */}
          <button
            className="ce-react-btn"
            onClick={() => handleReact('like')}
            title={token ? 'Mark as helpful' : 'Sign in to react'}
            aria-pressed={myReaction === 'like'}
            aria-label="Mark as helpful"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '10px 20px', borderRadius: 14, border: 'none',
              cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
              transition: 'all 0.2s ease',
              transform: likeAnim ? 'scale(1.15)' : 'scale(1)',
              background: myReaction === 'like'
                ? 'linear-gradient(135deg, #41bd78, #3fa9c9)'
                : 'var(--color-surface-hover)',
              color: myReaction === 'like' ? '#fff' : 'var(--color-primary-text)',
              boxShadow: myReaction === 'like'
                ? '0 6px 20px rgba(65,189,120,0.4)'
                : '0 2px 8px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => { if (myReaction !== 'like') e.currentTarget.style.background = 'rgba(65,189,120,0.12)'; }}
            onMouseLeave={e => { if (myReaction !== 'like') e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
          >
            <ThumbsUp
              size={17}
              fill={myReaction === 'like' ? '#fff' : 'none'}
              style={{ transition: 'transform 0.3s', transform: likeAnim ? 'rotate(-15deg)' : 'rotate(0)' }}
            />
            <span>{likes}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, opacity: 0.85 }}>Helpful</span>
          </button>

          {/* 👎 Dislike Button */}
          <button
            className="ce-react-btn"
            onClick={() => handleReact('dislike')}
            title={token ? 'Mark as not helpful' : 'Sign in to react'}
            aria-pressed={myReaction === 'dislike'}
            aria-label="Mark as not helpful"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '10px 20px', borderRadius: 14, border: 'none',
              cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
              transition: 'all 0.2s ease',
              transform: dislikeAnim ? 'scale(1.15)' : 'scale(1)',
              background: myReaction === 'dislike'
                ? 'linear-gradient(135deg, #e06661, #f43f5e)'
                : 'var(--color-surface-hover)',
              color: myReaction === 'dislike' ? '#fff' : 'var(--color-primary-text)',
              boxShadow: myReaction === 'dislike'
                ? '0 6px 20px rgba(224,102,97,0.35)'
                : '0 2px 8px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => { if (myReaction !== 'dislike') e.currentTarget.style.background = 'rgba(224,102,97,0.1)'; }}
            onMouseLeave={e => { if (myReaction !== 'dislike') e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
          >
            <ThumbsDown
              size={17}
              fill={myReaction === 'dislike' ? '#fff' : 'none'}
              style={{ transition: 'transform 0.3s', transform: dislikeAnim ? 'rotate(15deg)' : 'rotate(0)' }}
            />
            <span>{dislikes}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, opacity: 0.85 }}>Not helpful</span>
          </button>

          {/* Approval percentage bar */}
          {likePercent !== null ? (
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.7rem', color: '#41bd78', fontWeight: 700 }}>
                  {likePercent}% found this helpful
                </span>
                <span className="text-muted-foreground" style={{ fontSize: '0.7rem' }}>
                  {totalReactions} rating{totalReactions !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--color-border)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%', borderRadius: 99,
                    background: 'linear-gradient(90deg, #41bd78, #3fa9c9)',
                    width: `${likePercent}%`,
                    transition: 'width 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                  }}
                />
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground" style={{ fontSize: '0.75rem', fontStyle: 'italic', flex: 1 }}>
              Be the first to rate this lesson!
            </span>
          )}
        </div>

        {/* Not logged in hint */}
        {!token && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogIn size={13} style={{ color: 'var(--primary)' }} />
            <span className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Sign in</span> to rate this lesson
            </span>
          </div>
        )}

        {/* Logged-out click feedback */}
        {loginHint && (
          <div className="ce-login-hint" style={{
            marginTop: 10, padding: '8px 14px', borderRadius: 10,
            background: 'rgba(102,114,224,0.1)', border: '1px solid rgba(102,114,224,0.25)',
            fontSize: '0.78rem', color: '#6672e0', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <LogIn size={13} /> Please sign in to react to this lesson
          </div>
        )}
      </div>

      {/* COMMENTS SECTION */}
      <div
        className="bg-card"
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          overflow: 'hidden',
        }}
      >
        {/* Top gradient bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #9180e8, #b988d6, #e0a050)' }} />

        {/* Header — toggles open/close */}
        <button
          onClick={() => setCommentsOpen(o => !o)}
          aria-expanded={commentsOpen}
          style={{
            width: '100%', padding: '18px 32px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: commentsOpen ? '1px solid var(--color-border)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#9180e8,#b988d6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageCircle size={15} color="#fff" />
            </span>
            <span className="text-foreground" style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              Community Discussion
            </span>
            {comments.length > 0 && (
              <span style={{
                background: 'rgba(145,128,232,0.15)', color: '#9180e8',
                fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px',
                borderRadius: 99, border: '1px solid rgba(145,128,232,0.25)',
              }}>
                {comments.length}
              </span>
            )}
          </div>
          <ChevronDown
            size={18}
            className="text-muted-foreground"
            style={{
              transform: commentsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.3s',
            }}
          />
        </button>

        {/* Collapsible body with smooth animation */}
        <div style={{
          maxHeight: commentsOpen ? '3000px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}>
        {commentsOpen && (
          <div style={{ padding: '20px 32px' }}>

            {/* Comment Input */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Avatar name={currentUser || '?'} />
                <div style={{ flex: 1 }}>
                  <textarea
                    ref={textareaRef}
                    className="ce-textarea text-foreground"
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={token ? 'Share your thoughts, questions, or insights about this lesson...' : 'Sign in to leave a comment'}
                    disabled={!token}
                    rows={2}
                    style={{
                      width: '100%', padding: '12px 16px',
                      borderRadius: 14, resize: 'none',
                      border: `1.5px solid ${overLimit ? '#e06661' : commentInput ? '#9180e8' : 'var(--color-border)'}`,
                      background: 'var(--color-surface-hover)',
                      fontSize: '0.875rem', lineHeight: 1.6,
                      outline: 'none', transition: 'border-color 0.2s',
                      fontFamily: 'inherit', boxSizing: 'border-box',
                      opacity: token ? 1 : 0.6,
                      overflow: 'hidden', minHeight: 68,
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: '0.7rem', color: overLimit ? '#e06661' : 'var(--color-muted-text)', fontWeight: overLimit ? 700 : 400 }}>
                      {token
                        ? `${commentInput.length} / ${MAX_COMMENT_LENGTH}  ·  Ctrl+Enter to post`
                        : <span><span style={{ color: '#9180e8', fontWeight: 700 }}>Sign in</span> to join the discussion</span>
                      }
                    </span>
                    <button
                      onClick={handlePostComment}
                      disabled={!token || !commentInput.trim() || posting || overLimit}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '8px 18px', borderRadius: 10, border: 'none',
                        cursor: (!token || !commentInput.trim() || posting || overLimit) ? 'not-allowed' : 'pointer',
                        fontWeight: 700, fontSize: '0.8rem',
                        background: (!token || !commentInput.trim() || posting || overLimit)
                          ? 'var(--color-surface-hover)'
                          : 'linear-gradient(135deg,#9180e8,#6672e0)',
                        color: (!token || !commentInput.trim() || posting || overLimit)
                          ? 'var(--color-muted-text)' : '#fff',
                        boxShadow: (!token || !commentInput.trim() || posting || overLimit)
                          ? 'none' : '0 4px 14px rgba(145,128,232,0.4)',
                        transition: 'all 0.2s',
                        opacity: posting ? 0.7 : 1,
                      }}
                    >
                      <Send size={13} />
                      {posting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Comments List */}
            {initialLoad ? (
              /* Skeleton loading */
              [1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--color-border)', opacity: 0.4 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ width: 100, height: 10, borderRadius: 6, background: 'var(--color-border)', marginBottom: 8 }} />
                    <div style={{ width: '80%', height: 10, borderRadius: 6, background: 'var(--color-border)', marginBottom: 6 }} />
                    <div style={{ width: '55%', height: 10, borderRadius: 6, background: 'var(--color-border)' }} />
                  </div>
                </div>
              ))
            ) : comments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px',
                  background: 'linear-gradient(135deg,rgba(145,128,232,0.2),rgba(236,72,153,0.2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MessageCircle size={24} style={{ color: '#9180e8' }} />
                </div>
                <p className="text-foreground" style={{ fontWeight: 700, fontSize: '0.9rem', margin: '0 0 6px' }}>
                  No comments yet
                </p>
                <p className="text-muted-foreground" style={{ fontSize: '0.8rem', margin: 0 }}>
                  Be the first to start the discussion!
                </p>
              </div>
            ) : (
              <>
                {comments.map(comment => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    currentUser={currentUser}
                    onDelete={handleDeleteComment}
                  />
                ))}

                {/* Infinite scroll sentinel */}
                {hasMore && (
                  <div ref={sentinelRef} style={{ padding: '16px 0', textAlign: 'center' }}>
                    {loadingMore && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-muted-text)' }}>Loading more...</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </div>{/* end collapse wrapper */}
      </div>
    </div>

      {/* Undo Toast */}
      {toast && (
        <Toast
          message={toast.message}
          onUndo={toast.undoFn}
          onDismiss={dismissToast}
        />
      )}
    </>
  );
}
