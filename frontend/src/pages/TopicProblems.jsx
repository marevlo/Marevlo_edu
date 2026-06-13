import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Target, ChevronDown, Search } from 'lucide-react';
import { loadAllTopics } from '../utils/topicsLoader';
import { useTheme } from '../context/ThemeContext';

const difficultyConfig = {
    Easy:   { label: 'Easy',   color: '#41bd78', bg: 'rgba(65,189,120,0.12)',  border: 'rgba(65,189,120,0.35)'  },
    Medium: { label: 'Medium', color: '#e0a050', bg: 'rgba(224,160,80,0.12)', border: 'rgba(224,160,80,0.35)' },
    Hard:   { label: 'Hard',   color: '#e06661', bg: 'rgba(224,102,97,0.12)', border: 'rgba(224,102,97,0.35)'  },
};

const DIFFICULTY_ORDER = { Easy: 0, Medium: 1, Hard: 2 };

function SkeletonRow() {
    return (
        <div className="flex items-center justify-between px-6 py-4 animate-pulse border-b border-border">
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                <div className="w-48 h-4 rounded-full bg-neutral-200 dark:bg-neutral-700" />
            </div>
            <div className="w-16 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        </div>
    );
}

export default function TopicProblems() {
    const { topicId } = useParams();
    const navigate = useNavigate();
    const { isDark } = useTheme();

    const [topic, setTopic] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadAllTopics()
            .then(topics => {
                const found = topics.find(t => t.id === topicId);
                setTopic(found || null);
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [topicId]);

    const problems = topic?.problems || [];

    const filtered = (() => {
        let list = filter === 'All' ? problems : problems.filter(p => p.difficulty === filter);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p => p.title.toLowerCase().includes(q));
        }
        return list;
    })();

    const counts = {
        All:    problems.length,
        Easy:   problems.filter(p => p.difficulty === 'Easy').length,
        Medium: problems.filter(p => p.difficulty === 'Medium').length,
        Hard:   problems.filter(p => p.difficulty === 'Hard').length,
    };

    const filterColors = {
        All:    { active: '#6672e0', bg: 'rgba(102,114,224,0.12)', border: 'rgba(102,114,224,0.35)' },
        Easy:   { active: '#41bd78', bg: 'rgba(65,189,120,0.12)', border: 'rgba(65,189,120,0.35)' },
        Medium: { active: '#e0a050', bg: 'rgba(224,160,80,0.12)', border: 'rgba(224,160,80,0.35)'  },
        Hard:   { active: '#e06661', bg: 'rgba(224,102,97,0.12)',  border: 'rgba(224,102,97,0.35)'   },
    };

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar text-foreground" style={{ backgroundColor: 'var(--color-app-bg)' }}>

            {/* Header bar */}
            <div
                className="sticky top-0 z-30 px-8 py-3 flex items-center gap-4 backdrop-blur-xl border-b"
                style={{
                    background: isDark ? 'rgba(9,9,15,0.85)' : 'rgba(255,255,255,0.85)',
                    borderColor: 'var(--color-border)',
                }}
            >
                <button
                    onClick={() => navigate('/problems')}
                    className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-70 text-muted-foreground"
                >
                    <ArrowLeft size={16} />
                    All Topics
                </button>
                <span style={{ color: 'var(--color-border)' }}>/</span>
                <span className="text-sm font-bold text-foreground">
                    {loading ? '…' : topic?.name}
                </span>
            </div>

            <div className="page-container" style={{ padding: '32px 0 64px' }}>

                {/* Topic hero */}
                <div className="relative overflow-hidden rounded-2xl mb-8 border" style={{ borderColor: 'var(--color-border)', background: isDark ? '#14161d' : 'var(--card)' }}>
                    {/* Subtle grid backdrop (calm, matches the landing) */}
                    <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px', maskImage: 'radial-gradient(circle at center, black 20%, transparent 90%)' }} />

                    <div style={{ position: 'relative', zIndex: 1, padding: '32px 32px 28px' }}>
                        <h1 className="courses-hero-title-grad" style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 16 }}>
                            {loading ? 'Loading…' : topic?.name}
                        </h1>
                        {/* Colored stat chips */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {[
                                { label: `${counts.All} Problems`,  color: '#6672e0' },
                                { label: `${counts.Easy} Easy`,     color: '#41bd78' },
                                { label: `${counts.Medium} Medium`, color: '#e0a050' },
                                { label: `${counts.Hard} Hard`,     color: '#e06661' },
                            ].map(({ label, color }) => (
                                <span key={label} style={{
                                    display: 'inline-flex', alignItems: 'center',
                                    padding: '4px 12px', borderRadius: 999,
                                    background: color + '15',
                                    border: `1px solid ${color}35`,
                                    fontSize: '0.72rem', fontWeight: 700,
                                    color: color,
                                    backdropFilter: 'blur(8px)',
                                }}>
                                    {label}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Difficulty filter pills */}
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                    {['All', 'Easy', 'Medium', 'Hard'].map(d => {
                        const fc = filterColors[d];
                        const isActive = filter === d;
                        return (
                            <button
                                key={d}
                                onClick={() => setFilter(d)}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold transition-all"
                                style={{
                                    background: isActive ? fc.bg : 'var(--color-surface)',
                                    border: `1px solid ${isActive ? fc.border : 'var(--color-border)'}`,
                                    color: isActive ? fc.active : 'var(--color-muted-text)',
                                    transform: isActive ? 'scale(1.04)' : 'scale(1)',
                                }}
                            >
                                {d}
                                <span
                                    className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                                    style={{
                                        background: isActive ? fc.active + '22' : 'var(--color-surface-hover)',
                                        color: isActive ? fc.active : 'var(--color-muted-text)',
                                    }}
                                >
                                    {counts[d]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Search bar */}
                <div style={{ position: 'relative', marginBottom: 20 }}>
                    <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted-text)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Search problems…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            paddingLeft: 38, paddingRight: 16,
                            paddingTop: 10, paddingBottom: 10,
                            borderRadius: 12,
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--foreground)',
                            fontSize: '0.875rem',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.target.style.borderColor = 'rgba(102,114,224,0.5)'}
                        onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                    />
                </div>

                {/* Problem list */}
                <div
                    className="rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                >
                    {/* Table header */}
                    <div
                        className="grid px-6 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                        style={{
                            gridTemplateColumns: '48px 1fr 110px 60px',
                            borderBottom: '1px solid var(--color-border)',
                            background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        }}
                    >
                        <span>#</span>
                        <span>Title</span>
                        <span>Difficulty</span>
                        <span></span>
                    </div>

                    {loading
                        ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                        : filtered.length === 0
                            ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <div className="text-4xl mb-3">🔍</div>
                                    <p className="text-sm font-semibold">No {filter} problems yet</p>
                                </div>
                            )
                            : filtered.map((problem, idx) => {
                                const dc = difficultyConfig[problem.difficulty] || difficultyConfig.Hard;
                                const rowAccent = problem.difficulty === 'Easy' ? '#41bd78' : problem.difficulty === 'Medium' ? '#e0a050' : '#e06661';
                                return (
                                    <button
                                        key={problem.id}
                                        onClick={() => navigate(`/problems/${topicId}/${problem.id}`)}
                                        className="w-full grid items-center px-6 py-4 text-left group transition-all"
                                        style={{
                                            gridTemplateColumns: '48px 1fr 110px 60px',
                                            borderTop: idx > 0 ? '1px solid var(--color-border)' : 'none',
                                            borderLeft: '3px solid transparent',
                                            transition: 'all 0.15s ease',
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'var(--color-surface-hover)';
                                            e.currentTarget.style.borderLeftColor = rowAccent;
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'transparent';
                                            e.currentTarget.style.borderLeftColor = 'transparent';
                                        }}
                                    >
                                        {/* Number */}
                                        <span
                                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-muted-foreground"
                                            style={{
                                                background: 'var(--color-surface-hover)',
                                                border: '1px solid var(--color-border)',
                                            }}
                                        >
                                            {idx + 1}
                                        </span>

                                        {/* Title */}
                                        <span className="font-medium text-sm pr-4 text-foreground">
                                            {problem.title}
                                        </span>

                                        {/* Difficulty */}
                                        <span
                                            className="text-xs px-2.5 py-0.5 rounded-full font-semibold w-fit"
                                            style={{
                                                background: dc.bg,
                                                color: dc.color,
                                                border: `1px solid ${dc.border}`,
                                            }}
                                        >
                                            {dc.label}
                                        </span>

                                        {/* Arrow */}
                                        <ArrowRight
                                            size={15}
                                            className="transition-transform duration-200 group-hover:translate-x-1 ml-auto text-muted-foreground"
                                        />
                                    </button>
                                );
                            })
                    }
                </div>

                {!loading && filtered.length > 0 && (
                    <p className="text-xs mt-4 text-center text-muted-foreground">
                        Showing {filtered.length} of {counts.All} problems
                    </p>
                )}
            </div>
        </div>
    );
}
