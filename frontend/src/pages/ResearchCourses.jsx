import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowUpRight, ArrowLeft, Search, Brain, BookOpen, Layers,
    Database, GitBranch, Network, Cpu, FlaskConical, Zap,
    Sparkles, Clock, Play, Code2, Server, ChevronRight, Home
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

//  RESEARCH COURSE DATA

const RESEARCH_COURSES = [
    {
        id: 'agentic-search',
        num: '01',
        label: 'Agentic Search',
        topic: 'Agentic AI',
        tagline: 'AI-Powered Retrieval',
        description: 'How agents use search as a cognitive tool designing, planning, and executing multi-step retrieval to answer complex questions.',
        icon: Search,
        accentPrimary: '#6672e0',
        accentSecondary: '#98a0ed',
        accentTertiary: '#3fa9c9',
        bgGradient: 'linear-gradient(145deg, #0d0221 0%, #1a0533 45%, #0f0a2e 100%)',
        lightBgGradient: 'linear-gradient(145deg, #f5f3ff 0%, #ede9fe 45%, #f0f9ff 100%)',
        orbColor1: 'rgba(102,114,224,0.55)',
        orbColor2: 'rgba(63,169,201,0.35)',
        shadowColor: 'rgba(102,114,224,0.45)',
        watermarkColor: 'rgba(102,114,224,0.05)',
        hoverClass: 'rc-card-1',
        modules: [
            { id: 'as-m0', num: '00', label: 'What Makes Search Agentic?', icon: BookOpen, level: 'Beginner', duration: '~25m' },
            { id: 'as-m1', num: '01', label: 'Search Tool Design', icon: Code2, level: 'Intermediate', duration: '~25m' },
            { id: 'as-m2', num: '02', label: 'Multi-Step Retrieval Planning', icon: GitBranch, level: 'Intermediate', duration: '~25m' },
            { id: 'as-m3', num: '03', label: 'Web Search Integration', icon: Network, level: 'Intermediate', duration: '~25m' },
            { id: 'as-m4', num: '04', label: 'Structured & Code Search', icon: Database, level: 'Advanced', duration: '~25m' },
            { id: 'as-m5', num: '05', label: 'Search Evaluation & Reliability', icon: FlaskConical, level: 'Advanced', duration: '~25m' },
            { id: 'as-m6', num: '06', label: 'Production Agentic Search Systems', icon: Server, level: 'Advanced', duration: '~25m' },
        ],
    },
    {
        id: 'context-engineering',
        num: '02',
        label: 'Context Engineering',
        topic: 'Agentic AI',
        tagline: 'Prompt & Memory Craft',
        description: 'The art and science of shaping what an LLM sees from prompt anatomy and memory systems to multi-modal context and agent tool-use.',
        icon: Brain,
        accentPrimary: '#9180e8',
        accentSecondary: '#ab9df0',
        accentTertiary: '#b988d6',
        bgGradient: 'linear-gradient(145deg, #0f0520 0%, #1e0835 45%, #140728 100%)',
        lightBgGradient: 'linear-gradient(145deg, #faf5ff 0%, #f3e8ff 45%, #fdf4ff 100%)',
        orbColor1: 'rgba(145,128,232,0.55)',
        orbColor2: 'rgba(236,72,153,0.35)',
        shadowColor: 'rgba(145,128,232,0.45)',
        watermarkColor: 'rgba(145,128,232,0.05)',
        hoverClass: 'rc-card-2',
        modules: [
            { id: 'ce-m0', num: '00', label: 'Context Window as Resource', icon: BookOpen, level: 'Beginner', duration: '~25m' },
            { id: 'ce-m1', num: '01', label: 'Information Architecture', icon: Layers, level: 'Beginner', duration: '~25m' },
            { id: 'ce-m2', num: '02', label: 'Dynamic Context Assembly', icon: Cpu, level: 'Intermediate', duration: '~25m' },
            { id: 'ce-m3', num: '03', label: 'System Prompt Engineering', icon: Sparkles, level: 'Intermediate', duration: '~25m' },
            { id: 'ce-m4', num: '04', label: 'Few-Shot & In-Context Learning', icon: Zap, level: 'Intermediate', duration: '~25m' },
            { id: 'ce-m5', num: '05', label: 'Memory Systems', icon: Database, level: 'Advanced', duration: '~25m' },
            { id: 'ce-m6', num: '06', label: 'Multimodal Context', icon: Network, level: 'Advanced', duration: '~25m' },
            { id: 'ce-m7', num: '07', label: 'Context for Agents & Tools', icon: GitBranch, level: 'Advanced', duration: '~25m' },
            { id: 'ce-m8', num: '08', label: 'Evaluation & Optimization', icon: FlaskConical, level: 'Advanced', duration: '~25m' },
        ],
    },
    {
        id: 'recommender-system',
        num: '03',
        label: 'Recommender System',
        topic: 'Agentic AI',
        tagline: 'Retrieval, Ranking & GenAI Recsys',
        description: 'Recommendation fundamentals, graph methods, generative retrieval, and agentic recommenders in paired conceptual and deep-dive lessons.',
        icon: Database,
        accentPrimary: '#7c3aed',
        accentSecondary: '#ab9df0',
        accentTertiary: '#6672e0',
        bgGradient: 'linear-gradient(145deg, #120522 0%, #22083a 45%, #16082b 100%)',
        lightBgGradient: 'linear-gradient(145deg, #f5f3ff 0%, #ede9fe 45%, #f3e8ff 100%)',
        orbColor1: 'rgba(124,58,237,0.52)',
        orbColor2: 'rgba(102,114,224,0.28)',
        shadowColor: 'rgba(124,58,237,0.42)',
        watermarkColor: 'rgba(124,58,237,0.05)',
        hoverClass: 'rc-card-3',
        modules: [
            { id: 'rs-m0', label: 'The Recommendation Problem', icon: BookOpen, level: 'Beginner', duration: '~3h' },
            { id: 'rs-m1', label: 'Baselines & Content-Based', icon: Layers, level: 'Beginner', duration: '~3h' },
            { id: 'rs-m2', label: 'Collaborative Filtering', icon: Network, level: 'Beginner', duration: '~3h' },
            { id: 'rs-m3', label: 'Matrix Factorization', icon: Database, level: 'Beginner', duration: '~3h' },
            { id: 'rs-m4', label: 'Deep Collaborative Filtering', icon: Brain, level: 'Intermediate', duration: '~3h' },
            { id: 'rs-m5', label: 'Sequential & Session-Based', icon: GitBranch, level: 'Intermediate', duration: '~3h' },
            { id: 'rs-m6', label: 'Context-Aware CTR', icon: Zap, level: 'Intermediate', duration: '~3h' },
            { id: 'rs-m7', label: 'System Design', icon: Server, level: 'Advanced', duration: '~3h' },
            { id: 'rs-m8', label: 'Graph-Based Recsys', icon: Network, level: 'Advanced', duration: '~3h' },
            { id: 'rs-m9', label: 'Knowledge-Aware Recsys', icon: Home, level: 'Advanced', duration: '~3h' },
            { id: 'rs-m10', label: 'LLMs in Recsys', icon: Sparkles, level: 'Advanced', duration: '~3h' },
            { id: 'rs-m11', label: 'Generative Recsys', icon: Cpu, level: 'Advanced', duration: '~3h' },
            { id: 'rs-m12', label: 'Agentic Conversational Recsys', icon: Search, level: 'Advanced', duration: '~3h' },
            { id: 'rs-m13', label: 'Evaluation & Responsible Deployment', icon: FlaskConical, level: 'Advanced', duration: '~3h' },
        ],
    },
];

