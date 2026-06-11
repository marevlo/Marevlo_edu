import React from 'react';
import { Link } from 'react-router-dom';
import LegalShell, { LegalSection } from './LegalShell';

const SECTIONS = [
    { id: 'overview', title: 'Overview' },
    { id: 'local-storage', title: 'Local storage we use' },
    { id: 'third-parties', title: 'Third-party cookies and storage' },
    { id: 'no-tracking', title: 'No advertising or analytics cookies' },
    { id: 'consent-banner', title: 'The consent banner' },
    { id: 'managing', title: 'Clearing storage in your browser' },
    { id: 'changes', title: 'Changes to this policy' },
];

const STORAGE_KEYS = [
    {
        key: 'access_token',
        type: 'Essential',
        purpose: 'Keeps you signed in — a short-lived session token attached to your requests.',
    },
    {
        key: 'refresh_token',
        type: 'Essential',
        purpose: 'Silently renews your session so you are not signed out mid-lesson.',
    },
    {
        key: 'marevlo_user',
        type: 'Essential',
        purpose: 'Your basic account details (name, username, email) used to display your profile in the app.',
    },
    {
        key: 'marevlo-theme',
        type: 'Functional',
        purpose: 'Remembers your light / dark mode preference.',
    },
    {
        key: 'heardFrom',
        type: 'Functional',
        purpose: 'Remembers how you heard about Marevlo, sent once at signup for attribution.',
    },
    {
        key: 'marevlo_cookie_consent',
        type: 'Essential',
        purpose: 'Stores the choice you make in our consent banner so we do not ask again.',
    },
];

const UL = { margin: '10px 0 12px', paddingLeft: 22, listStyle: 'disc' };
const LI = { marginBottom: 6 };
const P = { margin: '0 0 12px' };

function B({ children }) {
    return <strong className="text-foreground" style={{ fontWeight: 700 }}>{children}</strong>;
}

function Key({ children }) {
    return (
        <code className="text-foreground" style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
            background: 'var(--muted)', border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap',
        }}>
            {children}
        </code>
    );
}

