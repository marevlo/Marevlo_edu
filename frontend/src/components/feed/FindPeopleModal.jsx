import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, UserPlus, UserCheck, Loader, Users, AlertCircle, Clock } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL;
const RECENT_KEY = 'feed:recent_people_searches';
const RECENT_MAX = 8;

// Deterministic avatar gradient from a username (mirrors the chat UserSearch
// palette so a given person looks the same everywhere in the app).
const gradientFromUsername = (username) => {
    if (!username) return 'linear-gradient(135deg, #6672e0, #9180e8)';
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) - hash) + username.charCodeAt(i);
        hash = hash & hash;
    }
    const colors = [
        'linear-gradient(135deg, #6672e0, #9180e8)',
        'linear-gradient(135deg, #41bd78, #14b8a6)',
        'linear-gradient(135deg, #e0a050, #f97316)',
        'linear-gradient(135deg, #e06661, #b988d6)',
        'linear-gradient(135deg, #3fa9c9, #0ea5e9)',
        'linear-gradient(135deg, #9180e8, #ab9df0)',
        'linear-gradient(135deg, #14b8a6, #3fa9c9)',
        'linear-gradient(135deg, #f97316, #e09a5e)',
    ];
    return colors[Math.abs(hash) % colors.length];
};

const loadRecent = () => {
    try {
        const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(a) ? a.filter((s) => typeof s === 'string').slice(0, RECENT_MAX) : [];
    } catch { return []; }
};
const saveRecent = (arr) => {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, RECENT_MAX))); } catch { /* private mode / quota */ }
};

// Highlights the matched slice of a username so the search feels responsive.
function Highlight({ text, q }) {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return text;
    return (
        <>
            {text.slice(0, i)}
            <mark style={{ background: 'transparent', color: '#9180e8', fontWeight: 800 }}>{text.slice(i, i + q.length)}</mark>
            {text.slice(i + q.length)}
        </>
    );
}

/**
 * FindPeopleModal — a command-palette-style directory search for the feed.
 *
 * Fully wired to the live backend (no mock): GET /chat/users/search?q= returns
 * [{id, username}], and POST|DELETE /chat/users/{id}/follow toggles the edge.
 * Search results carry no follow-state, so follows are optimistic and self-heal
 * against the server's 409 (already following) / 404 (not following) responses.
 *
 * UX: arrow-key navigation, Enter-to-follow, locally-persisted recent searches,
 * live match highlighting, skeleton loading, and a hover-to-Unfollow affordance.
 */
