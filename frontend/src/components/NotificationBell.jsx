import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck, Megaphone, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { popover, springSnappy, easeOutExpo } from '../lib/motion';

// Per-row entrance — smaller travel than the shared fadeUp so a 20-item list
// settles quickly while still reading as a cascade.
const listRow = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: easeOutExpo } },
};
const listStagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.035 } },
};

const POLL_INTERVAL = 30_000;

function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function NotifIcon({ type }) {
    if (type === 'admin_announcement' || type === 'announcement') {
        return <Megaphone size={15} />;
    }
    return <Bell size={15} />;
}

export default function NotificationBell() {
    const { user, apiCall } = useAuth();
    const navigate = useNavigate();

    const [count, setCount]               = useState(0);
    const [open, setOpen]                 = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading]           = useState(false);
    const [error, setError]               = useState(false);

    const panelRef  = useRef(null);
    const mounted   = useRef(true);
    const pollTimer = useRef(null);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    // ── Badge count poll ────────────────────────────────────────────────────
    const refreshCount = useCallback(async () => {
        if (!user) return;
        try {
            const data = await apiCall('/notifications/unread-count');
            if (mounted.current) setCount(data.unread_count ?? 0);
        } catch {
            // Silently stale — badge stays at last known value
        }
    }, [user, apiCall]);

    useEffect(() => {
        if (!user) { setCount(0); return; }
        refreshCount();
        pollTimer.current = setInterval(refreshCount, POLL_INTERVAL);
        return () => clearInterval(pollTimer.current);
    }, [user, refreshCount]);

    // ── Full notification list ──────────────────────────────────────────────
    const loadNotifications = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const data = await apiCall('/notifications?page=1&limit=20');
            if (mounted.current) {
                setNotifications(data.notifications ?? []);
                setCount(data.unread_count ?? 0);
            }
        } catch {
            if (mounted.current) setError(true);
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [apiCall]);

    // ── Open / close ────────────────────────────────────────────────────────
    const toggleOpen = useCallback(() => {
        setOpen(prev => {
            if (!prev) loadNotifications();
            return !prev;
        });
    }, [loadNotifications]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open]);

    // ── Actions ─────────────────────────────────────────────────────────────
    const markOne = useCallback(async (id) => {
        try {
            await apiCall(`/notifications/${id}/read`, { method: 'POST' });
            if (mounted.current) {
                setNotifications(prev =>
                    prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
                );
                setCount(prev => Math.max(0, prev - 1));
            }
        } catch {
            // Silently fail — the read state is best-effort
        }
    }, [apiCall]);

    const markAll = useCallback(async () => {
        try {
            await apiCall('/notifications/mark-all-read', { method: 'POST' });
            if (mounted.current) {
                setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
                setCount(0);
            }
        } catch {
            // Silently fail
        }
    }, [apiCall]);

    const handleNotifClick = useCallback((n) => {
        if (!n.read_at) markOne(n.id);
        if (n.payload?.url) {
            setOpen(false);
            if (n.payload.url.startsWith('http')) {
                window.open(n.payload.url, '_blank', 'noopener');
            } else {
                navigate(n.payload.url);
            }
        }
    }, [markOne, navigate]);

    if (!user) return null;

    const iconColor = 'var(--primary)';
    const unreadBg  = 'color-mix(in srgb, var(--primary) 8%, transparent)';

    return (
        <div className="relative" ref={panelRef}>
            {/* ── Bell button ─────────────────────────────────────────────── */}
            <button
                onClick={toggleOpen}
                aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
                aria-expanded={open}
                aria-haspopup="dialog"
                className="relative p-2.5 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
                style={{
                    backgroundColor: 'var(--muted)',
                    border: '1px solid var(--border)',
                    color: open ? iconColor : 'var(--muted-foreground)',
                }}
            >
                <Bell size={20} />
                <AnimatePresence>
                    {count > 0 && (
                        <Motion.span
                            key={count > 99 ? '99+' : count}
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.12 } }}
                            transition={springSnappy}
                            aria-live="polite"
                            aria-atomic="true"
                            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white leading-none pointer-events-none"
                            style={{ backgroundColor: '#e06661', boxShadow: '0 2px 8px rgba(224,102,97,0.5)' }}
                        >
                            {count > 99 ? '99+' : count}
                        </Motion.span>
                    )}
                </AnimatePresence>
            </button>

            {/* ── Dropdown panel ──────────────────────────────────────────── */}
            <AnimatePresence>
            {open && (
                <Motion.div
                    variants={popover}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    role="dialog"
                    aria-label="Notifications"
                    // NOT .glass-edge — it sets position:relative, which beats
                    // Tailwind's `absolute` (unlayered CSS wins over utilities)
                    // and un-anchors the panel. Hairline drawn inline below.
                    className="absolute right-0 top-12 w-[min(380px,calc(100vw-2rem))] max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-20 max-sm:w-auto rounded-2xl shadow-2xl z-50 overflow-hidden glass-card"
                    style={{ transformOrigin: 'top right' }}
                >
                    {/* Gradient hairline (the .glass-edge look) */}
                    <div
                        aria-hidden="true"
                        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--primary-rgb), 0.55), rgba(var(--secondary-rgb), 0.45), transparent)' }}
                    />
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 py-3 border-b border-border"
                    >
                        <span className="text-sm font-bold text-foreground">
                            Notifications
                            {count > 0 && (
                                <span
                                    className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded-full"
                                    style={{ backgroundColor: unreadBg, color: iconColor }}
                                >
                                    {count} new
                                </span>
                            )}
                        </span>

                        <div className="flex items-center gap-1">
                            {count > 0 && (
                                <button
                                    onClick={markAll}
                                    title="Mark all as read"
                                    className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all hover:-translate-y-px"
                                    style={{ color: iconColor, backgroundColor: unreadBg, border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}
                                >
                                    <CheckCheck size={13} />
                                    All read
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                aria-label="Close notifications"
                                className="p-1 rounded-lg transition-colors text-muted-foreground"
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain">
                        {loading ? (
                            /* Skeleton */
                            <div className="flex flex-col gap-0">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex gap-3 items-start px-4 py-3 border-b border-border last:border-b-0">
                                        <div className="w-8 h-8 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: 'var(--border)' }} />
                                        <div className="flex-1 space-y-2 animate-pulse">
                                            <div className="h-3 rounded w-3/4" style={{ backgroundColor: 'var(--border)' }} />
                                            <div className="h-2.5 rounded w-full" style={{ backgroundColor: 'var(--border)' }} />
                                            <div className="h-2 rounded w-1/3" style={{ backgroundColor: 'var(--border)' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : error ? (
                            /* Error state */
                            <div className="flex flex-col items-center justify-center py-12 gap-2">
                                <Bell size={32} style={{ color: 'var(--color-border)' }} />
                                <p className="text-sm text-muted-foreground">Couldn't load notifications</p>
                                <button
                                    onClick={loadNotifications}
                                    className="text-xs px-3 py-1 rounded-lg mt-1 transition-colors"
                                    style={{ color: iconColor, border: `1px solid ${iconColor}` }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = unreadBg; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                    Try again
                                </button>
                            </div>
                        ) : notifications.length === 0 ? (
                            /* Empty state */
                            <div className="flex flex-col items-center justify-center py-14 px-6 gap-1 text-center">
                                <div className="relative mb-3">
                                    {/* Soft expanding ring behind the bell — global `ping` keyframes */}
                                    <div
                                        className="absolute inset-0 rounded-full"
                                        style={{ backgroundColor: 'rgba(var(--primary-rgb),0.25)', animation: 'ping 3s ease-out infinite' }}
                                    />
                                    <div
                                        className="relative w-14 h-14 rounded-full flex items-center justify-center"
                                        style={{
                                            background: 'linear-gradient(145deg, rgba(var(--primary-rgb),0.16), rgba(var(--secondary-rgb),0.10))',
                                            border: '1px solid rgba(var(--primary-rgb),0.25)',
                                        }}
                                    >
                                        <Bell size={22} style={{ color: 'var(--primary)' }} />
                                    </div>
                                </div>
                                <p className="text-sm font-semibold text-foreground">You're all caught up</p>
                                <p className="text-xs text-muted-foreground leading-relaxed">New notifications will appear here</p>
                            </div>
                        ) : (
                            /* Notification list — rows cascade in */
                            <Motion.div variants={listStagger} initial="hidden" animate="visible">
                            {notifications.map(n => {
                                const isUnread = !n.read_at;
                                return (
                                    <Motion.div
                                        key={n.id}
                                        variants={listRow}
                                        role="button"
                                        tabIndex={0}
                                        className="flex gap-3 items-start px-4 py-3 cursor-pointer transition-colors outline-none border-b border-border last:border-b-0"
                                        style={{
                                            backgroundColor: isUnread ? unreadBg : 'transparent',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isUnread ? unreadBg : 'transparent'; }}
                                        onClick={() => handleNotifClick(n)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNotifClick(n); }}
                                    >
                                        {/* Type icon */}
                                        <div
                                            className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                                            style={{
                                                backgroundColor: isUnread ? unreadBg : 'var(--muted)',
                                                color: iconColor,
                                                border: '1px solid var(--border)',
                                            }}
                                        >
                                            <NotifIcon type={n.type} />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p
                                                className="text-sm leading-snug text-foreground"
                                                style={{
                                                    fontWeight: isUnread ? 600 : 400,
                                                }}
                                            >
                                                {n.payload?.title ?? n.type}
                                            </p>
                                            {n.payload?.body && (
                                                <p
                                                    className="text-xs mt-0.5 line-clamp-2 leading-relaxed text-muted-foreground"
                                                >
                                                    {n.payload.body}
                                                </p>
                                            )}
                                            <p
                                                className="text-[10px] mt-1.5 text-muted-foreground"
                                                style={{ opacity: 0.65 }}
                                            >
                                                {relativeTime(n.created_at)}
                                            </p>
                                        </div>

                                        {/* Unread dot */}
                                        {isUnread && (
                                            <div
                                                className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                                                style={{ backgroundColor: '#e06661', boxShadow: '0 0 6px rgba(224,102,97,0.6)' }}
                                            />
                                        )}
                                    </Motion.div>
                                );
                            })}
                            </Motion.div>
                        )}
                    </div>
                </Motion.div>
            )}
            </AnimatePresence>
        </div>
    );
}