const LEVEL_COLORS = {
    Beginner:     { bg: 'rgba(65,189,120,0.12)', color: '#41bd78', border: 'rgba(65,189,120,0.3)' },
    Intermediate: { bg: 'rgba(224,160,80,0.12)', color: '#e0a050', border: 'rgba(224,160,80,0.3)' },
    Advanced:     { bg: 'rgba(145,128,232,0.12)', color: '#9180e8', border: 'rgba(145,128,232,0.3)' },
};

//  MAIN PAGE

export default function ResearchCourses() {
    const navigate = useNavigate();
    const { isDark } = useTheme();
    const location = useLocation();
    const courseIdFromUrl = React.useMemo(() => {
        const segments = location.pathname.split('/').filter(Boolean);
        if (segments[0] !== 'research' || segments[1] !== 'courses' || segments.length < 3) return null;
        return segments[2];
    }, [location.pathname]);
    const selectedCourse = RESEARCH_COURSES.find((course) => course.id === courseIdFromUrl) || null;
    const SelectedIcon = selectedCourse?.icon;

    // Theme-aware helpers
    const titleColor   = isDark ? '#eeeeff'                  : 'var(--foreground)';
    const descColor    = isDark ? 'rgba(200,200,240,0.75)'   : 'var(--muted-foreground)';
    const descColorAlt = isDark ? 'rgba(200,200,240,0.55)'   : 'var(--muted-foreground)';
    const chipBg       = isDark ? 'rgba(255,255,255,0.08)'   : 'rgba(0,0,0,0.05)';
    const chipBorder   = isDark ? 'rgba(255,255,255,0.15)'   : 'rgba(0,0,0,0.1)';
    const chipText     = isDark ? 'rgba(255,255,255,0.8)'    : 'var(--foreground)';
    const chipTextAlt  = isDark ? 'rgba(200,200,240,0.7)'    : 'var(--muted-foreground)';
    const chipBgSm     = isDark ? 'rgba(255,255,255,0.04)'   : 'rgba(0,0,0,0.04)';
    const chipBorderSm = isDark ? 'rgba(255,255,255,0.08)'   : 'rgba(0,0,0,0.08)';
    const modTitleClr  = isDark ? '#ffffff'                  : 'var(--foreground)';
    const modDurClr    = isDark ? 'rgba(255,255,255,0.75)'   : 'var(--muted-foreground)';
    // Light mode: white surface + faint accent wash and crisp neutral chrome
    // (matches components/ShowcaseCard.jsx) — a full pastel gradient blends
    // into the pale page background. Dark keeps its rich gradients.
    const bg = (c) => isDark
        ? c.bgGradient
        : `radial-gradient(130% 70% at 0% 0%, ${c.accentPrimary}0D 0%, rgba(255,255,255,0) 55%), #ffffff`;
    const cardBorder = (c) => isDark ? '1px solid transparent' : '1px solid rgba(15,23,42,0.08)';
    const cardShadow = (c) => isDark
        ? `0 16px 48px ${c.shadowColor.replace('0.45', '0.15')}`
        : '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.05)';

    return (
        <>

            <div className="overflow-y-auto h-full text-foreground" style={{ backgroundColor: 'var(--color-app-bg)' }}>
                <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '40px 24px 96px' }}>

                    {/* Back button */}
                    <button
                        onClick={() => navigate('/research')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            marginBottom: '48px', padding: '10px 18px',
                            borderRadius: '14px', fontSize: '0.82rem', fontWeight: 600,
                            background: 'rgba(102,114,224,0.08)',
                            border: '1px solid rgba(102,114,224,0.2)',
                            color: '#98a0ed', cursor: 'pointer',
                            transition: 'all 0.25s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(102,114,224,0.15)';
                            e.currentTarget.style.borderColor = 'rgba(102,114,224,0.4)';
                            e.currentTarget.style.transform = 'translateX(-3px)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(102,114,224,0.08)';
                            e.currentTarget.style.borderColor = 'rgba(102,114,224,0.2)';
                            e.currentTarget.style.transform = 'translateX(0)';
                        }}
                    >
                        <ArrowLeft size={16} /> Back to Research
                    </button>

                    {/* Page Header */}
                    <div style={{ marginBottom: '60px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                            <div style={{ width: '28px', height: '2px', background: 'linear-gradient(90deg,#6672e0,#9180e8)' }} />
                            <span style={{
                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.22em',
                                textTransform: 'uppercase', color: '#6672e0'
                            }}>
                                Research Curriculum
                            </span>
                        </div>
                        <h1 className="text-foreground" style={{
                            fontSize: 'clamp(2.2rem,5vw,3.8rem)', fontWeight: 900,
                            lineHeight: 1.06, letterSpacing: '-0.03em',
                            marginBottom: '16px'
                        }}>
                            Research Courses
                        </h1>
                        <p className="text-muted-foreground" style={{ fontSize: '1.05rem', maxWidth: '520px', lineHeight: 1.7 }}>
                            Deep, focused courses tied to the research that's reshaping how we build AI systems. Each course is self-contained and hands-on.
                        </p>
                    </div>

                    {/* Course Cards */}
                    {selectedCourse ? (
                        <>
                            <button
                                onClick={() => navigate('/research/courses')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    marginBottom: '36px', padding: '10px 18px',
                                    borderRadius: '14px', fontSize: '0.82rem', fontWeight: 600,
                                    background: 'rgba(102,114,224,0.08)',
                                    border: '1px solid rgba(102,114,224,0.2)',
                                    color: '#98a0ed', cursor: 'pointer',
                                    transition: 'all 0.25s',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(102,114,224,0.15)';
                                    e.currentTarget.style.borderColor = 'rgba(102,114,224,0.4)';
                                    e.currentTarget.style.transform = 'translateX(-3px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(102,114,224,0.08)';
                                    e.currentTarget.style.borderColor = 'rgba(102,114,224,0.2)';
                                    e.currentTarget.style.transform = 'translateX(0)';
                                }}
                            >
                                <ArrowLeft size={16} /> Back to courses
                            </button>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '20px', marginBottom: '24px' }}>
                                <div
                                    className={`rc-card ${selectedCourse.hoverClass}`}
                                    style={{
                                        position: 'relative', overflow: 'hidden',
                                        borderRadius: '24px', background: bg(selectedCourse),
                                        border: cardBorder(selectedCourse),
                                        boxShadow: cardShadow(selectedCourse),
                                        padding: '24px', minHeight: '280px',
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute', right: '16px', top: '8px',
                                        fontSize: '120px', fontWeight: 900, lineHeight: 1,
                                        color: selectedCourse.watermarkColor, letterSpacing: '-0.06em',
                                        userSelect: 'none', pointerEvents: 'none',
                                    }}>{selectedCourse.num}</div>
                                    <div style={{ position: 'relative', zIndex: 1 }}>
                                        <div style={{
                                            width: '42px', height: '42px', borderRadius: '12px',
                                                background: `${selectedCourse.accentPrimary}18`,
                                            border: `1px solid ${selectedCourse.accentPrimary}66`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            marginBottom: '18px',
                                        }}>
                                            {SelectedIcon && <SelectedIcon size={18} color={selectedCourse.accentSecondary} />}
                                        </div>
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '4px 12px', borderRadius: '100px',
                                            background: `${selectedCourse.accentPrimary}1F`,
                                            border: `1px solid ${selectedCourse.accentPrimary}4D`,
                                            marginBottom: '14px',
                                        }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: selectedCourse.accentSecondary }} />
                                            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: selectedCourse.accentSecondary }}>
                                                {selectedCourse.tagline}
                                            </span>
                                        </div>
                                        <h2 style={{
                                            fontSize: '1.7rem', fontWeight: 900, color: titleColor,
                                            lineHeight: 1.06, marginBottom: '10px', letterSpacing: '-0.02em'
                                        }}>{selectedCourse.label}</h2>
                                        <p style={{ fontSize: '0.92rem', color: descColor, lineHeight: 1.7, maxWidth: '500px' }}>
                                            {selectedCourse.description}
                                        </p>
                                        <div style={{ display: 'flex', gap: '18px', marginTop: '18px', flexWrap: 'wrap' }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '8px 14px', borderRadius: '999px',
                                                background: chipBg, border: `1px solid ${chipBorder}`,
                                            }}>
                                                <BookOpen size={13} color={selectedCourse.accentSecondary} />
                                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: chipText }}>
                                                    {selectedCourse.modules.length} modules
                                                </span>
                                            </div>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '8px 14px', borderRadius: '999px',
                                                background: chipBg, border: `1px solid ${chipBorder}`,
                                            }}>
                                                <Sparkles size={13} color={selectedCourse.accentSecondary} />
                                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: chipText }}>
                                                    Agentic AI
                                                </span>
                                            </div>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '8px 14px', borderRadius: '999px',
                                                background: chipBg, border: `1px solid ${chipBorder}`,
                                            }}>
                                                <Clock size={13} color={selectedCourse.accentSecondary} />
                                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: chipText }}>
                                                    ~{selectedCourse.modules.length * 25}m total
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{
                                            fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.16em',
                                            textTransform: 'uppercase', color: selectedCourse.accentSecondary,
                                            marginBottom: '10px',
                                        }}>
                                            Course Modules
                                        </div>
                                        <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, color: titleColor }}>
                                            {selectedCourse.label} Modules
                                        </h2>
                                        <p style={{ marginTop: '10px', fontSize: '0.95rem', color: chipTextAlt, maxWidth: '620px', lineHeight: 1.7 }}>
                                            Select a module card to jump into the lesson. This is the same card-driven experience as Courses.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '22px' }}>
                                {selectedCourse.modules.map((mod, index) => {
                                    const ModIcon = mod.icon;
                                    const lvl = LEVEL_COLORS[mod.level] || LEVEL_COLORS.Intermediate;
                                    const modGradient = isDark
                                        ? `linear-gradient(135deg, ${selectedCourse.accentPrimary}22, ${selectedCourse.accentTertiary}18)`
                                        : `linear-gradient(135deg, ${selectedCourse.accentPrimary}0A, rgba(255,255,255,0) 55%), #ffffff`;
                                    const modBorder = isDark ? `1.5px solid ${selectedCourse.accentPrimary}35` : '1px solid rgba(15,23,42,0.08)';
                                    const modShadow = isDark
                                        ? `0 20px 60px ${selectedCourse.shadowColor.replace('0.45', '0.1')}, inset 0 1px 0 ${selectedCourse.accentPrimary}20`
                                        : '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.05)';
                                    const modHoverShadow = isDark
                                        ? `0 30px 80px ${selectedCourse.shadowColor.replace('0.45', '0.25')}, inset 0 1px 0 ${selectedCourse.accentPrimary}40`
                                        : `0 4px 8px rgba(15,23,42,0.04), 0 16px 40px rgba(15,23,42,0.08), 0 16px 48px ${selectedCourse.shadowColor.replace('0.45', '0.14')}`;

                                    return (
                                        <div
                                            key={mod.id}
                                            onClick={() => navigate(`/research/course/${mod.id}`)}
                                            style={{
                                                cursor: 'pointer',
                                                borderRadius: '20px',
                                                padding: '24px',
                                                background: modGradient,
                                                border: modBorder,
                                                boxShadow: modShadow,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'space-between',
                                                minHeight: '260px',
                                                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                position: 'relative',
                                                overflow: 'hidden',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = isDark ? 'translateY(-8px) scale(1.02)' : 'translateY(-4px)';
                                                e.currentTarget.style.boxShadow = modHoverShadow;
                                                e.currentTarget.style.borderColor = `${selectedCourse.accentPrimary}${isDark ? '60' : '59'}`;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                                e.currentTarget.style.boxShadow = modShadow;
                                                e.currentTarget.style.borderColor = isDark ? `${selectedCourse.accentPrimary}35` : 'rgba(15,23,42,0.08)';
                                            }}
                                        >
                                            {/* Glow accent — dark mode only; a colored blur reads muddy on white */}
                                            {isDark && (
                                                <div style={{
                                                    position: 'absolute', top: '-40px', right: '-40px',
                                                    width: '120px', height: '120px', borderRadius: '50%',
                                                    background: `radial-gradient(circle, ${selectedCourse.orbColor1} 0%, transparent 70%)`,
                                                    filter: 'blur(30px)',
                                                    pointerEvents: 'none',
                                                }} />
                                            )}

                                            {/* Module number watermark */}
                                            <div style={{
                                                position: 'absolute', right: '12px', top: '4px',
                                                fontSize: '80px', fontWeight: 900, lineHeight: 1,
                                                color: selectedCourse.watermarkColor, letterSpacing: '-0.05em',
                                                userSelect: 'none', pointerEvents: 'none',
                                            }}>
                                                {mod.num || String(index).padStart(2, '0')}
                                            </div>

                                            <div style={{ position: 'relative', zIndex: 1 }}>
                                                {/* Icon */}
                                                <div style={{
                                                    width: '48px', height: '48px', borderRadius: '14px',
                                                    background: `${selectedCourse.accentPrimary}18`,
                                                    border: `1px solid ${selectedCourse.accentPrimary}50`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    marginBottom: '16px',
                                                    boxShadow: `0 8px 20px ${selectedCourse.accentPrimary}20`,
                                                }}>
                                                    <ModIcon size={24} color={selectedCourse.accentSecondary} />
                                                </div>

                                                {/* Title and level */}
                                                <h3 style={{
                                                    fontSize: '1.15rem', fontWeight: 800, color: modTitleClr, marginBottom: '8px',
                                                    lineHeight: 1.3, letterSpacing: '-0.01em'
                                                }}>
                                                    {mod.label}
                                                </h3>

                                                {/* Duration and level info */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        fontSize: '0.85rem', color: modDurClr, fontWeight: 500,
                                                        display: 'flex', alignItems: 'center', gap: '4px'
                                                    }}>
                                                        {mod.duration}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.72rem', fontWeight: 700, padding: '4px 9px',
                                                        borderRadius: '999px',
                                                        background: lvl.bg, color: lvl.color,
                                                        border: `1px solid ${lvl.border}`,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.04em',
                                                    }}>
                                                        {mod.level}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* CTA arrow at bottom */}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', position: 'relative', zIndex: 1 }}>
                                                <div style={{
                                                    width: '36px', height: '36px', borderRadius: '50%',
                                                    background: `${selectedCourse.accentPrimary}15`,
                                                    border: `1px solid ${selectedCourse.accentPrimary}35`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    transition: 'all 0.3s ease',
                                                }}>
                                                    <ArrowUpRight size={16} color={selectedCourse.accentSecondary} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '20px' }}>
                            {RESEARCH_COURSES.map((course) => {
                                const Icon = course.icon;
                                return (
                                    <div key={course.id}>
                                        <div className="rc-part-label" style={{ color: course.accentPrimary }}>
                                            Part {course.num} &nbsp;·&nbsp; {course.label}
                                        </div>
                                        <div
                                            className={`rc-card ${course.hoverClass}`}
                                            onClick={() => {
                                                if (course.id === 'recommender-system') {
                                                    navigate('/research/track/recommender-system');
                                                } else {
                                                    navigate(`/research/courses/${course.id}`);
                                                }
                                            }}
                                            style={{
                                                position: 'relative', overflow: 'hidden',
                                                borderRadius: '24px', minHeight: '300px',
                                                background: bg(course),
                                                border: cardBorder(course),
                                                boxShadow: cardShadow(course),
                                                display: 'flex', flexDirection: 'column',
                                                justifyContent: 'space-between', padding: '24px',
                                            }}
                                        >
                                            <div style={{
                                                position: 'absolute', right: '16px', top: '8px',
                                                fontSize: '120px', fontWeight: 900, lineHeight: 1,
                                                color: course.watermarkColor, letterSpacing: '-0.06em',
                                                userSelect: 'none', pointerEvents: 'none',
                                            }}>{course.num}</div>
                                            <div style={{ position: 'relative', zIndex: 1 }}>
                                                <div style={{
                                                    width: '40px', height: '40px', borderRadius: '12px',
                                                    background: `${course.accentPrimary}18`,
                                                    border: `1px solid ${course.accentPrimary}66`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    marginBottom: '18px',
                                                }}>
                                                    <Icon size={18} color={course.accentSecondary} />
                                                </div>
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    padding: '4px 12px', borderRadius: '100px',
                                                    background: `${course.accentPrimary}1F`,
                                                    border: `1px solid ${course.accentPrimary}4D`,
                                                    marginBottom: '14px',
                                                }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: course.accentSecondary }} />
                                                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: course.accentSecondary }}>
                                                        {course.tagline}
                                                    </span>
                                                </div>
                                                <h2 style={{
                                                    fontSize: '1.45rem', fontWeight: 900, color: titleColor,
                                                    lineHeight: 1.12, marginBottom: '8px', letterSpacing: '-0.02em'
                                                }}>{course.label}</h2>
                                                <p style={{ fontSize: '0.8rem', color: descColorAlt, lineHeight: 1.65, maxWidth: '300px' }}>
                                                    {course.description}
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    padding: '6px 14px', borderRadius: '10px',
                                                    background: chipBgSm, border: `1px solid ${chipBorderSm}`,
                                                }}>
                                                    <BookOpen size={13} color={course.accentSecondary} />
                                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: chipTextAlt }}>
                                                        {course.modules.length} modules
                                                    </span>
                                                </div>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    padding: '6px 14px', borderRadius: '10px',
                                                    background: chipBgSm, border: `1px solid ${chipBorderSm}`,
                                                }}>
                                                    <Sparkles size={13} color={course.accentSecondary} />
                                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: chipTextAlt }}>
                                                        Agentic AI
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                </div>
            </div>
        </>
    );
}
