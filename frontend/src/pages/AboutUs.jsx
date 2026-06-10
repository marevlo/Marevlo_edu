import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Layers, Code2, Users, Zap, BookOpen, Target, Sparkles, Heart, Globe } from 'lucide-react';

const values = [
    {
        icon: Code2,
        title: 'Code First',
        description: 'We believe the best way to learn programming is by writing real code — solving real problems.',
        color: '#6672e0',
    },
    {
        icon: Users,
        title: 'Community Driven',
        description: 'Learning is social. Marevlo connects developers to collaborate, discuss, and grow together.',
        color: '#3fa9c9',
    },
    {
        icon: Zap,
        title: 'Gamified Learning',
        description: 'XP, badges, and leaderboards turn skill-building into an engaging, rewarding journey.',
        color: '#e0a050',
    },
    {
        icon: BookOpen,
        title: 'Structured Curriculum',
        description: 'From beginner to advanced, our curated paths guide you through every concept step by step.',
        color: '#9180e8',
    },
    {
        icon: Target,
        title: 'Career Ready',
        description: 'Interview prep, job boards, and project showcases — we prepare you for the real world.',
        color: '#41bd78',
    },
    {
        icon: Globe,
        title: 'Open & Accessible',
        description: 'World-class education should be available to everyone, everywhere — that\'s our commitment.',
        color: '#b988d6',
    },
];

const STATS = [
    { label: 'Active Learners', value: '12k+' },
    { label: 'Course Modules',  value: '200+'  },
    { label: 'Countries',       value: '40+'   },
    { label: 'Avg. Rating',     value: '4.9 ★' },
];

