import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';

const STORAGE_KEY = 'marevlo_cookie_consent';

/**
 * First-visit consent banner. Stores the choice in localStorage under
 * 'marevlo_cookie_consent' as {"choice":"all"|"essential","ts":ISO,"version":1}
 * and renders nothing once a choice exists (or if storage is unavailable).
 */
export default function CookieConsent() {
    const [status, setStatus] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) ? 'dismissed' : 'open';
        } catch {
            // Storage blocked (private mode / hardened browser) — we can't
            // persist a choice, so don't nag on every render.
            return 'blocked';
        }
    });

    if (status !== 'open') return null;

    const choose = (choice) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                choice,
                ts: new Date().toISOString(),
                version: 1,
            }));
        } catch {
            // Storage unavailable — dismiss for this session only.
        }
        setStatus('dismissed');
    };

    return (
        <div
            role="dialog"
            aria-label="Cookie consent"
            className="bg-card border border-border shadow-2xl"
            style={{
                position: 'fixed', left: 16, right: 16, bottom: 16,
                zIndex: 60, maxWidth: 560,
                borderRadius: 16, padding: 18,
                animation: 'cookieConsentRise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
            }}
        >
            <style>{`
                @keyframes cookieConsentRise {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(224,160,80,0.14)', border: '1px solid rgba(224,160,80,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Cookie size={18} style={{ color: '#e0a050' }} />
                </div>
                <p className="text-muted-foreground" style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>
                    We use essential local storage to keep you signed in and remember preferences. No advertising trackers.{' '}
                    <Link
                        to="/legal/cookies"
                        style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                    >
                        Learn more
                    </Link>
                </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button
                    type="button"
                    onClick={() => choose('essential')}
                    className="border border-border text-foreground hover:bg-muted/60"
                    style={{
                        padding: '8px 16px', borderRadius: 10,
                        background: 'transparent',
                        fontSize: '13px', fontWeight: 700,
                        transition: 'background 0.15s',
                    }}
                >
                    Essential only
                </button>
                <button
                    type="button"
                    onClick={() => choose('all')}
                    className="hover:-translate-y-0.5"
                    style={{
                        padding: '8px 18px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                        color: 'var(--primary-foreground)', fontSize: '13px', fontWeight: 700,
                        boxShadow: '0 4px 16px rgba(102,114,224,0.35)',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                >
                    Accept
                </button>
            </div>
        </div>
    );
}
