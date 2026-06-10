import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, ArrowRight, ExternalLink, Search, BookOpen, Star, Tag,
    Bookmark, BookmarkCheck, ArrowUpDown, CheckCircle2, Clock, Circle,
} from 'lucide-react';
import { PAPERS, TAG_COLORS, ALL_TAGS, PAPER_HTML_MAP } from '../data/papers';
import { useTheme } from '../context/ThemeContext';

/* Warm the paper-viewer chunk so the view-transition morph captures the real
   page (not the lazy Suspense fallback) when a card is opened. */
const preloadPaper = () => import('./ResearchPaperContent');

/* Warm the actual paper HTML in the browser HTTP cache on hover, so the iframe
   paints almost instantly when the card is clicked instead of fetching the
   (large) document + its fonts/KaTeX only after navigation. Best-effort. */
const prefetchedHtml = new Set();
function prefetchPaperHtml(slug) {
    const href = PAPER_HTML_MAP[slug];
    if (!href || prefetchedHtml.has(href)) return;
    prefetchedHtml.add(href);
    try {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'document';
        link.href = href;
        document.head.appendChild(link);
    } catch { /* prefetch is a progressive enhancement — ignore failures */ }
}

/* Navigate with a shared-element morph when the browser supports it. */
function openPaperWithTransition(cardEl, navigate, slug) {
    const go = () => navigate(`/research/paper/${slug}`);
    if (!document.startViewTransition || !cardEl) { go(); return; }
    cardEl.style.viewTransitionName = 'paper-hero';
    const vt = document.startViewTransition(() => flushSync(go));
    vt.finished.finally(() => { try { cardEl.style.viewTransitionName = ''; } catch { /* gone */ } });
}

const STATUS_OPTIONS = [
    { key: 'to-read', label: 'To Read', color: '#e0a050', Icon: Circle },
    { key: 'reading', label: 'Reading', color: '#3fa9c9', Icon: Clock },
    { key: 'done',    label: 'Done',    color: '#41bd78', Icon: CheckCircle2 },
];

const SORT_OPTIONS = [
    { key: 'newest', label: 'Newest' },
    { key: 'oldest', label: 'Oldest' },
    { key: 'top',    label: 'Top Rated' },
    { key: 'az',     label: 'A → Z' },
];