export default function AboutUs() {
    const { isDark } = useTheme();

    return (
        <div
            className="min-h-full w-full overflow-y-auto text-foreground"
            style={{ backgroundColor: 'var(--color-app-bg)' }}
        >

            {/* Hero Section — same dark design as Projects & Courses */}
            <div style={{
                position: 'relative', overflow: 'hidden',
                background: '#09090f',
                padding: '60px 24px 54px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* Left glow — teal */}
                <div style={{
                    position: 'absolute', top: '50%', left: -150,
                    transform: 'translateY(-50%)',
                    width: 420, height: 420, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(63,169,201,0.52) 0%, transparent 65%)',
                    filter: 'blur(72px)', pointerEvents: 'none',
                    animation: 'aboutOrbPulse 7s ease-in-out infinite',
                }} />
                {/* Right glow — indigo */}
                <div style={{
                    position: 'absolute', top: '50%', right: -150,
                    transform: 'translateY(-50%)',
                    width: 380, height: 380, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(102,114,224,0.48) 0%, transparent 65%)',
                    filter: 'blur(72px)', pointerEvents: 'none',
                    animation: 'aboutOrbPulse 9s ease-in-out 2s infinite',
                }} />

                <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                    {/* Pill badge */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '5px 14px', borderRadius: 999,
                        background: 'rgba(255,255,255,0.055)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.68rem', fontWeight: 700,
                        color: 'rgba(255,255,255,0.5)',
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        marginBottom: 22, backdropFilter: 'blur(8px)',
                    }}>
                        <Sparkles size={10} style={{ color: '#3fa9c9' }} />
                        Our Story
                    </div>

                    {/* Heading */}
                    <h1 style={{
                        margin: '0 0 14px',
                        fontSize: 'clamp(2rem, 5vw, 2.9rem)',
                        fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1,
                        color: '#ffffff',
                    }}>
                        About Marevlo
                    </h1>

                    {/* Subtitle */}
                    <p style={{
                        margin: '0 auto 28px',
                        fontSize: '0.95rem',
                        color: 'rgba(255,255,255,0.38)',
                        lineHeight: 1.7, maxWidth: 480,
                    }}>
                        A modern coding &amp; learning platform built for developers who want to grow faster — through challenges, courses, and community.
                    </p>

                    {/* Stat chips */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {STATS.map(({ label, value }) => (
                            <div key={label} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 14px', borderRadius: 999,
                                background: 'rgba(255,255,255,0.055)',
                                border: '1px solid rgba(255,255,255,0.09)',
                                fontSize: '0.76rem', fontWeight: 600,
                                color: 'rgba(255,255,255,0.6)',
                                backdropFilter: 'blur(8px)',
                            }}>
                                <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 800 }}>{value}</span>
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Mission */}
            <div style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 0' }}>
                <div
                    className="about-card-enter bg-card"
                    style={{
                        borderRadius: 24, padding: '40px 44px',
                        textAlign: 'center',
                        border: '1px solid var(--color-border)',
                        position: 'relative', overflow: 'hidden',
                        boxShadow: isDark ? '0 4px 40px rgba(0,0,0,0.4)' : '0 4px 40px rgba(0,0,0,0.06)',
                    }}
                >
                    {/* Top accent line */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                        background: 'linear-gradient(90deg,#6672e0,#3fa9c9,#9180e8)',
                        borderRadius: '24px 24px 0 0',
                    }} />
                    <div style={{
                        width: 48, height: 48, borderRadius: 14, margin: '0 auto 18px',
                        background: 'linear-gradient(135deg,#6672e0,#9180e8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Heart size={22} color="#fff" />
                    </div>
                    <h2 className="text-foreground" style={{
                        margin: '0 0 14px', fontSize: '1.55rem', fontWeight: 800,
                        letterSpacing: '-0.03em',
                    }}>
                        Our Mission
                    </h2>
                    <p className="text-muted-foreground" style={{ fontSize: '1rem', lineHeight: 1.75, margin: 0 }}>
                        We believe every developer deserves access to world-class learning resources, a supportive community,
                        and the tools to land their dream job. Marevlo brings all of that together into one seamless platform —
                        making the journey from beginner to professional both exciting and achievable.
                    </p>
                </div>

                {/* Values Grid */}
                <h2 className="text-foreground" style={{
                    textAlign: 'center', margin: '56px 0 28px',
                    fontSize: '1.8rem', fontWeight: 900,
                    letterSpacing: '-0.03em',
                }}>
                    What We Stand For
                </h2>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: 18,
                }}>
                    {values.map(({ icon: Icon, title, description, color }, i) => (
                        <div
                            key={title}
                            className="about-card-enter bg-card"
                            style={{
                                animationDelay: `${i * 60}ms`,
                                borderRadius: 20, padding: '24px 22px',
                                border: '1px solid var(--color-border)',
                                transition: 'transform 0.22s ease, box-shadow 0.22s ease',
                                position: 'relative', overflow: 'hidden',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-4px)';
                                e.currentTarget.style.boxShadow = isDark
                                    ? `0 16px 40px rgba(0,0,0,0.4), 0 0 0 1px ${color}30`
                                    : `0 16px 40px rgba(0,0,0,0.1), 0 0 0 1px ${color}20`;
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            {/* Colored top bar */}
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 2.5,
                                background: color, borderRadius: '20px 20px 0 0', opacity: 0.7,
                            }} />
                            <div style={{
                                width: 40, height: 40, borderRadius: 11, marginBottom: 14,
                                background: `${color}18`, border: `1px solid ${color}30`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {React.createElement(Icon, { size: 19, style: { color } })}
                            </div>
                            <h3 className="text-foreground" style={{
                                margin: '0 0 8px', fontSize: '1rem', fontWeight: 800,
                                letterSpacing: '-0.01em',
                            }}>
                                {title}
                            </h3>
                            <p className="text-muted-foreground" style={{
                                margin: 0, fontSize: '0.83rem', lineHeight: 1.65,
                            }}>
                                {description}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Footer note */}
                <div style={{ marginTop: 56, marginBottom: 40, textAlign: 'center' }}>
                    <p className="text-muted-foreground" style={{ fontSize: '0.85rem' }}>
                        Built with ❤️ by the Marevlo team · {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </div>
    );
}
