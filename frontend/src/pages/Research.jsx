import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, GraduationCap, ScrollText, Radio, Cpu, FlaskConical, BrainCircuit, Layers, Users, Waves } from 'lucide-react';
import { PAPERS } from '../data/papers';

const preloadResearchCourses = () => import('./ResearchCourses');

export default function Research() {
    const navigate = useNavigate();

    return (
        <>
            <div className="overflow-y-auto h-full text-foreground" style={{ backgroundColor: 'var(--background)' }}>
                <div style={{ width: '70%', margin: '0 auto', padding: '64px 0 96px' }}>

                    {/* Page header */}
                    <div style={{ marginBottom: '60px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                            <div style={{ width: '28px', height: '2px', background: 'linear-gradient(90deg,#6672e0,#9180e8)' }} />
                            <span style={{
                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.22em',
                                textTransform: 'uppercase', color: 'var(--primary)'
                            }}>
                                Explore
                            </span>
                        </div>
                        <h1 className="text-foreground" style={{
                            fontSize: 'clamp(2.4rem,5vw,4.2rem)', fontWeight: 900,
                            lineHeight: 1.06, letterSpacing: '-0.03em',
                            marginBottom: '16px'
                        }}>
                            Where do you<br />want to go?
                        </h1>
                        <p className="text-muted-foreground" style={{ fontSize: '1.05rem', maxWidth: '460px', lineHeight: 1.7 }}>
                            Master skills through structured courses or dive deep into curated research papers.
                        </p>
                    </div>

                    {/* Cards grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '24px' }}>

                        {/* Courses card */}
                        <div
                            onClick={() => navigate('/research/courses')}
                            onMouseEnter={preloadResearchCourses}
                            onFocus={preloadResearchCourses}
                            style={{ cursor: 'pointer' }}
                        >
                        <div className="res-part-label" style={{ color: 'var(--primary)' }}>Part 01 &nbsp;·&nbsp; Courses</div>
                        <div
                            className="res-card res-card-1"
                            style={{
                                position: 'relative', overflow: 'hidden',
                                borderRadius: '28px', minHeight: '500px',
                                background: 'linear-gradient(145deg,#0d0221 0%,#1a0533 45%,#0f0a2e 100%)',
                                boxShadow: '0 20px 60px rgba(102,114,224,0.2)',
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'space-between', padding: '40px',
                            }}
                        >
                            {/* Glow orb top-right */}
                            <div style={{
                                position: 'absolute', top: '-50px', right: '-50px',
                                width: '240px', height: '240px', borderRadius: '50%',
                                background: 'radial-gradient(circle,rgba(102,114,224,0.55) 0%,transparent 70%)',
                                filter: 'blur(45px)',
                                animation: 'resOrb 8s ease-in-out infinite',
                            }} />
                            {/* Glow orb bottom-left */}
                            <div style={{
                                position: 'absolute', bottom: '50px', left: '-40px',
                                width: '180px', height: '180px', borderRadius: '50%',
                                background: 'radial-gradient(circle,rgba(145,128,232,0.45) 0%,transparent 70%)',
                                filter: 'blur(40px)',
                                animation: 'resOrb 11s ease-in-out infinite',
                                animationDelay: '-4s',
                            }} />
                            {/* Watermark */}
                            <div style={{
                                position: 'absolute', right: '16px', top: '4px',
                                fontSize: '200px', fontWeight: 900, lineHeight: 1,
                                color: 'rgba(102,114,224,0.05)', letterSpacing: '-0.06em',
                                userSelect: 'none', pointerEvents: 'none',
                            }}>01</div>

                            {/* Top content */}
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{
                                    width: '54px', height: '54px', borderRadius: '16px',
                                    background: 'rgba(102,114,224,0.18)',
                                    border: '1px solid rgba(102,114,224,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: '28px',
                                    boxShadow: '0 0 24px rgba(102,114,224,0.3)',
                                }}>
                                    <GraduationCap size={24} color="#98a0ed" />
                                </div>

                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px', borderRadius: '100px',
                                    background: 'rgba(102,114,224,0.12)',
                                    border: '1px solid rgba(102,114,224,0.3)',
                                    marginBottom: '18px',
                                }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#98a0ed' }} />
                                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#98a0ed' }}>
                                        Structured Learning
                                    </span>
                                </div>

                                <h2 style={{
                                    fontSize: '2.4rem', fontWeight: 900, color: '#eeeeff',
                                    lineHeight: 1.08, marginBottom: '14px', letterSpacing: '-0.02em'
                                }}>Courses</h2>
                                <p style={{ fontSize: '0.93rem', color: 'rgba(200,200,240,0.6)', lineHeight: 1.75, maxWidth: '310px' }}>
                                    Deep, structured courses on the topics reshaping how we build with AI.
                                </p>
                            </div>

                            {/* Bottom CTA */}
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{
                                    width: '100%', height: '1px',
                                    background: 'linear-gradient(90deg,rgba(102,114,224,0.5),transparent)',
                                    marginBottom: '24px',
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'rgba(200,200,240,0.55)', fontWeight: 500 }}>
                                        Explore Courses
                                    </span>
                                    <div className="res-arrow" style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: 'rgba(102,114,224,0.18)',
                                        border: '1px solid rgba(102,114,224,0.45)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <ArrowUpRight size={18} color="#98a0ed" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        </div>

                        {/* Research papers card */}
                        <div onClick={() => navigate('/research/papers')} style={{ cursor: 'pointer' }}>
                        <div className="res-part-label" style={{ color: '#fbbf24' }}>Part 02 &nbsp;·&nbsp; Research Papers</div>
                        <div
                            className="res-card res-card-2"
                            style={{
                                position: 'relative', overflow: 'hidden',
                                borderRadius: '28px', minHeight: '500px',
                                backgroundColor: '#080600',
                                boxShadow: '0 20px 60px rgba(224,160,80,0.1)',
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'space-between', padding: '40px',
                            }}
                        >
                            {/* Graph-paper grid overlay */}
                            <div style={{
                                position: 'absolute', inset: 0,
                                backgroundImage: `
                                    repeating-linear-gradient(rgba(224,160,80,0.055) 0px, rgba(224,160,80,0.055) 1px, transparent 1px, transparent 52px),
                                    repeating-linear-gradient(90deg, rgba(224,160,80,0.055) 0px, rgba(224,160,80,0.055) 1px, transparent 1px, transparent 52px)
                                `,
                                pointerEvents: 'none',
                            }} />
                            {/* Radial vignette to darken edges */}
                            <div style={{
                                position: 'absolute', inset: 0,
                                background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(8,6,0,0.85) 100%)',
                                pointerEvents: 'none',
                            }} />
                            {/* Amber glow top-right */}
                            <div style={{
                                position: 'absolute', top: '-30px', right: '-30px',
                                width: '200px', height: '200px', borderRadius: '50%',
                                background: 'radial-gradient(circle,rgba(224,160,80,0.3) 0%,transparent 70%)',
                                filter: 'blur(50px)',
                                pointerEvents: 'none',
                            }} />
                            {/* Shimmer sweep (triggered on hover via CSS) */}
                            <div className="res-shimmer" style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '60px', height: '100%',
                                background: 'linear-gradient(90deg,transparent,rgba(224,160,80,0.06),transparent)',
                                pointerEvents: 'none',
                            }} />
                            {/* Watermark */}
                            <div style={{
                                position: 'absolute', right: '16px', top: '4px',
                                fontSize: '200px', fontWeight: 900, lineHeight: 1,
                                color: 'rgba(224,160,80,0.04)', letterSpacing: '-0.06em',
                                userSelect: 'none', pointerEvents: 'none',
                            }}>02</div>

                            {/* Top content */}
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{
                                    width: '54px', height: '54px', borderRadius: '16px',
                                    background: 'rgba(224,160,80,0.12)',
                                    border: '1px solid rgba(224,160,80,0.35)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: '28px',
                                    boxShadow: '0 0 24px rgba(224,160,80,0.2)',
                                }}>
                                    <ScrollText size={24} color="#fbbf24" />
                                </div>

                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px', borderRadius: '100px',
                                    background: 'rgba(224,160,80,0.1)',
                                    border: '1px solid rgba(224,160,80,0.28)',
                                    marginBottom: '18px',
                                }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24' }} />
                                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fbbf24' }}>
                                        Curated Research
                                    </span>
                                </div>

                                <h2 style={{
                                    fontSize: '2.4rem', fontWeight: 900, color: '#fef3c7',
                                    lineHeight: 1.08, marginBottom: '14px', letterSpacing: '-0.02em'
                                }}>Research Papers</h2>
                                <p style={{ fontSize: '0.93rem', color: 'rgba(254,243,199,0.5)', lineHeight: 1.75, maxWidth: '310px' }}>
                                    {PAPERS.length} foundational and cutting-edge papers across AI, ML, and systems research. Filter, search, and read.
                                </p>
                            </div>

                            {/* Bottom CTA */}
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{
                                    width: '100%', height: '1px',
                                    background: 'linear-gradient(90deg,rgba(224,160,80,0.45),transparent)',
                                    marginBottom: '24px',
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'rgba(254,243,199,0.6)', fontWeight: 500 }}>
                                        Explore papers
                                    </span>
                                    <div className="res-arrow" style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: 'rgba(224,160,80,0.12)',
                                        border: '1px solid rgba(224,160,80,0.35)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <ArrowUpRight size={18} color="#fbbf24" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>

                    </div>

                    {/* Frequency room preview */}
                    <div style={{ marginTop: '24px' }}>
                        <div className="res-part-label" style={{ color: '#41bd78' }}>Part 03 &nbsp;·&nbsp; The Frequency</div>
                        <div
                            className="res-card res-card-3"
                            style={{
                                position: 'relative', overflow: 'hidden',
                                borderRadius: '28px', minHeight: '320px',
                                backgroundColor: '#020f09',
                                boxShadow: '0 20px 60px rgba(65,189,120,0.12)',
                                display: 'flex', flexDirection: 'row',
                                alignItems: 'stretch', padding: '0',
                            }}
                        >
                            {/* Scan line */}
                            <div style={{
                                position: 'absolute', left: 0, right: 0,
                                height: '1px',
                                background: 'linear-gradient(90deg,transparent,rgba(65,189,120,0.4),transparent)',
                                animation: 'resScan 5s ease-in-out infinite',
                                pointerEvents: 'none', zIndex: 0,
                            }} />
                            {/* Dot-grid bg */}
                            <div style={{
                                position: 'absolute', inset: 0,
                                backgroundImage: 'radial-gradient(circle, rgba(65,189,120,0.12) 1px, transparent 1px)',
                                backgroundSize: '28px 28px',
                                pointerEvents: 'none',
                            }} />
                            {/* Green glow left */}
                            <div style={{
                                position: 'absolute', top: '-40px', left: '-40px',
                                width: '300px', height: '300px', borderRadius: '50%',
                                background: 'radial-gradient(circle,rgba(65,189,120,0.18) 0%,transparent 70%)',
                                filter: 'blur(60px)', pointerEvents: 'none',
                            }} />

                            {/* Left: text content */}
                            <div style={{ flex: 1, padding: '44px 48px', position: 'relative', zIndex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '22px' }}>
                                    <div style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: '#41bd78',
                                        animation: 'resPulse 2.4s ease-in-out infinite',
                                    }} />
                                    <span style={{
                                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em',
                                        textTransform: 'uppercase', color: '#41bd78',
                                    }}>Live Rooms</span>
                                </div>

                                <h2 style={{
                                    fontSize: '2.6rem', fontWeight: 900, color: '#ecfdf5',
                                    lineHeight: 1.06, marginBottom: '14px', letterSpacing: '-0.025em',
                                }}>The Frequency</h2>
                                <p style={{
                                    fontSize: '0.9rem', color: 'rgba(167,243,208,0.55)',
                                    lineHeight: 1.8, maxWidth: '400px', marginBottom: '32px',
                                }}>
                                    Tune into a topic. Each frequency is a live room locked to one research
                                    theme read the paper, share your take, hear what others are thinking.
                                    Pure signal, no noise.
                                </p>

                                {/* Topic tags */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '36px' }}>
                                    {[
                                        { label: 'The Foundation Models', icon: Layers },
                                        { label: 'Memory & Retrieval', icon: BrainCircuit },
                                        { label: 'The Agent Stack', icon: Cpu },
                                        { label: 'Seeing & Generating', icon: Waves },
                                        { label: 'The Alignment Problem', icon: Users },
                                        { label: 'Reasoning Machines', icon: FlaskConical },
                                        { label: 'The Efficiency Lab', icon: Radio },
                                    ].map(({ label, icon: Icon }) => (
                                        <div key={label} className="res-tag" style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '7px',
                                            padding: '7px 14px', borderRadius: '100px',
                                            background: 'rgba(65,189,120,0.08)',
                                            border: '1px solid rgba(65,189,120,0.22)',
                                            cursor: 'default',
                                        }}>
                                            {React.createElement(Icon, { size: 12, color: '#34d399' })}
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6ee7b7', letterSpacing: '0.02em' }}>{label}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Bottom bar */}
                                <div style={{
                                    width: '100%', height: '1px',
                                    background: 'linear-gradient(90deg,rgba(65,189,120,0.4),transparent)',
                                    marginBottom: '24px',
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'rgba(167,243,208,0.35)', fontWeight: 500 }}>Coming soon</span>
                                    <div className="res-arrow" style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: 'rgba(65,189,120,0.1)',
                                        border: '1px solid rgba(65,189,120,0.35)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <ArrowUpRight size={18} color="#34d399" />
                                    </div>
                                </div>
                            </div>

                            {/* Right: diamond icon panel */}
                            <div style={{
                                width: '220px', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderLeft: '1px solid rgba(65,189,120,0.1)',
                                position: 'relative', zIndex: 1,
                            }}>
                                <div style={{
                                    position: 'relative',
                                    width: '90px', height: '90px',
                                }}>
                                    {/* Diamond shape */}
                                    <div style={{
                                        position: 'absolute', inset: 0,
                                        border: '1px solid rgba(65,189,120,0.45)',
                                        borderRadius: '16px',
                                        transform: 'rotate(45deg)',
                                        background: 'rgba(65,189,120,0.06)',
                                        boxShadow: '0 0 30px rgba(65,189,120,0.2)',
                                    }} />
                                    <div style={{
                                        position: 'absolute', inset: '12px',
                                        border: '1px solid rgba(65,189,120,0.2)',
                                        borderRadius: '12px',
                                        transform: 'rotate(45deg)',
                                    }} />
                                    <div style={{
                                        position: 'absolute', inset: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Radio size={26} color="#41bd78" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}
