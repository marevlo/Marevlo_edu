import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin } from 'lucide-react';

/*
 * Site footer.
 *
 * Uses the real Marevlo logo mark (public/logo/) next to the gradient
 * wordmark, with the same design-system treatment as the rest of the app:
 * theme tokens for light/dark, brand gradient accents, scoped styles under
 * `.mv-footer` so nothing leaks. Mounted at the bottom of a page's own
 * scroll container (currently only the landing page) so it scrolls with the
 * content — never in Layout, where it would force a second scrollbar on
 * pages that manage their own scrolling.
 */

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

const CSS = `
.mv-footer{
  --mv-line: rgba(15,23,42,.09);
  position:relative;
  background:var(--card);
  border-top:1px solid var(--border);
  font-family: var(--font-sans, "DM Sans", system-ui, sans-serif);
  -webkit-font-smoothing:antialiased;
}
.dark .mv-footer{--mv-line: rgba(255,255,255,.09)}

/* brand gradient hairline across the very top */
.mv-footer::before{content:"";position:absolute;top:-1px;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent 0%,#6672e0 25%,#3fa9c9 55%,#8b5cf6 80%,transparent 100%);
  opacity:.7}

.mv-footer .inner{max-width:1120px;margin:0 auto;padding:48px 24px 26px}

.mv-footer .cols{display:grid;grid-template-columns:1.7fr repeat(3,1fr);gap:32px}
@media(max-width:760px){.mv-footer .cols{grid-template-columns:repeat(2,1fr)}}
@media(max-width:440px){.mv-footer .cols{grid-template-columns:1fr}}

/* ── brand column ── */
.mv-footer .brand-link{display:inline-flex;align-items:center;gap:10px;text-decoration:none}
.mv-footer .brand-link img{height:34px;width:auto;display:block;
  transition:transform .3s cubic-bezier(.2,.7,.2,1)}
.mv-footer .brand-link:hover img{transform:scale(1.07)}
.mv-footer .wordmark{font-size:1.3rem;font-weight:900;letter-spacing:-.03em;line-height:1;
  background:linear-gradient(135deg,#6672e0,#3fa9c9);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.mv-footer .tagline{margin:12px 0 14px;max-width:30ch;font-size:13px;line-height:1.65;color:var(--muted-foreground)}

.mv-footer .contact{display:flex;flex-direction:column;gap:7px}
.mv-footer .contact a,.mv-footer .contact span{display:inline-flex;align-items:center;gap:7px;
  font-size:13px;color:var(--muted-foreground);text-decoration:none;transition:color .15s;width:fit-content}
.mv-footer .contact a:hover{color:var(--primary)}
.mv-footer .contact svg{color:#3fa9c9;flex-shrink:0}

/* ── link columns ── */
.mv-footer .col-head{font-size:.7rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  color:var(--foreground);margin-bottom:14px}
.mv-footer .col-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}
.mv-footer .col-list a{position:relative;display:inline-block;font-size:13px;color:var(--muted-foreground);
  text-decoration:none;transition:color .15s,transform .2s;width:fit-content}
.mv-footer .col-list a::after{content:"";position:absolute;left:0;bottom:-2px;width:100%;height:1px;
  background:linear-gradient(90deg,#6672e0,#3fa9c9);transform:scaleX(0);transform-origin:left;
  transition:transform .25s cubic-bezier(.2,.7,.2,1)}
.mv-footer .col-list a:hover{color:var(--foreground);transform:translateX(2px)}
.mv-footer .col-list a:hover::after{transform:scaleX(1)}

/* ── bottom row ── */
.mv-footer .bottom{margin-top:36px;padding-top:18px;border-top:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
.mv-footer .bottom span{font-size:12px;color:var(--muted-foreground)}
.mv-footer .made{display:inline-flex;align-items:center;gap:5px}
.mv-footer .made svg{color:#3fa9c9}

@media (prefers-reduced-motion: reduce){
  .mv-footer .brand-link img,.mv-footer .col-list a,.mv-footer .col-list a::after{transition:none}
}
`;

export default function Footer() {
    return (
        <footer className="mv-footer">
            <style>{CSS}</style>
            <div className="inner">
                <div className="cols">

                    {/* Brand column */}
                    <div>
                        <Link to="/" className="brand-link" aria-label="Marevlo home">
                            <img src="/logo/logo marevlo.svg" alt="" />
                            <span className="wordmark">Marevlo</span>
                        </Link>
                        <p className="tagline">
                            Learn to code through challenges, courses, and community.
                        </p>
                        <div className="contact">
                            <a href="mailto:support@marevlo.com">
                                <Mail size={13} />
                                support@marevlo.com
                            </a>
                        </div>
                    </div>

                    {/* Link columns */}
                    {COLUMNS.map(({ heading, links }) => (
                        <div key={heading}>
                            <div className="col-head">{heading}</div>
                            <ul className="col-list">
                                {links.map(({ label, to }) => (
                                    <li key={to}>
                                        <Link to={to}>{label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom row */}
                <div className="bottom">
                    <span>© {new Date().getFullYear()} Marevlo. All rights reserved.</span>
                    <span className="made">
                        <MapPin size={12} />
                        Made in India
                    </span>
                </div>
            </div>
        </footer>
    );
}