export default function FindPeopleModal({ open, onClose, onFollowChange }) {
    const token = localStorage.getItem('access_token');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [followed, setFollowed] = useState({});   // id -> bool
    const [pending, setPending] = useState({});      // id -> bool (request in flight)
    const [activeIndex, setActiveIndex] = useState(-1);
    const [hoverUnfollowId, setHoverUnfollowId] = useState(null);
    const [recent, setRecent] = useState([]);

    const inputRef = useRef(null);
    const rowsRef = useRef([]);                       // DOM nodes for scroll-into-view
    const reqIdRef = useRef(0);                       // guards against out-of-order responses

    // Fresh slate each open; load recent searches and focus the field.
    useEffect(() => {
        if (!open) return;
        setQuery('');
        setResults([]);
        setError(null);
        setFollowed({});
        setPending({});
        setActiveIndex(-1);
        setRecent(loadRecent());
        const t = setTimeout(() => inputRef.current?.focus(), 60);
        return () => clearTimeout(t);
    }, [open]);

    // Debounced live search (min 2 chars).
    useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (q.length < 2) { setResults([]); setLoading(false); setActiveIndex(-1); return; }
        const timer = setTimeout(async () => {
            const myReq = ++reqIdRef.current;
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    `${API_BASE}/chat/users/search?q=${encodeURIComponent(q)}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();
                if (myReq === reqIdRef.current) { setResults(Array.isArray(data) ? data : []); setActiveIndex(-1); }
            } catch {
                if (myReq === reqIdRef.current) { setError('Could not search right now. Try again.'); setResults([]); }
            } finally {
                if (myReq === reqIdRef.current) setLoading(false);
            }
        }, 280);
        return () => clearTimeout(timer);
    }, [query, open, token]);

    // Keep the keyboard-highlighted row in view.
    useEffect(() => {
        if (activeIndex < 0) return;
        rowsRef.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const pushRecent = useCallback((term) => {
        const t = (term || '').trim();
        if (t.length < 2) return;
        setRecent((prev) => {
            const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
            saveRecent(next);
            return next;
        });
    }, []);
    const removeRecent = useCallback((term) => {
        setRecent((prev) => { const next = prev.filter((x) => x !== term); saveRecent(next); return next; });
    }, []);
    const clearRecent = useCallback(() => { setRecent([]); saveRecent([]); }, []);

    const toggleFollow = useCallback(async (u) => {
        if (!u || pending[u.id]) return;
        const wasFollowing = !!followed[u.id];
        setPending((p) => ({ ...p, [u.id]: true }));
        setFollowed((f) => ({ ...f, [u.id]: !wasFollowing }));  // optimistic
        if (!wasFollowing) pushRecent(query);                    // remember what found them
        try {
            const res = await fetch(`${API_BASE}/chat/users/${u.id}/follow`, {
                method: wasFollowing ? 'DELETE' : 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            // 409 = already following, 404 on unfollow = wasn't following: both mean
            // our optimistic guess matched reality, so keep it. Hard-fail otherwise.
            if (!res.ok && res.status !== 409 && res.status !== 404) throw new Error('Follow failed');
            onFollowChange?.(u, !wasFollowing);
        } catch {
            setFollowed((f) => ({ ...f, [u.id]: wasFollowing }));  // rollback
            setError('Could not update follow. Try again.');
        } finally {
            setPending((p) => { const n = { ...p }; delete n[u.id]; return n; });
        }
    }, [pending, followed, token, query, pushRecent, onFollowChange]);

    const onInputKeyDown = useCallback((e) => {
        if (e.key === 'Escape') { if (query) setQuery(''); else onClose(); return; }
        if (!results.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(results.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); toggleFollow(results[activeIndex >= 0 ? activeIndex : 0]); }
    }, [query, results, activeIndex, toggleFollow, onClose]);

    if (!open) return null;

    const q = query.trim();
    const showSkeleton = loading && results.length === 0;
    const showIdle = !loading && q.length < 2 && !error;
    const showNoResults = !loading && q.length >= 2 && results.length === 0 && !error;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-[10vh] sm:pt-4 backdrop-blur-md"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="find-people-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg shadow-2xl flex flex-col max-h-[82vh] bg-card"
                style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: '1.5rem',
                    animation: 'feedModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                }}
            >
                {/* Header */}
                <div className="px-5 sm:px-6 pt-5 pb-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-2.5">
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, borderRadius: '50%',
                            background: 'linear-gradient(135deg,#6672e0,#3fa9c9)', color: '#fff',
                        }}>
                            <Users size={18} />
                        </span>
                        <div className="min-w-0">
                            <h2 id="find-people-title" className="text-lg font-bold leading-tight text-foreground">Find People</h2>
                            <p className="text-xs text-muted-foreground">Search the community and follow classmates</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="p-2 rounded-xl hover:opacity-70 transition-opacity"
                        style={{ backgroundColor: 'var(--color-surface-hover)' }}
                    >
                        <X size={20} className="text-foreground" />
                    </button>
                </div>

                {/* Search box */}
                <div className="px-5 sm:px-6 pt-5 pb-2">
                    <div className="fp-search">
                        <Search size={17} className="fp-search-icon" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search people by username…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onInputKeyDown}
                            className="flex-1 min-w-0 py-3 text-sm bg-transparent text-foreground focus:outline-none"
                            aria-label="Search people by username"
                        />
                        {loading ? (
                            <Loader size={15} className="flex-shrink-0 animate-spin" style={{ color: '#6672e0' }} />
                        ) : query ? (
                            <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search"
                                className="fp-clear flex-shrink-0">
                                <X size={14} />
                            </button>
                        ) : null}
                    </div>
                    {query.length > 0 && query.length < 2 && (
                        <p className="text-[11px] mt-2 ml-1 text-muted-foreground">Type at least 2 characters…</p>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-3 sm:px-4 pb-3">
                    {error && (
                        <div className="m-2 p-3 rounded-xl flex items-center gap-2.5"
                            style={{ backgroundColor: 'rgba(224,102,97,0.07)', color: '#e06661', border: '1px solid rgba(224,102,97,0.15)' }}>
                            <AlertCircle size={16} className="flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Skeleton while searching */}
                    {showSkeleton && (
                        <div className="space-y-1.5 pt-1" aria-hidden="true">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="p-3 rounded-2xl flex items-center gap-3.5" style={{ border: '1px solid var(--color-border)' }}>
                                    <div className="w-11 h-11 rounded-2xl feed-skel flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-1/3 rounded feed-skel" />
                                        <div className="h-2.5 w-1/4 rounded feed-skel" />
                                    </div>
                                    <div className="h-8 w-20 rounded-xl feed-skel" />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Idle: recent searches + discover hint */}
                    {showIdle && (
                        <div className="pt-1">
                            {recent.length > 0 && (
                                <div className="px-2 pb-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            <Clock size={12} /> Recent
                                        </span>
                                        <button onClick={clearRecent} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                                            Clear
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {recent.map((term) => (
                                            <span key={term} className="inline-flex items-center rounded-full overflow-hidden"
                                                style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }}>
                                                <button
                                                    onClick={() => { setQuery(term); inputRef.current?.focus(); }}
                                                    className="pl-3 pr-1.5 py-1.5 text-xs font-medium text-foreground hover:text-[#6672e0] transition-colors"
                                                >
                                                    {term}
                                                </button>
                                                <button onClick={() => removeRecent(term)} aria-label={`Remove ${term}`}
                                                    className="pr-2 pl-0.5 py-1.5 text-muted-foreground hover:text-[#e06661] transition-colors">
                                                    <X size={11} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col items-center justify-center text-center py-10 px-8 gap-3">
                                <div className="w-16 h-16 rounded-[20px] flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(102,114,224,0.12), rgba(63,169,201,0.16))',
                                        border: '1px solid rgba(102,114,224,0.15)',
                                    }}>
                                    <Search size={26} style={{ color: '#6672e0' }} />
                                </div>
                                <h3 className="font-bold text-base text-foreground">Discover people</h3>
                                <p className="text-sm text-muted-foreground" style={{ maxWidth: 240 }}>
                                    Search by username to find classmates and follow them.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* No results */}
                    {showNoResults && (
                        <div className="flex flex-col items-center justify-center text-center py-12 px-8 gap-3">
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                                style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }}>
                                <AlertCircle size={22} className="text-muted-foreground" style={{ opacity: 0.5 }} />
                            </div>
                            <h3 className="font-semibold text-sm text-foreground">No one found for “{q}”</h3>
                            <p className="text-xs text-muted-foreground">Check the spelling or try a different username</p>
                        </div>
                    )}

                    {/* Results */}
                    {results.length > 0 && (
                        <div className="pt-1">
                            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {results.length} result{results.length !== 1 ? 's' : ''}
                            </p>
                            <div className="space-y-1.5">
                                {results.map((u, idx) => {
                                    const isFollowing = !!followed[u.id];
                                    const busy = !!pending[u.id];
                                    const active = idx === activeIndex;
                                    const hoverUnfollow = isFollowing && hoverUnfollowId === u.id;
                                    return (
                                        <div
                                            key={u.id}
                                            ref={(el) => { rowsRef.current[idx] = el; }}
                                            onMouseEnter={() => setActiveIndex(idx)}
                                            className="p-3 rounded-2xl flex items-center gap-3.5 transition-all duration-150"
                                            style={{
                                                background: active ? 'rgba(102,114,224,0.06)' : 'var(--color-surface)',
                                                border: `1px solid ${active ? 'rgba(102,114,224,0.3)' : 'var(--color-border)'}`,
                                                boxShadow: active ? '0 4px 16px rgba(102,114,224,0.08)' : 'none',
                                                animation: `findPeopleRowIn 0.22s cubic-bezier(0.16,1,0.3,1) ${Math.min(idx, 8) * 35}ms both`,
                                            }}
                                        >
                                            <div
                                                className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
                                                style={{ background: gradientFromUsername(u.username), boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                                            >
                                                {u.username?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-sm truncate text-foreground">
                                                    <Highlight text={u.username} q={q} />
                                                </h3>
                                                <p className="text-xs truncate mt-0.5 text-muted-foreground">@{u.username}</p>
                                            </div>
                                            <button
                                                onClick={() => toggleFollow(u)}
                                                onMouseEnter={() => setHoverUnfollowId(u.id)}
                                                onMouseLeave={() => setHoverUnfollowId(null)}
                                                disabled={busy}
                                                aria-pressed={isFollowing}
                                                className="flex-shrink-0 flex items-center justify-center gap-1.5 min-w-[92px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 disabled:opacity-60"
                                                style={
                                                    !isFollowing ? {
                                                        background: 'linear-gradient(135deg, #6672e0, #7c3aed)',
                                                        color: '#fff', border: '1px solid transparent',
                                                        boxShadow: '0 2px 10px rgba(102,114,224,0.3)',
                                                    } : hoverUnfollow ? {
                                                        background: 'rgba(224,102,97,0.1)', color: '#e06661',
                                                        border: '1px solid rgba(224,102,97,0.4)',
                                                    } : {
                                                        background: 'var(--color-surface-hover)', color: 'var(--muted-foreground)',
                                                        border: '1px solid var(--color-border)',
                                                    }
                                                }
                                            >
                                                {busy ? (
                                                    <Loader size={12} className="animate-spin" />
                                                ) : !isFollowing ? (
                                                    <><UserPlus size={13} /> Follow</>
                                                ) : hoverUnfollow ? (
                                                    <><X size={13} /> Unfollow</>
                                                ) : (
                                                    <><UserCheck size={13} /> Following</>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Keyboard-hint footer (command-palette feel) */}
                <div className="px-5 py-2.5 flex items-center gap-4 text-[11px] text-muted-foreground"
                    style={{ borderTop: '1px solid var(--color-border)' }}>
                    <span className="hidden sm:inline-flex items-center gap-1.5">
                        <kbd className="fp-kbd">↑</kbd><kbd className="fp-kbd">↓</kbd> navigate
                    </span>
                    <span className="inline-flex items-center gap-1.5"><kbd className="fp-kbd">↵</kbd> follow</span>
                    <span className="inline-flex items-center gap-1.5"><kbd className="fp-kbd">esc</kbd> close</span>
                </div>

                <style>{`
                    /* Search bar — calm by default, lights up smoothly on focus */
                    .fp-search {
                        display: flex; align-items: center; gap: 11px;
                        padding: 0 14px; border-radius: 14px;
                        background: var(--color-surface-hover);
                        border: 1px solid var(--color-border);
                        transition: border-color .22s ease, box-shadow .22s ease, background .22s ease;
                    }
                    .fp-search:focus-within {
                        border-color: rgba(102,114,224,0.55);
                        box-shadow: 0 0 0 4px rgba(102,114,224,0.12);
                        background: var(--color-surface);
                    }
                    .fp-search-icon { flex-shrink: 0; color: var(--color-muted-text); transition: color .22s ease; }
                    .fp-search:focus-within .fp-search-icon { color: #6672e0; }
                    .fp-search input::placeholder { color: var(--color-muted-text); }
                    .fp-clear {
                        display: inline-flex; align-items: center; justify-content: center;
                        padding: 5px; border-radius: 9px; color: var(--color-muted-text);
                        transition: color .15s ease, background .15s ease;
                    }
                    .fp-clear:hover { color: var(--foreground); background: var(--color-surface-hover); }

                    @keyframes findPeopleRowIn {
                        from { opacity: 0; transform: translateY(8px) scale(0.98); }
                        to   { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    .fp-kbd {
                        display: inline-flex; align-items: center; justify-content: center;
                        min-width: 18px; height: 18px; padding: 0 5px; border-radius: 6px;
                        font-family: inherit; font-size: 10px; line-height: 1;
                        background: var(--color-surface-hover); border: 1px solid var(--color-border);
                        color: var(--muted-foreground);
                    }
                    @media (prefers-reduced-motion: reduce) {
                        [style*="findPeopleRowIn"] { animation: none !important; }
                    }
                `}</style>
            </div>
        </div>
    );
}
