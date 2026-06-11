import React from 'react';
import { Link, useLocation } from 'react-router-dom';

// Exact-match paths where the footer is shown ('/' is handled separately).
const EXACT_PATHS = new Set([
    '/about',
    '/plan',
    '/jobs',
    '/profile',
    '/settings',
    '/research',
    '/research/papers',
]);

const COLUMNS = [
    {
        heading: 'Product',
        links: [
            { label: 'Courses', to: '/courses' },
            { label: 'Problems', to: '/problems' },
            { label: 'Plans', to: '/plan' },
            { label: 'Jobs', to: '/jobs' },
        ],
    },
    {
        heading: 'Company',
        links: [
            { label: 'About', to: '/about' },
            { label: 'Research', to: '/research' },
        ],
    },
    {
        heading: 'Legal',
        links: [
            { label: 'Privacy', to: '/legal/privacy' },
            { label: 'Terms', to: '/legal/terms' },
            { label: 'Refunds', to: '/legal/refunds' },
            { label: 'Cookies', to: '/legal/cookies' },
        ],
    },
];

export default function Footer() {
    const { pathname } = useLocation();
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

    // Visible only on the landing page, a small set of full pages, and the
    // legal/courses sections. Never on immersive surfaces (/course/:id, /ide,
    // /messages, /feed, /login, /signup, /problems, research content...).
    const visible =
        path === '/' ||
        EXACT_PATHS.has(path) ||
        path.startsWith('/legal') ||
        path.startsWith('/courses');

    if (!visible) return null;

    return (
        <footer className="border-t border-border" style={{ background: 'var(--card)' }}>
            <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 28px' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 28,
                }}>
                    {/* Brand column */}
                    <div>
                        <Link
                            to="/"
                            style={{
                                display: 'inline-block', textDecoration: 'none',
                                fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.03em',
                                background: 'linear-gradient(135deg, #6672e0, #3fa9c9)',
                                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                                WebkitTextFillColor: 'transparent', color: 'transparent',
                            }}
                        >
                            Marevlo
                        </Link>
                        <p className="text-muted-foreground" style={{ margin: '8px 0 10px', fontSize: '13px', lineHeight: 1.6 }}>
                            Learn to code through challenges, courses, and community.
                        </p>
                        <a
                            href="mailto:support@marevlo.com"
                            className="text-muted-foreground hover:text-foreground"
                            style={{ fontSize: '13px', textDecoration: 'none', transition: 'color 0.15s' }}
                        >
                            support@marevlo.com
                        </a>
                    </div>

                    {/* Link columns */}
                    {COLUMNS.map(({ heading, links }) => (
                        <div key={heading}>
                            <div className="text-foreground" style={{
                                fontSize: '0.72rem', fontWeight: 800,
                                letterSpacing: '0.1em', textTransform: 'uppercase',
                                marginBottom: 12,
                            }}>
                                {heading}
                            </div>
                            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                {links.map(({ label, to }) => (
                                    <li key={to} style={{ marginBottom: 8 }}>
                                        <Link
                                            to={to}
                                            className="text-muted-foreground hover:text-foreground text-[13px]"
                                            style={{ textDecoration: 'none', transition: 'color 0.15s' }}
                                        >
                                            {label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom row */}
                <div className="border-t border-border" style={{
                    marginTop: 32, paddingTop: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 8,
                }}>
                    <span className="text-muted-foreground" style={{ fontSize: '12px' }}>
                        © {new Date().getFullYear()} Marevlo. All rights reserved.
                    </span>
                    <span className="text-muted-foreground" style={{ fontSize: '12px' }}>
                        Made in India
                    </span>
                </div>
            </div>
        </footer>
    );
}