export default function CookiePolicy() {
    return (
        <LegalShell
            title="Cookie Policy"
            lastUpdated="11 June 2026"
            intro="This policy is honest about how Marevlo actually works: we rely primarily on browser local storage — not tracking cookies — to keep you signed in and remember your preferences. Below is the complete list of what we store, the third parties that may set their own cookies, and how to clear everything."
            sections={SECTIONS}
        >
            <LegalSection id="overview" title="1. Overview">
                <p style={P}>
                    Cookies are small files a website asks your browser to save; <B>local storage</B> is a similar browser
                    feature for storing small pieces of data, but it is never sent automatically with every request. Marevlo
                    itself sets <B>no first-party tracking cookies</B>. Everything we store on your device lives in local
                    storage, is set only by us, and exists to make the platform work — signing you in, remembering dark mode,
                    and recording your consent choice.
                </p>
            </LegalSection>

            <LegalSection id="local-storage" title="2. Local storage we use">
                <p style={P}>The complete list of keys Marevlo stores in your browser:</p>
                <div style={{ overflowX: 'auto', margin: '14px 0 12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                        <thead>
                            <tr>
                                {['Key', 'Type', 'Purpose'].map((h) => (
                                    <th key={h} className="text-foreground" style={{
                                        textAlign: 'left', fontWeight: 800, fontSize: '0.72rem',
                                        letterSpacing: '0.08em', textTransform: 'uppercase',
                                        padding: '8px 12px', borderBottom: '2px solid var(--color-border)',
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {STORAGE_KEYS.map(({ key, type, purpose }) => (
                                <tr key={key}>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' }}>
                                        <Key>{key}</Key>
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center',
                                            padding: '2px 10px', borderRadius: 999,
                                            fontSize: '0.72rem', fontWeight: 700,
                                            background: type === 'Essential' ? 'rgba(102,114,224,0.12)' : 'rgba(63,169,201,0.12)',
                                            border: `1px solid ${type === 'Essential' ? 'rgba(102,114,224,0.35)' : 'rgba(63,169,201,0.35)'}`,
                                            color: type === 'Essential' ? '#6672e0' : '#3fa9c9',
                                        }}>
                                            {type}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' }}>
                                        {purpose}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p style={P}>
                    <B>Essential</B> keys are required for the platform to function — without the token keys you simply cannot
                    stay signed in. <B>Functional</B> keys only remember preferences and the site works without them.
                </p>
            </LegalSection>

            <LegalSection id="third-parties" title="3. Third-party cookies and storage">
                <ul style={UL}>
                    <li style={LI}>
                        <B>Google Firebase (authentication).</B> If you choose &ldquo;Sign in with Google&rdquo;, Google's
                        sign-in flow may set its own cookies and local/indexed storage to complete authentication and keep
                        your Google session. These are governed by{' '}
                        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Google's Privacy Policy</a>.
                        If you only use email/password sign-in, no Google storage is set.
                    </li>
                    <li style={LI}>
                        <B>PayU (payments).</B> During checkout you are taken through PayU's payment flow, which sets its own
                        cookies for transaction security and fraud prevention, governed by{' '}
                        <a href="https://payu.in/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>PayU's Privacy Policy</a>.
                    </li>
                </ul>
                <p style={P}>We do not control third-party cookies and they are only set when you use those features.</p>
            </LegalSection>

            <LegalSection id="no-tracking" title="4. No advertising or analytics cookies">
                <p style={P}>
                    Marevlo currently uses <B>no advertising cookies, no cross-site trackers, and no third-party analytics
                    cookies</B>. We do not profile you for ads and we do not sell data — see our{' '}
                    <Link to="/legal/privacy" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</Link>.
                    If we ever introduce analytics or similar technologies, we will update this policy first and ask for your
                    consent where the law requires it.
                </p>
            </LegalSection>

            <LegalSection id="consent-banner" title="5. The consent banner">
                <p style={P}>
                    The first time you visit, a banner offers two choices:
                </p>
                <ul style={UL}>
                    <li style={LI}>
                        <B>Accept</B> — allows both essential and functional storage listed above.
                    </li>
                    <li style={LI}>
                        <B>Essential only</B> — records that you prefer the minimum. Essential storage (sign-in tokens, your
                        account details, and the consent record itself) <B>cannot be disabled</B>, because the platform does
                        not work without it.
                    </li>
                </ul>
                <p style={P}>
                    Either choice is saved under <Key>marevlo_cookie_consent</Key> with a timestamp, so we do not ask again.
                    Clearing your browser storage resets the choice and the banner will reappear.
                </p>
            </LegalSection>

            <LegalSection id="managing" title="6. Clearing storage in your browser">
                <p style={P}>
                    You can delete everything Marevlo has stored at any time. Note that clearing storage signs you out and
                    resets your theme and consent choices.
                </p>
                <ul style={UL}>
                    <li style={LI}><B>Chrome / Edge:</B> Settings → Privacy and security → Site settings → View permissions and data stored across sites → search &ldquo;marevlo&rdquo; → Delete. Or press F12 → Application → Local storage.</li>
                    <li style={LI}><B>Firefox:</B> Settings → Privacy &amp; Security → Cookies and Site Data → Manage Data → search &ldquo;marevlo&rdquo; → Remove Selected.</li>
                    <li style={LI}><B>Safari:</B> Settings → Privacy → Manage Website Data → search &ldquo;marevlo&rdquo; → Remove.</li>
                    <li style={LI}><B>Mobile browsers:</B> use the browser's &ldquo;Clear browsing data&rdquo; option with &ldquo;Cookies and site data&rdquo; selected.</li>
                </ul>
            </LegalSection>

            <LegalSection id="changes" title="7. Changes to this policy">
                <p style={{ margin: 0 }}>
                    If we add new storage keys or third-party technologies, we will update this page and the &ldquo;Last
                    updated&rdquo; date, and re-prompt for consent where required. Questions? Write to{' '}
                    <a href="mailto:support@marevlo.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>support@marevlo.com</a>.
                </p>
            </LegalSection>
        </LegalShell>
    );
}