const ALL_YEARS   = [...new Set(PAPERS.map(p => p.year))].sort((a, b) => b - a);
/* ─── Paper Card ─────────────────────────────────────────────────────────── */
const PaperCard = React.memo(function PaperCard({ paper, bookmarked, status, onToggleBookmark, onSetStatus, index }) {
    const [visible, setVisible] = useState(false);
    const [hovered, setHovered] = useState(false);
    const navigate = useNavigate();
    const { isDark } = useTheme();
    const accentColor = TAG_COLORS[paper.tags[0]] || '#d4a017';

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 55 * (index || 0));
        return () => clearTimeout(timer);
    }, [index]);

    // Theme-aware card values
    const cardBg      = isDark ? `linear-gradient(160deg, ${accentColor}0d 0%, #111010 50%, #090909 100%)` : `linear-gradient(160deg, ${accentColor}08 0%, #ffffff 50%, #f8f8fc 100%)`;
    const cardShadow  = isDark ? `0 6px 30px ${accentColor}0e, 0 1px 0 rgba(255,255,255,0.03) inset` : `0 6px 30px ${accentColor}18`;
    const cardHoverShadow = isDark ? `0 28px 72px ${accentColor}26, 0 1px 0 rgba(255,255,255,0.05) inset` : `0 28px 72px ${accentColor}30`;
    const titleColor  = isDark ? '#eeeef6' : 'var(--foreground)';
    const authorsColor = isDark ? 'rgba(200,200,230,0.4)' : 'var(--muted-foreground)';
    const abstractColor = isDark ? 'rgba(200,200,230,0.45)' : 'var(--muted-foreground)';
    const starsColor  = isDark ? 'rgba(255,255,255,0.4)' : 'var(--muted-foreground)';
    const bmBorder    = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    const bmIcon      = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
    const statusInactiveColor  = isDark ? 'rgba(255,255,255,0.3)' : 'var(--muted-foreground)';
    const statusInactiveBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    const hoverOverlay = isDark
        ? 'linear-gradient(180deg, transparent 0%, rgba(9,9,11,0.35) 32%, rgba(7,7,9,0.92) 60%, rgba(6,6,8,0.97) 100%)'
        : 'linear-gradient(180deg, transparent 0%, rgba(245,245,255,0.5) 32%, rgba(255,255,255,0.95) 60%, rgba(252,252,255,0.98) 100%)';
    const hoverAbstractColor = isDark ? 'rgba(222,224,236,0.88)' : 'var(--foreground)';

    return (
        <div
            onClick={e => paper.slug && openPaperWithTransition(e.currentTarget, navigate, paper.slug)}
            onMouseDown={() => { preloadPaper(); prefetchPaperHtml(paper.slug); }}
            className="rp-card"
            style={{
                position: 'relative', overflow: 'hidden',
                borderRadius: '20px',
                background: cardBg,
                border: `1px solid ${accentColor}1e`,
                boxShadow: cardShadow,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '22px',
                cursor: paper.slug ? 'pointer' : 'default',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(24px)',
                transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(.34,1.56,.64,1), box-shadow 0.4s ease, border-color 0.3s',
            }}
            onMouseEnter={e => {
                setHovered(true);
                preloadPaper();
                prefetchPaperHtml(paper.slug);
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.003)';
                e.currentTarget.style.boxShadow = cardHoverShadow;
                e.currentTarget.style.borderColor = `${accentColor}3c`;
            }}
            onMouseLeave={e => {
                setHovered(false);
                e.currentTarget.style.transform = visible ? 'translateY(0) scale(1)' : 'translateY(24px)';
                e.currentTarget.style.boxShadow = cardShadow;
                e.currentTarget.style.borderColor = `${accentColor}1e`;
            }}
        >
            {/* Glow orb — top-right */}
            <div style={{
                position: 'absolute', top: '-30px', right: '-30px',
                width: '130px', height: '130px', borderRadius: '50%',
                background: `radial-gradient(circle, ${accentColor}22 0%, transparent 70%)`,
                filter: 'blur(35px)', pointerEvents: 'none',
            }} />
            {/* Glow orb — bottom-left */}
            <div style={{
                position: 'absolute', bottom: '-20px', left: '-20px',
                width: '80px', height: '80px', borderRadius: '50%',
                background: `radial-gradient(circle, ${accentColor}12 0%, transparent 70%)`,
                filter: 'blur(28px)', pointerEvents: 'none',
            }} />

            {/* ── Top content ─────────────────────────────── */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Icon row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '11px',
                        background: `${accentColor}15`,
                        border: `1px solid ${accentColor}35`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 0 16px ${accentColor}18`,
                    }}>
                        <BookOpen size={16} color={accentColor} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Bookmark */}
                        <button
                            onClick={e => { e.stopPropagation(); onToggleBookmark(paper.id); }}
                            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                            style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: bookmarked ? `${accentColor}20` : 'transparent',
                                border: `1px solid ${bookmarked ? accentColor + '55' : bmBorder}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = `${accentColor}20`)}
                            onMouseLeave={e => (e.currentTarget.style.background = bookmarked ? `${accentColor}20` : 'transparent')}
                        >
                            {bookmarked
                                ? <BookmarkCheck size={11} color={accentColor} />
                                : <Bookmark size={11} color={bmIcon} />}
                        </button>
                        {/* External link */}
                        <a
                            href={paper.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Open paper"
                            style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: `${accentColor}12`,
                                border: `1px solid ${accentColor}35`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = `${accentColor}25`)}
                            onMouseLeave={e => (e.currentTarget.style.background = `${accentColor}12`)}
                        >
                            <ExternalLink size={11} color={accentColor} />
                        </a>
                    </div>
                </div>

                {/* Venue + year pill */}
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '3px 10px', borderRadius: '100px',
                    background: `${accentColor}10`, border: `1px solid ${accentColor}25`,
                    marginBottom: '12px',
                }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: accentColor }} />
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: accentColor }}>
                        {paper.venue} · {paper.year}
                    </span>
                </div>

                {/* Title */}
                <h3 style={{
                    fontSize: '0.95rem', fontWeight: 800, color: titleColor,
                    lineHeight: 1.3, marginBottom: '8px', letterSpacing: '-0.01em',
                }}>
                    {paper.title}
                </h3>

                {/* Authors */}
                <p style={{ fontSize: '11px', color: authorsColor, marginBottom: '10px' }}>
                    {paper.authors.join(', ')}{paper.authors.length >= 4 ? ' et al.' : ''}
                </p>

                {/* Abstract — 2-line clamp */}
                <p style={{
                    fontSize: '12px', color: abstractColor, lineHeight: 1.65,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', marginBottom: '12px',
                }}>
                    {paper.abstract}
                </p>

                {/* Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {paper.tags.map(tag => {
                        const c = TAG_COLORS[tag] || accentColor;
                        return (
                            <span
                                key={tag}
                                className="rp-tag"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    fontSize: '9.5px', fontWeight: 600, padding: '3px 9px',
                                    borderRadius: '100px', color: c,
                                    background: `${c}0c`, border: `1px solid ${c}22`,
                                    letterSpacing: '0.02em', transition: 'all 0.25s ease',
                                }}
                                onMouseEnter={e => {
                                    e.stopPropagation();
                                    e.currentTarget.style.background = `${c}1a`;
                                    e.currentTarget.style.borderColor = `${c}44`;
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = `${c}0c`;
                                    e.currentTarget.style.borderColor = `${c}22`;
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                {tag}
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* ── Bottom strip ────────────────────────────── */}
            <div style={{ position: 'relative', zIndex: 5, marginTop: '14px' }}>
                <div style={{
                    width: '100%', height: '1px',
                    background: `linear-gradient(90deg, ${accentColor}40, transparent)`,
                    marginBottom: '12px',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Stars */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Star size={11} color="#fbbf24" fill="#fbbf24" />
                            <span style={{ fontSize: '11px', color: starsColor, fontWeight: 600 }}>{paper.stars}</span>
                        </div>
                        {/* Status chips */}
                        {STATUS_OPTIONS.map(opt => {
                            const active = status === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    onClick={e => { e.stopPropagation(); onSetStatus(paper.id, active ? null : opt.key); }}
                                    title={active ? `Remove "${opt.label}"` : `Mark as ${opt.label}`}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                        padding: '3px 9px', borderRadius: '100px', fontSize: '10px',
                                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                        background: active ? `${opt.color}20` : 'transparent',
                                        color: active ? opt.color : statusInactiveColor,
                                        border: active ? `1px solid ${opt.color}44` : `1px solid ${statusInactiveBorder}`,
                                    }}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = `${opt.color}44`; }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = statusInactiveBorder; }}
                                >
                                    <opt.Icon size={9} />
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                    {/* Arrow */}
                    <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: `${accentColor}12`, border: `1px solid ${accentColor}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <ExternalLink size={12} color={accentColor} />
                    </div>
                </div>
            </div>

            {/* ── Hover preview — full abstract peek + CTA ── */}
            <div
                aria-hidden="true"
                style={{
                    position: 'absolute', inset: 0, zIndex: 3,
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    padding: '22px 22px 60px',
                    background: hoverOverlay,
                    opacity: hovered ? 1 : 0,
                    transform: hovered ? 'translateY(0)' : 'translateY(10px)',
                    transition: 'opacity 0.3s ease, transform 0.34s cubic-bezier(.4,0,.2,1)',
                    pointerEvents: 'none',
                }}
            >
                <div style={{
                    fontSize: '9px', fontWeight: 800, letterSpacing: '0.2em',
                    textTransform: 'uppercase', color: accentColor, marginBottom: '9px',
                    display: 'flex', alignItems: 'center', gap: '7px',
                }}>
                    <span style={{ width: '16px', height: '1px', background: accentColor, opacity: 0.55 }} />
                    Abstract
                </div>
                <p style={{
                    fontSize: '12px', lineHeight: 1.62, color: hoverAbstractColor,
                    display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', marginBottom: '14px',
                }}>
                    {paper.abstract}
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 700, color: accentColor }}>
                    Read paper
                    <ArrowRight size={13} strokeWidth={2.5} />
                </div>
            </div>
        </div>
    );
});

/* ─── localStorage hook ──────────────────────────────────────────────────── */
function useLocalStorage(key, initial) {
    const [value, setValue] = useState(() => {
        try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; }
        catch { return initial; }
    });
    useEffect(() => {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch { /* unavailable in some private-browsing contexts */ }
    }, [key, value]);
    return [value, setValue];
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function ResearchPapers() {
    const navigate   = useNavigate();
    const { isDark } = useTheme();
    const searchRef  = useRef(null);
    const [search,    setSearch]    = useState('');
    const [activeTag, setActiveTag] = useState('All');
    const [activeYear, setActiveYear] = useState('All');
    const [sortBy,    setSortBy]    = useState('newest');
    const [activeTab, setActiveTab] = useState('all');
    const [bookmarks, setBookmarks] = useLocalStorage('rp_bookmarks', []);
    const [statuses,  setStatuses]  = useLocalStorage('rp_statuses', {});

    /* Warm the paper-viewer chunk up-front so the first card click mounts the
       viewer (and its own skeleton) instantly, instead of falling back to the
       lazy route's plain "Loading…" text. */
    useEffect(() => { preloadPaper(); }, []);

    /* Ctrl+K → focus search */
    useEffect(() => {
        const handler = e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const toggleBookmark = useCallback(id =>
        setBookmarks(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]),
    [setBookmarks]);

    const setStatus = useCallback((id, s) =>
        setStatuses(prev => {
            const next = { ...prev };
            if (s === null) delete next[id]; else next[id] = s;
            return next;
        }),
    [setStatuses]);

    const sortPapers = useCallback(list => {
        const copy = [...list];
        if (sortBy === 'newest') return copy.sort((a, b) => b.year - a.year);
        if (sortBy === 'oldest') return copy.sort((a, b) => a.year - b.year);
        if (sortBy === 'top')    return copy.sort((a, b) => b.stars - a.stars);
        if (sortBy === 'az')     return copy.sort((a, b) => a.title.localeCompare(b.title));
        return copy;
    }, [sortBy]);

    const baseFiltered = useMemo(() => PAPERS.filter(p => {
        const q = search.toLowerCase();
        const matchesSearch = !search ||
            p.title.toLowerCase().includes(q) ||
            p.authors.some(a => a.toLowerCase().includes(q)) ||
            p.tags.some(t => t.toLowerCase().includes(q));
        const matchesTag  = activeTag  === 'All' || p.tags.includes(activeTag);
        const matchesYear = activeYear === 'All' || p.year === Number(activeYear);
        return matchesSearch && matchesTag && matchesYear;
    }), [search, activeTag, activeYear]);

    const filtered = useMemo(() => sortPapers(
        activeTab === 'saved' ? baseFiltered.filter(p => bookmarks.includes(p.id)) : baseFiltered
    ), [sortPapers, baseFiltered, activeTab, bookmarks]);

    return (
        <div className="overflow-y-auto h-full text-foreground" style={{ backgroundColor: 'var(--background)' }}>

            <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px 96px' }}>

                {/* ── Back button ──────────────────────────────────────── */}
                <button
                    className="rp-back-btn"
                    onClick={() => navigate('/research')}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '9px',
                        marginBottom: '40px', padding: '10px 20px',
                        borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600,
                        letterSpacing: '0.01em',
                        background: 'linear-gradient(135deg, rgba(224,160,80,0.1) 0%, rgba(224,160,80,0.04) 100%)',
                        border: '1px solid rgba(224,160,80,0.2)',
                        boxShadow: '0 0 0 1px rgba(224,160,80,0.06) inset, 0 4px 16px rgba(0,0,0,0.25)',
                        color: '#e0a050', cursor: 'pointer',
                        transition: 'all 0.22s cubic-bezier(.4,0,.2,1)',
                    }}
                >
                    <ArrowLeft size={14} strokeWidth={2.5} />
                    Back to Research
                </button>

                {/* ── Hero ─────────────────────────────────────────────── */}
                <div style={{ marginBottom: '52px', position: 'relative', overflow: 'visible', animation: 'rpFadeUp 0.5s ease both' }}>
                    {/* Ambient orbs */}
                    <div style={{
                        position: 'absolute', top: '-40px', right: '20px',
                        width: '260px', height: '260px', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(224,160,80,0.13) 0%, transparent 65%)',
                        animation: 'rpOrb1 9s ease-in-out infinite',
                        filter: 'blur(8px)', pointerEvents: 'none', zIndex: 0,
                    }} />
                    <div style={{
                        position: 'absolute', top: '20px', right: '200px',
                        width: '160px', height: '160px', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(251,191,36,0.1) 0%, transparent 70%)',
                        animation: 'rpOrb2 12s ease-in-out infinite',
                        pointerEvents: 'none', zIndex: 0,
                    }} />

                    <div style={{ position: 'relative', zIndex: 1 }}>
                        {/* Eyebrow */}
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '10px',
                            marginBottom: '16px', padding: '5px 14px 5px 8px',
                            borderRadius: '100px',
                            background: 'rgba(224,160,80,0.06)', border: '1px solid rgba(224,160,80,0.14)',
                        }}>
                            <span style={{
                                width: '6px', height: '6px', borderRadius: '50%',
                                background: '#e0a050', boxShadow: '0 0 8px #e0a050',
                                display: 'inline-block', animation: 'rpPulse 2.6s ease-in-out infinite',
                            }} />
                            <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#e0a050' }}>
                                Curated Research
                            </span>
                        </div>

                        {/* Title */}
                        <h1 style={{
                            fontSize: 'clamp(2.2rem,4.5vw,3.6rem)', fontWeight: 900,
                            lineHeight: 1.06, letterSpacing: '-0.035em', marginBottom: '14px',
                            background: isDark
                                ? 'linear-gradient(135deg, #ffffff 0%, #f5f5ff 30%, #fbbf24 72%, #e0a050 100%)'
                                : 'linear-gradient(135deg, #1e1b4b 0%, #92400e 40%, #b45309 72%, #d97706 100%)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                        }}>
                            Research Papers
                        </h1>

                        {/* Subtitle */}
                        <p style={{ color: isDark ? 'rgba(180,185,210,0.65)' : 'var(--muted-foreground)', fontSize: '1rem', maxWidth: '480px', lineHeight: 1.72, marginBottom: '28px' }}>
                            {PAPERS.length} foundational and cutting-edge papers across AI, ML, and systems research. Filter, search, and read.
                        </p>

                        {/* Stats strip */}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {[
                                { label: 'Total Papers', value: PAPERS.length,                                                         icon: BookOpen,    color: '#e0a050' },
                                { label: 'Bookmarked',   value: bookmarks.length,                                                       icon: Bookmark,    color: '#9180e8' },
                                { label: 'Reading',      value: Object.values(statuses).filter(s => s === 'reading').length,            icon: Clock,       color: '#3fa9c9' },
                                { label: 'Completed',    value: Object.values(statuses).filter(s => s === 'done').length,              icon: CheckCircle2, color: '#41bd78' },
                            ].map(stat => (
                                <div
                                    key={stat.label}
                                    className="rp-stat-card"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '10px 18px', borderRadius: '14px',
                                        background: `linear-gradient(135deg, ${stat.color}0d 0%, ${stat.color}05 100%)`,
                                        border: `1px solid ${stat.color}1e`,
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                                        transition: 'all 0.22s cubic-bezier(.4,0,.2,1)',
                                        '--sc': `${stat.color}38`,
                                    }}
                                >
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '9px',
                                        background: `${stat.color}12`, border: `1px solid ${stat.color}22`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <stat.icon size={15} color={stat.color} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '20px', fontWeight: 800, color: stat.color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                                            {stat.value}
                                        </div>
                                        <div style={{ fontSize: '10px', color: isDark ? 'rgba(180,185,210,0.45)' : 'var(--muted-foreground)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: '1px' }}>
                                            {stat.label}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Search + Filters ─────────────────────────────────── */}
                <div style={{ marginBottom: '36px' }}>
                    {/* Search bar */}
                    <div style={{ position: 'relative', marginBottom: '18px' }}>
                        <div style={{
                            position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'rgba(224,160,80,0.08)', border: '1px solid rgba(224,160,80,0.14)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                        }}>
                            <Search size={14} color="#e0a050" />
                        </div>
                        <input
                            ref={searchRef}
                            type="text"
                            className="text-foreground"
                            placeholder="Search by title, author, or topic…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                width: '100%', padding: '14px 110px 14px 58px',
                                borderRadius: '16px', fontSize: '14px',
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                outline: 'none', boxSizing: 'border-box',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.04) inset',
                                transition: 'border-color 0.22s, box-shadow 0.22s',
                            }}
                            onFocus={e => {
                                e.target.style.borderColor = 'rgba(224,160,80,0.35)';
                                e.target.style.boxShadow = '0 0 0 3px rgba(224,160,80,0.1), 0 4px 20px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.04) inset';
                            }}
                            onBlur={e => {
                                e.target.style.borderColor = 'rgba(255,255,255,0.08)';
                                e.target.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.04) inset';
                            }}
                        />
                        <div style={{
                            position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                            display: 'flex', alignItems: 'center', gap: '3px', pointerEvents: 'none',
                        }}>
                            <kbd style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 7px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'rgba(180,185,210,0.45)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit', letterSpacing: '0.02em' }}>Ctrl</kbd>
                            <span style={{ fontSize: '9px', color: 'rgba(180,185,210,0.3)' }}>+</span>
                            <kbd style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 7px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: 'rgba(180,185,210,0.45)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit' }}>K</kbd>
                        </div>
                    </div>

                    {/* Tag filters — with color dots */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        {['All', ...ALL_TAGS].map(tag => {
                            const active = activeTag === tag;
                            const c = TAG_COLORS[tag] || '#e0a050';
                            return (
                                <button
                                    key={tag}
                                    onClick={() => setActiveTag(tag)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 14px', borderRadius: '100px', fontSize: '12px',
                                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.25s ease',
                                        background: active ? (tag === 'All' ? '#e0a050' : c) : 'var(--card)',
                                        color:      active ? (tag === 'All' ? '#000'   : '#fff') : 'var(--muted-foreground)',
                                        border:     active ? `1px solid ${tag === 'All' ? '#e0a050' : c}` : '1px solid var(--border)',
                                    }}
                                    onMouseEnter={e => {
                                        if (!active) {
                                            e.currentTarget.style.borderColor = `${c}66`;
                                            e.currentTarget.style.transform   = 'translateY(-2px)';
                                            e.currentTarget.style.boxShadow   = `0 4px 14px ${c}25`;
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (!active) {
                                            e.currentTarget.style.borderColor = 'var(--border)';
                                            e.currentTarget.style.transform   = 'translateY(0)';
                                            e.currentTarget.style.boxShadow   = 'none';
                                        }
                                    }}
                                >
                                    {/* Color dot on non-"All" tags */}
                                    {tag !== 'All' && (
                                        <span style={{
                                            width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                                            background: active ? '#fff' : c,
                                            opacity: active ? 0.9 : 1,
                                            boxShadow: active ? 'none' : `0 0 6px ${c}88`,
                                            transition: 'all 0.25s',
                                        }} />
                                    )}
                                    {tag}
                                </button>
                            );
                        })}
                    </div>

                    {/* Year filters */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '4px' }}>
                            <Tag size={12} color="var(--muted-foreground)" />
                            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600 }}>Year:</span>
                        </div>
                        {['All', ...ALL_YEARS].map(y => {
                            const active = activeYear === String(y);
                            return (
                                <button
                                    key={y}
                                    onClick={() => setActiveYear(String(y))}
                                    style={{
                                        padding: '4px 12px', borderRadius: '100px', fontSize: '12px',
                                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                        background: active ? '#e0a050' : 'var(--card)',
                                        color:      active ? '#000'    : 'var(--muted-foreground)',
                                        border:     active ? '1px solid #e0a050' : '1px solid var(--border)',
                                    }}
                                >
                                    {y}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Tabs + Sort row ──────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px' }}>
                        {[
                            { key: 'all',   label: `All Papers (${baseFiltered.length})` },
                            { key: 'saved', label: `Saved (${PAPERS.filter(p => bookmarks.includes(p.id)).length})` },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    padding: '6px 16px', borderRadius: '8px', fontSize: '13px',
                                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                                    background: activeTab === tab.key ? '#e0a050' : 'transparent',
                                    color:      activeTab === tab.key ? '#000'    : 'var(--muted-foreground)',
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Sort */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ArrowUpDown size={13} color="var(--muted-foreground)" />
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', marginRight: '4px' }}>Sort:</span>
                        {SORT_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setSortBy(opt.key)}
                                style={{
                                    padding: '5px 12px', borderRadius: '100px', fontSize: '12px',
                                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                    background: sortBy === opt.key ? 'var(--foreground)' : 'var(--card)',
                                    color:      sortBy === opt.key ? 'var(--background)'  : 'var(--muted-foreground)',
                                    border:     sortBy === opt.key ? '1px solid transparent'     : '1px solid var(--border)',
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Results count */}
                <p className="text-muted-foreground" style={{ fontSize: '13px', marginBottom: '20px' }}>
                    Showing <strong className="text-foreground">{filtered.length}</strong> paper{filtered.length !== 1 ? 's' : ''}
                </p>

                {/* ── Papers grid ──────────────────────────────────────── */}
                {filtered.length === 0 ? (
                    <div className="text-muted-foreground" style={{ textAlign: 'center', padding: '80px 0' }}>
                        <BookOpen size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                        <p style={{ fontSize: '16px', fontWeight: 600 }}>
                            {activeTab === 'saved' ? 'No saved papers yet' : 'No papers match your search'}
                        </p>
                        <p style={{ fontSize: '13px', marginTop: '6px' }}>
                            {activeTab === 'saved'
                                ? 'Bookmark papers using the bookmark icon on each card'
                                : 'Try a different keyword or clear the filters'}
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '20px' }}>
                        {filtered.map((paper, idx) => (
                            <PaperCard
                                key={paper.id}
                                paper={paper}
                                index={idx}
                                bookmarked={bookmarks.includes(paper.id)}
                                status={statuses[paper.id] || null}
                                onToggleBookmark={toggleBookmark}
                                onSetStatus={setStatus}
                            />
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}
