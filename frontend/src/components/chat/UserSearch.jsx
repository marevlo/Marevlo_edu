import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowLeft, Loader, AlertCircle, MessageCircle, Command } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL;

const getGradientFromUsername = (username) => {
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

export default function UserSearch({ onUserSelected, onBack }) {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [visible, setVisible] = useState(false);
    const inputRef = useRef(null);
    const token = localStorage.getItem('access_token');

    useEffect(() => {
        const t = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(t);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.length >= 2) {
                searchUsers();
            } else {
                setResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const searchUsers = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch(
                `${API_BASE}/chat/users/search?q=${encodeURIComponent(searchQuery)}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            if (response.ok) {
                const data = await response.json();
                setResults(data);
            }
        } catch (err) {
            setError('Failed to search users');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="h-full flex flex-col"
            style={{
                background: 'var(--color-app-bg)',
                opacity: visible ? 1 : 0,
                transition: 'opacity 0.18s ease',
            }}
        >
            {/* ── Command Palette Header ── */}
            <div
                className="flex-shrink-0 relative overflow-hidden"
                style={{
                    background: 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-border)',
                }}
            >
                {/* Top gradient line */}
                <span
                    aria-hidden
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, #6672e0 30%, #9180e8 60%, transparent)' }}
                />

                {/* Ambient glow */}
                <div
                    className="absolute -top-8 left-1/2 -translate-x-1/2 w-64 h-24 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse, rgba(102,114,224,0.12) 0%, transparent 70%)' }}
                />

                <div className="relative px-5 pt-5 pb-4">
                    {/* Back row */}
                    <div className="flex items-center gap-3 mb-5">
                        <button
                            onClick={onBack}
                            className="p-2 rounded-xl transition-all duration-200 flex-shrink-0"
                            style={{
                                backgroundColor: 'var(--color-surface-hover)',
                                color: 'var(--color-primary-text)',
                                border: '1px solid var(--color-border)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(102,114,224,0.4)'; e.currentTarget.style.color = '#6672e0'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-primary-text)'; }}
                            aria-label="Back"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div className="min-w-0">
                            <h2
                                className="text-base font-bold leading-tight tracking-tight"
                                style={{
                                    background: 'linear-gradient(135deg, var(--color-primary-text) 40%, #6672e0)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                }}
                            >
                                New conversation
                            </h2>
                            <p className="text-xs mt-0.5 font-medium text-muted-foreground">
                                Find a classmate to chat with
                            </p>
                        </div>
                    </div>

                    {/* Command-palette search box */}
                    <div
                        className="relative rounded-2xl overflow-hidden transition-all duration-200"
                        style={{
                            border: `1px solid ${searchQuery ? 'rgba(102,114,224,0.5)' : 'var(--color-border)'}`,
                            boxShadow: searchQuery
                                ? '0 0 0 3px rgba(102,114,224,0.1), 0 4px 16px rgba(102,114,224,0.08)'
                                : '0 1px 4px rgba(0,0,0,0.06)',
                            background: 'var(--color-surface-hover)',
                        }}
                    >
                        <div className="flex items-center px-3.5 py-0.5 gap-3">
                            <Search
                                size={16}
                                className="flex-shrink-0 transition-colors duration-200"
                                style={{ color: searchQuery ? '#6672e0' : 'var(--color-muted-text)' }}
                            />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Search by username…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                                className="flex-1 py-3 text-sm focus:outline-none bg-transparent text-foreground"
                            />
                            {loading && searchQuery.length >= 2 ? (
                                <Loader size={14} className="flex-shrink-0 animate-spin" style={{ color: 'var(--primary)' }} />
                            ) : (
                                <kbd
                                    className="hidden sm:flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-medium flex-shrink-0 text-muted-foreground"
                                    style={{
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    <Command size={9} />
                                    K
                                </kbd>
                            )}
                        </div>

                        {/* Animated focus underline */}
                        <div
                            className="h-px transition-all duration-300"
                            style={{
                                background: 'linear-gradient(90deg, #6672e0, #9180e8)',
                                opacity: searchQuery ? 1 : 0,
                                transform: searchQuery ? 'scaleX(1)' : 'scaleX(0)',
                                transformOrigin: 'left',
                            }}
                        />
                    </div>

                    {searchQuery.length > 0 && searchQuery.length < 2 && (
                        <p className="text-[11px] mt-2 ml-1 text-muted-foreground">
                            Type at least 2 characters…
                        </p>
                    )}
                </div>
            </div>

            {/* ── Results area ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {error && (
                    <div
                        className="m-4 p-3.5 rounded-2xl flex items-center gap-2.5"
                        style={{ backgroundColor: 'rgba(224,102,97,0.07)', color: '#e06661', border: '1px solid rgba(224,102,97,0.12)' }}
                    >
                        <AlertCircle size={16} className="flex-shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {/* Empty prompt */}
                {!loading && searchQuery.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full pb-20 gap-6 px-8 text-center">
                        {/* Dot grid background */}
                        <div className="absolute inset-0 pointer-events-none" style={{
                            backgroundImage: 'radial-gradient(circle, rgba(102,114,224,0.07) 1px, transparent 1px)',
                            backgroundSize: '28px 28px',
                            maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 0%, transparent 100%)',
                        }} />
                        <div className="relative">
                            <div
                                className="w-20 h-20 rounded-[22px] flex items-center justify-center"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(102,114,224,0.12) 0%, rgba(145,128,232,0.16) 100%)',
                                    border: '1px solid rgba(102,114,224,0.15)',
                                    boxShadow: '0 12px 32px rgba(102,114,224,0.12)',
                                }}
                            >
                                <Search size={30} style={{ color: '#9180e8' }} />
                            </div>
                            <div
                                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #6672e0, #7c3aed)', boxShadow: '0 4px 10px rgba(102,114,224,0.4)' }}
                            >
                                <span className="text-white text-xs font-bold">+</span>
                            </div>
                        </div>
                        <div>
                            <h3
                                className="font-bold text-base mb-1.5 tracking-tight text-foreground"
                            >
                                Start a conversation
                            </h3>
                            <p className="text-sm leading-relaxed text-muted-foreground" style={{ maxWidth: '220px' }}>
                                Search by username to find classmates and start chatting
                            </p>
                        </div>
                    </div>
                )}

                {/* No results */}
                {!loading && searchQuery.length >= 2 && results.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 px-8 text-center">
                        <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }}
                        >
                            <AlertCircle size={24} className="text-muted-foreground" style={{ opacity: 0.5 }} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm mb-1 text-foreground">
                                No results for "{searchQuery}"
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                Try a different username
                            </p>
                        </div>
                    </div>
                )}

                {/* Results */}
                {results.length > 0 && (
                    <div className="p-3 space-y-1">
                        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {results.length} result{results.length !== 1 ? 's' : ''}
                        </p>
                        {results.map((searchUser, idx) => (
                            <div
                                key={searchUser.id}
                                onClick={() => onUserSelected(searchUser.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => { if (e.key === 'Enter') onUserSelected(searchUser.id); }}
                                className="p-3.5 rounded-2xl cursor-pointer flex items-center gap-3.5 transition-all duration-150 outline-none group"
                                style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    animation: `userResultIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 45}ms both`,
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'rgba(102,114,224,0.05)';
                                    e.currentTarget.style.borderColor = 'rgba(102,114,224,0.25)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(102,114,224,0.1)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'var(--color-surface)';
                                    e.currentTarget.style.borderColor = 'var(--color-border)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                {/* Avatar */}
                                <div
                                    className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
                                    style={{
                                        background: getGradientFromUsername(searchUser.username),
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    }}
                                >
                                    {searchUser.username[0].toUpperCase()}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm truncate text-foreground">
                                        {searchUser.username}
                                    </h3>
                                    <p className="text-xs truncate mt-0.5 font-medium text-muted-foreground">
                                        @{searchUser.username}
                                    </p>
                                </div>

                                {/* CTA */}
                                <div
                                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg"
                                    style={{
                                        background: 'linear-gradient(135deg, #6672e0, #7c3aed)',
                                        boxShadow: '0 2px 10px rgba(102,114,224,0.3)',
                                    }}
                                >
                                    <MessageCircle size={12} />
                                    Message
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes userResultIn {
                    from { opacity: 0; transform: translateY(8px) scale(0.98); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}
