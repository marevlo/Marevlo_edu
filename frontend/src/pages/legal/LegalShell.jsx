import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { Scale, List } from 'lucide-react';

const LEGAL_LINKS = [
    { to: '/legal/privacy', label: 'Privacy' },
    { to: '/legal/terms', label: 'Terms' },
    { to: '/legal/refunds', label: 'Refunds' },
    { to: '/legal/cookies', label: 'Cookies' },
];

/**
 * One titled section of a legal document. Renders an anchored h2 plus
 * muted body copy — used inside <LegalShell> by every legal page.
 */
export function LegalSection({ id, title, children }) {
    return (
        <section id={id} style={{ scrollMarginTop: 84, marginBottom: 36 }}>
            <h2 className="text-foreground" style={{
                margin: '0 0 12px', fontSize: '1.15rem', fontWeight: 800,
                letterSpacing: '-0.02em', lineHeight: 1.3,
            }}>
                {title}
            </h2>
            <div className="text-muted-foreground" style={{ fontSize: '0.95rem', lineHeight: 1.75 }}>
                {children}
            </div>
        </section>
    );
}

/**
 * Shared shell for the legal pages (/legal/*): compact always-dark hero,
 * pill navigation between policies, table of contents, and a single
 * selectable content card.
 *
 * Props: { title, lastUpdated, intro, sections: [{ id, title }], children }
 */
export default function LegalShell({ title, lastUpdated, intro, sections = [], children }) {
    const { isDark } = useTheme();
    const { pathname } = useLocation();

    // The Layout <main> is the scroll container, so plain hash hrefs can be
    // flaky — scroll the target section into view explicitly instead.
    const handleAnchor = (e, id) => {
        e.preventDefault();
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div
            className="min-h-full w-full overflow-y-auto text-foreground"
            style={{ backgroundColor: 'var(--color-app-bg)' }}
        >
            {/* Hero — compact always-dark band (shorter sibling of the AboutUs hero) */}
            <div style={{
                position: 'relative', overflow: 'hidden',
                background: '#09090f',
                padding: '40px 24px 36px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{
                    position: 'absolute', top: '50%', left: -140,
                    transform: 'translateY(-50%)',
                    width: 360, height: 360, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(102,114,224,0.42) 0%, transparent 65%)',
                    filter: 'blur(72px)', pointerEvents: 'none',
                    animation: 'aboutOrbPulse 8s ease-in-out infinite',
                }} />
                <div style={{
                    position: 'absolute', top: '50%', right: -140,
                    transform: 'translateY(-50%)',
                    width: 320, height: 320, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(63,169,201,0.38) 0%, transparent 65%)',
                    filter: 'blur(72px)', pointerEvents: 'none',
                    animation: 'aboutOrbPulse 10s ease-in-out 2s infinite',
                }} />

                <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                    {/* Badge */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '5px 14px', borderRadius: 999,
                        background: 'rgba(255,255,255,0.055)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.68rem', fontWeight: 700,
                        color: 'rgba(255,255,255,0.5)',
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        marginBottom: 16, backdropFilter: 'blur(8px)',
                    }}>
                        <Scale size={10} style={{ color: '#3fa9c9' }} />
                        Legal
                    </div>

                    <h1 style={{
                        margin: '0 0 10px',
                        fontSize: 'clamp(1.6rem, 4vw, 2.3rem)',
                        fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1,
                        color: '#ffffff',
                    }}>
                        {title}
                    </h1>

                    <p style={{
                        margin: '0 auto 18px',
                        fontSize: '0.85rem',
                        color: 'rgba(255,255,255,0.38)',
                        lineHeight: 1.6,
                    }}>
                        Last updated: {lastUpdated}
                    </p>

                    {/* Pills linking across the legal pages */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {LEGAL_LINKS.map(({ to, label }) => {
                            const active = pathname === to;
                            return (
                                <Link
                                    key={to}
                                    to={to}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center',
                                        padding: '4px 13px', borderRadius: 999,
                                        fontSize: '0.72rem', fontWeight: 700,
                                        letterSpacing: '0.02em', textDecoration: 'none',
                                        background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)'}`,
                                        color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
                                        transition: 'background 0.2s, color 0.2s, border-color 0.2s',
                                    }}
                                >
                                    {label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Content column */}
            <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 0' }}>
                <div
                    className="about-card-enter bg-card selectable-text"
                    style={{
                        borderRadius: 24, padding: '36px 40px',
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

                    {intro && (
                        <p className="text-muted-foreground" style={{ margin: '0 0 28px', fontSize: '0.95rem', lineHeight: 1.75 }}>
                            {intro}
                        </p>
                    )}

                    {/* Table of contents */}
                    {sections.length > 0 && (
                        <nav
                            aria-label="Table of contents"
                            style={{
                                marginBottom: 36, padding: '18px 22px',
                                borderRadius: 14,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface-hover)',
                            }}
                        >
                            <div className="text-foreground" style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                fontSize: '0.72rem', fontWeight: 800,
                                letterSpacing: '0.1em', textTransform: 'uppercase',
                                marginBottom: 10,
                            }}>
                                <List size={12} style={{ color: '#6672e0' }} />
                                On this page
                            </div>
                            <ol style={{ margin: 0, padding: 0, listStyle: 'none', columnGap: 24 }}>
                                {sections.map(({ id, title: sectionTitle }, i) => (
                                    <li key={id} style={{ marginBottom: 5 }}>
                                        <a
                                            href={`#${id}`}
                                            onClick={(e) => handleAnchor(e, id)}
                                            className="text-muted-foreground hover:text-foreground"
                                            style={{ fontSize: '0.85rem', fontWeight: 500, textDecoration: 'none', transition: 'color 0.15s' }}
                                        >
                                            <span style={{ color: '#6672e0', fontWeight: 700, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            {sectionTitle}
                                        </a>
                                    </li>
                                ))}
                            </ol>
                        </nav>
                    )}

                    {children}
                </div>

                {/* Footer note */}
                <div style={{ marginTop: 32, marginBottom: 40, textAlign: 'center' }}>
                    <p className="text-muted-foreground selectable-text" style={{ fontSize: '0.85rem', margin: 0 }}>
                        Questions about this policy? Write to{' '}
                        <a href="mailto:support@marevlo.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                            support@marevlo.com
                        </a>
                        {' '}· Marevlo · {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </div>
    );
}
