import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, BookOpen, Zap, Target, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loadAllTopics } from '../utils/topicsLoader';
import ShowcaseCard from '../components/ShowcaseCard';
import PageHero from '../components/PageHero';

function FeatureCard({ icon, title, desc, color, horizontal = false }) {
    const cardRef = useRef(null);
    const glareRef = useRef(null);
    const [hovered, setHovered] = useState(false);
    const [transform, setTransform] = useState('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');

    const handleMouseMove = (e) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -15;
        const rotateY = ((x - centerX) / centerX) * 15;
        setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`);
        if (glareRef.current) {
            glareRef.current.style.background = `radial-gradient(circle at ${x}px ${y}px, color-mix(in srgb, ${color} 25%, white 15%), transparent 65%)`;
        }
    };

    const handleMouseLeave = () => {
        setHovered(false);
        setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
    };

    const baseStyle = {
        background: `color-mix(in srgb, ${color} 6%, var(--color-surface))`,
        border: `1px solid color-mix(in srgb, ${color} 25%, var(--color-border))`,
        transition: hovered ? 'transform 0.1s ease-out, box-shadow 0.3s ease' : 'all 0.5s ease',
        boxShadow: hovered ? `0 20px 40px color-mix(in srgb, ${color} 20%, transparent), 0 0 15px color-mix(in srgb, ${color} 30%, transparent)` : 'none',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        cursor: 'pointer',
    };

    if (horizontal) {
        return (
            <div
                ref={cardRef}
                className="relative rounded-xl p-3 overflow-hidden flex items-start gap-3"
                style={{ ...baseStyle, transform }}
                onMouseEnter={() => setHovered(true)}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <div
                    ref={glareRef}
                    className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300 z-10"
                    style={{ opacity: hovered ? 1 : 0 }}
                />
                <div style={{ fontSize: 20, flexShrink: 0, position: 'relative', zIndex: 2, lineHeight: 1 }}>{icon}</div>
                <div style={{ position: 'relative', zIndex: 2 }}>
                    <div className="text-xs font-bold mb-0.5 text-foreground">{title}</div>
                    <div className="text-xs leading-relaxed text-muted-foreground">{desc}</div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={cardRef}
            className="relative rounded-xl p-4 overflow-hidden"
            style={{ ...baseStyle, transform }}
            onMouseEnter={() => setHovered(true)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <div
                ref={glareRef}
                className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-300 z-10"
                style={{ opacity: hovered ? 1 : 0 }}
            />
            <div style={{ position: 'relative', zIndex: 2 }}>
                <div className="text-xl mb-2">{icon}</div>
                <div className="text-sm font-bold mb-1 text-foreground">{title}</div>
                <div className="text-xs leading-relaxed text-muted-foreground">{desc}</div>
            </div>
        </div>
    );
}

const FEATURES = [
    { icon: '💡', title: 'Multiple Approaches', desc: 'Brute Force, Optimal, Divide & Conquer — solve each problem multiple ways.', color: '#6672e0' },
    { icon: '🪜', title: '6-Level Ladder',      desc: 'Each approach has 6 sub-problems — from full solution down to basic concepts.', color: '#3fa9c9' },
    { icon: '🎯', title: '10 Test Cases / Level', desc: 'Every ladder level has its own examples, explanations, and 10 test cases.', color: '#6672e0' },
];

const LADDER_RUNGS = [
    { label: 'L0', type: 'Full Problem',       color: '#98a0ed', state: 'solved'   },
    { label: 'L1', type: 'Key Sub-routine',    color: '#41bd78', state: 'solved'   },
    { label: 'L2', type: 'Core Logic',         color: '#e0a050', state: 'unlocked' },
    { label: 'L3', type: 'Building Block',     color: '#b988d6', state: 'locked'   },
    { label: 'L4', type: 'Basic Operation',    color: '#3fa9c9', state: 'locked'   },
    { label: 'L5', type: 'Concept Foundation', color: '#9180e8', state: 'locked'   },
];

function SkeletonCard() {
    return (
        <div className="rounded-2xl overflow-hidden animate-pulse" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div style={{ height: 4, background: 'var(--color-surface-hover)' }} />
            <div className="p-5 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl" style={{ background: 'var(--color-surface-hover)' }} />
                <div className="w-28 h-4 rounded-full" style={{ background: 'var(--color-surface-hover)' }} />
                <div className="w-20 h-3 rounded-full" style={{ background: 'var(--color-surface-hover)' }} />
                <div className="flex gap-2 mt-1">
                    <div className="w-12 h-4 rounded-full" style={{ background: 'var(--color-surface-hover)' }} />
                    <div className="w-12 h-4 rounded-full" style={{ background: 'var(--color-surface-hover)' }} />
                    <div className="w-12 h-4 rounded-full" style={{ background: 'var(--color-surface-hover)' }} />
                </div>
                <div className="w-full h-2 rounded-full mt-1" style={{ background: 'var(--color-surface-hover)' }} />
            </div>
        </div>
    );
}

// Thin adapter over the shared research-style ShowcaseCard.
function TopicCard({ topic, index, onClick }) {
    const count  = topic.problems?.length || 0;
    const easy   = topic.problems?.filter(p => p.difficulty === 'Easy').length   || 0;
    const medium = topic.problems?.filter(p => p.difficulty === 'Medium').length || 0;
    const hard   = topic.problems?.filter(p => p.difficulty === 'Hard').length   || 0;

    const chips = [
        easy   > 0 && { label: `${easy} Easy`,   color: '#41bd78' },
        medium > 0 && { label: `${medium} Med`,  color: '#e0a050' },
        hard   > 0 && { label: `${hard} Hard`,   color: '#e06661' },
    ].filter(Boolean);

    return (
        <ShowcaseCard
            index={index}
            icon={Target}
            title={topic.name}
            tagline={`${count} problems`}
            description="Multi-approach solutions with 6-level ladders — from the full problem down to the foundational concept."
            chips={chips}
            actions={[{ icon: ArrowRight, label: 'Solve', onClick }]}
            onClick={onClick}
            minHeight={280}
        />
    );
}

function FeatureSidebar() {
    return (
        <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
            {/* Gradient top bar */}
            <div style={{ height: 3, background: 'linear-gradient(90deg, #6672e0, #3fa9c9, #41bd78)' }} />

            <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontSize: 16 }}>🧠</span>
                    <h2 className="text-sm font-bold text-foreground">
                        Learn Smarter, Not Faster
                    </h2>
                </div>
                <p className="text-xs mb-4 text-muted-foreground" style={{ lineHeight: 1.6 }}>
                    Every problem comes with multiple approaches, each broken into{' '}
                    <strong className="text-foreground">6 ladder levels</strong> — from the full problem down to the foundational concept.
                </p>

                {/* Ladder visual */}
                <div
                    className="rounded-xl p-3 mb-4"
                    style={{ background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)' }}
                >
                    <div
                        className="text-xs font-semibold mb-2 text-muted-foreground"
                        style={{ letterSpacing: '0.05em', textTransform: 'uppercase' }}
                    >
                        Ladder System
                    </div>

                    {/* Horizontal rung row */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                        {LADDER_RUNGS.map((rung, i, arr) => (
                            <React.Fragment key={rung.label}>
                                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 9, fontWeight: 800,
                                        background: rung.state === 'solved' ? '#e0a050' : rung.state === 'unlocked' ? '#41bd78' : 'var(--color-surface)',
                                        color: rung.state === 'locked' ? 'var(--muted-foreground)' : '#fff',
                                        border: rung.state === 'locked' ? '1.5px dashed var(--muted-foreground)' : 'none',
                                        boxShadow: rung.state === 'solved' ? '0 0 8px rgba(224,160,80,0.35)' : 'none',
                                        transition: 'all 0.3s',
                                    }}>
                                        {rung.state === 'solved' ? '✓' : rung.state === 'unlocked' ? rung.label : '🔒'}
                                    </div>
                                    <span className="text-center" style={{
                                        fontSize: 7,
                                        color: rung.state === 'solved' ? '#e0a050' : rung.state === 'unlocked' ? '#41bd78' : 'var(--muted-foreground)',
                                        fontWeight: 600, maxWidth: 52, lineHeight: 1.3,
                                    }}>
                                        {rung.label}<br />{rung.type}
                                    </span>
                                </div>
                                {i < arr.length - 1 && (
                                    <div style={{
                                        flex: 1, height: 2, minWidth: 4,
                                        background: rung.state === 'solved' ? '#e0a050' : rung.state === 'unlocked' ? '#41bd78' : 'var(--color-border)',
                                        borderRadius: 2,
                                    }} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="mt-2.5 flex items-center gap-3 text-muted-foreground" style={{ fontSize: 9 }}>
                        <span className="flex items-center gap-1">
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e0a050', display: 'inline-block' }} /> Solved
                        </span>
                        <span className="flex items-center gap-1">
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#41bd78', display: 'inline-block' }} /> Unlocked
                        </span>
                        <span className="flex items-center gap-1">
                            <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px dashed var(--muted-foreground)', display: 'inline-block' }} /> Locked
                        </span>
                    </div>
                </div>

                {/* Feature cards — horizontal layout */}
                <div className="flex flex-col gap-2">
                    {FEATURES.map(f => (
                        <FeatureCard key={f.title} {...f} horizontal />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function ProblemList() {
    const [topics, setTopics]                 = useState([]);
    const [expandedTopics] = useState(() => {
        const saved = sessionStorage.getItem('problemListExpandedTopics');
        return saved ? JSON.parse(saved) : { arrays: true };
    });
    const [visibleCounts] = useState(() => {
        const saved = sessionStorage.getItem('problemListVisibleCounts');
        return saved ? JSON.parse(saved) : { arrays: 10 };
    });
    const [loading, setLoading]               = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
    sessionStorage.setItem(
        'problemListExpandedTopics',
        JSON.stringify(expandedTopics)
    );
}, [expandedTopics]);

useEffect(() => {
    sessionStorage.setItem(
        'problemListVisibleCounts',
        JSON.stringify(visibleCounts)
    );
}, [visibleCounts]);

    useEffect(() => {
        loadAllTopics()
            .then(setTopics)
            .catch((err) => console.error('Failed to load topics:', err))
            .finally(() => setLoading(false));
    }, []);

    const totalProblems = topics.reduce((s, t) => s + (t.problems?.length || 0), 0);

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar">

            {/* Hero — shared PageHero keeps sizing identical across catalog pages */}
            <PageHero
                badgeIcon={Sparkles}
                badgeLabel="Algorithm Practice"
                title="Practice Problems"
                subtitle="Master data structures and algorithms — one problem at a time."
                chips={[
                    { icon: BookOpen, label: `${loading ? '…' : totalProblems} Problems` },
                    { icon: Target,   label: `${loading ? '…' : topics.length} Topics` },
                    { icon: Zap,      label: '6-Level Ladder' },
                ]}
            />

            {/* How it works — shown before the topic cards */}
            <div className="page-container" style={{ paddingTop: 32 }}>
                <div
                    className="rounded-2xl overflow-hidden mb-8"
                    style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
                >
                    {/* Gradient top line */}
                    <div style={{ height: 3, background: 'linear-gradient(90deg, #6672e0, #3fa9c9, #41bd78)' }} />

                    <div className="p-6">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-1">
                            <span style={{ fontSize: 18 }}>🧠</span>
                            <h2 className="text-base font-bold text-foreground">Learn Smarter, Not Faster</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-5" style={{ lineHeight: 1.65, maxWidth: 640 }}>
                            Every problem comes with multiple approaches, each broken into{' '}
                            <strong className="text-foreground">6 ladder levels</strong> — from the full problem down to the foundational concept.
                        </p>

                        {/* Ladder visual */}
                        <div
                            className="rounded-xl p-4 mb-5"
                            style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
                        >
                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Ladder System</div>
                            <div className="flex items-center gap-1 overflow-x-auto pb-1">
                                {LADDER_RUNGS.map((rung, i, arr) => (
                                    <React.Fragment key={rung.label}>
                                        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 11, fontWeight: 800,
                                                background: rung.state === 'solved' ? '#e0a050' : rung.state === 'unlocked' ? '#41bd78' : 'var(--muted)',
                                                color: rung.state === 'locked' ? 'var(--muted-foreground)' : '#fff',
                                                border: rung.state === 'locked' ? '1.5px dashed var(--border)' : 'none',
                                                boxShadow: rung.state === 'solved' ? '0 0 12px rgba(224,160,80,0.4)' : rung.state === 'unlocked' ? '0 0 12px rgba(65,189,120,0.35)' : 'none',
                                            }}>
                                                {rung.state === 'solved' ? '✓' : rung.state === 'unlocked' ? rung.label : '🔒'}
                                            </div>
                                            <div className="text-center" style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.3, maxWidth: 60 }}>
                                                <div style={{ color: rung.state === 'solved' ? '#e0a050' : rung.state === 'unlocked' ? '#41bd78' : 'var(--muted-foreground)' }}>{rung.label}</div>
                                                <div className="text-muted-foreground">{rung.type}</div>
                                            </div>
                                        </div>
                                        {i < arr.length - 1 && (
                                            <div style={{
                                                flex: 1, height: 2, minWidth: 12,
                                                background: rung.state === 'solved' ? '#e0a050' : rung.state === 'unlocked' ? '#41bd78' : 'var(--border)',
                                                borderRadius: 2,
                                            }} />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                            {/* Legend */}
                            <div className="flex items-center gap-4 mt-3 text-muted-foreground" style={{ fontSize: 10 }}>
                                <span className="flex items-center gap-1.5">
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e0a050', display: 'inline-block' }} /> Solved
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#41bd78', display: 'inline-block' }} /> Unlocked
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px dashed var(--muted-foreground)', display: 'inline-block' }} /> Locked
                                </span>
                            </div>
                        </div>

                        {/* Feature cards — 3 columns */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {FEATURES.map(f => (
                                <FeatureCard key={f.title} {...f} horizontal />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Cards grid — full-width, matching Courses page layout */}
            <div className="page-container" style={{ paddingBottom: 48 }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {loading
                        ? Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
                        : topics.map((topic, ti) => (
                            <TopicCard
                                key={topic.id}
                                topic={topic}
                                index={ti}
                                onClick={() => navigate(`/problems/${topic.id}`)}
                            />
                        ))
                    }
                </div>
            </div>
        </div>
    );
}
