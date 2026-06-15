import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    User, Lock, Bell, CreditCard, Shield, Trash2,
    ChevronRight, X, BadgeCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

/* ────────────────────────────────────────────────────────────────────────
   PALETTE — brand-monochrome + 4 semantic colors only.
   `brand` resolves to the same blue in both light and dark mode (close
   match to var(--color-accent), kept as a literal hex so it can be used
   in template strings like `${brand}1a` for opacity suffixes).
   ──────────────────────────────────────────────────────────────────────── */
const palette = {
    brand:   '#5d8ede',
    success: '#41bd78',
    warning: '#e0a050',
    danger:  '#e06661',
};

/* Surface tint helper — mixes a colour into the current theme surface so
   the result reads correctly in BOTH light and dark mode. Use this instead
   of hex+alpha tints (`${c}1a`) which look wrong on light backgrounds. */
const tint = (color, pct = 10) =>
    `color-mix(in srgb, ${color} ${pct}%, var(--card))`;

/* ────────────────────────────────────────────────────────────────────────
   PRIMITIVES
   ──────────────────────────────────────────────────────────────────────── */

function SectionCard({ children, style }) {
    return (
        <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: 22,
            boxShadow: '0 4px 32px color-mix(in srgb, var(--foreground) 4%, transparent), 0 1px 4px color-mix(in srgb, var(--foreground) 6%, transparent)',
            ...style,
        }}>
            {children}
        </div>
    );
}

function SectionTitle({ children, icon: Icon, accentColor = palette.brand, action }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
                width: 30, height: 30, borderRadius: 9,
                background: tint(accentColor, 12),
                border: `1.5px solid ${accentColor}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                {React.createElement(Icon, { size: 14, style: { color: accentColor } })}
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)', flex: 1 }}>{children}</span>
            {action}
        </div>
    );
}

function Chip({ children, color = palette.brand }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 999,
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em',
            background: tint(color, 10), color, border: `1px solid ${color}40`,
            whiteSpace: 'nowrap',
        }}>
            {children}
        </span>
    );
}

function InfoRow({ label, children }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>{children}</div>
        </div>
    );
}

function ToggleSwitch({ checked, onChange, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={onChange}
            style={{
                width: 40, height: 22, borderRadius: 999, flexShrink: 0,
                border: '1px solid var(--border)', padding: 0,
                background: checked ? 'var(--primary)' : 'var(--muted)',
                position: 'relative', cursor: 'pointer',
                transition: 'background 0.2s ease',
            }}
        >
            <span style={{
                position: 'absolute', top: 2, left: checked ? 20 : 2,
                width: 16, height: 16, borderRadius: '50%',
                background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                transition: 'left 0.2s ease',
            }} />
        </button>
    );
}

function PrefRow({ label, description, checked, onChange }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '11px 0' }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: 2, lineHeight: 1.45 }}>{description}</div>
            </div>
            <ToggleSwitch checked={checked} onChange={onChange} label={label} />
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   SHARED CLASS CONSTANTS (mirrors Login/Signup form + modal styling)
   ──────────────────────────────────────────────────────────────────────── */
const labelCls = 'block text-[13px] font-semibold text-foreground mb-1.5';
const inputCls = 'block w-full rounded-xl border py-3 px-4 text-sm transition-all duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none border-border bg-card text-foreground placeholder:text-muted-foreground hover:border-primary/40';

const modalPanelCls = 'w-full max-w-md rounded-2xl border shadow-2xl relative overflow-hidden bg-card border-border';
const modalDividerCls = 'border-border';
const modalTitleCls = 'text-lg font-bold flex items-center gap-2 text-foreground';
const modalCloseCls = 'p-2 rounded-lg transition-colors hover:bg-muted text-muted-foreground hover:text-foreground';
const modalLabelCls = 'block text-sm font-medium text-muted-foreground';
const modalInputCls = 'mt-2 block w-full rounded-xl border py-3 px-4 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm transition-all border-border bg-muted text-foreground placeholder:text-muted-foreground';
const modalFooterCls = 'p-6 border-t flex gap-3 justify-end border-border bg-muted/50';

/* ────────────────────────────────────────────────────────────────────────
   HELPERS
   ──────────────────────────────────────────────────────────────────────── */

const PREF_ROWS = [
    { key: 'in_app_social',        label: 'Social activity', description: 'Replies, comments, likes and new followers' },
    { key: 'in_app_announcements', label: 'Announcements',   description: 'Product announcements from the Marevlo team' },
    { key: 'email_updates',        label: 'Email updates',   description: 'Occasional product emails. Security emails are always sent.' },
];

const LEGAL_LINKS = [
    { to: '/legal/privacy', label: 'Privacy Policy' },
    { to: '/legal/terms',   label: 'Terms of Service' },
    { to: '/legal/cookies', label: 'Cookie Policy' },
    { to: '/legal/refunds', label: 'Refund Policy' },
];

const PRODUCT_LABELS = { all_access: 'All-Access', courses: 'Courses', dsa: 'DSA' };

const fmtDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime())
        ? null
        : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/* apiCall throws Error(detail) when the backend sends {"detail": ...} but
   collapses domain-error envelopes ({"error":{"code":...}}) into a generic
   "HTTP <status>" message — map those to friendly per-context copy. */
const friendlyError = (message, byStatus = {}) => {
    const m = /^HTTP (\d+)$/.exec(message || '');
    if (!m) return message || 'Something went wrong. Please try again.';
    if (m[1] === '429') return 'Too many attempts. Please wait a moment and try again.';
    return byStatus[m[1]] || 'Something went wrong. Please try again.';
};

/* ────────────────────────────────────────────────────────────────────────
   PAGE
   ──────────────────────────────────────────────────────────────────────── */

export default function Settings() {
    const { user, apiCall, logout } = useAuth();
    const showToast = useToast();
    const navigate = useNavigate();

    // Account / subscription data
    const [me, setMe] = useState(null);
    const [prefs, setPrefs] = useState(null);
    const [access, setAccess] = useState(null);
    const [loading, setLoading] = useState(true);

    // Change-password form
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwLoading, setPwLoading] = useState(false);

    // Delete-account modal
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteAck, setDeleteAck] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    useEffect(() => {
        if (!user) return undefined;
        let cancelled = false;
        (async () => {
            const [meR, prefsR, accessR] = await Promise.allSettled([
                apiCall('/auth/me'),
                apiCall('/notifications/preferences'),
                apiCall('/me/access'),
            ]);
            if (cancelled) return;
            if (meR.status === 'fulfilled') setMe(meR.value);
            if (prefsR.status === 'fulfilled') setPrefs(prefsR.value);
            if (accessR.status === 'fulfilled') setAccess(accessR.value);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [user, apiCall]);

    if (!user) {
        return (
            <div className="min-h-full flex items-center justify-center p-6" style={{ background: 'var(--color-app-bg)' }}>
                <SectionCard style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: 32 }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 56, height: 56, borderRadius: 16,
                        background: 'var(--muted)', border: '1px solid var(--border)', marginBottom: 16,
                    }}>
                        <User size={24} style={{ color: 'var(--muted-foreground)' }} />
                    </div>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--foreground)', margin: '0 0 8px' }}>Sign in to manage your settings</h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '0 0 20px', lineHeight: 1.5 }}>
                        Your account, security, notification and privacy settings live here once you're signed in.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="inline-flex justify-center items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0"
                        style={{
                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                            boxShadow: '0 4px 16px rgba(var(--primary-rgb),0.3), 0 1px 0 rgba(255,255,255,0.15) inset',
                        }}
                    >
                        Sign in
                    </button>
                </SectionCard>
            </div>
        );
    }

    const email = me?.email || user.email || '';
    const username = me?.username || user.username || '';
    const emailVerified = !!me?.email_verified_at;
    const hasPaid = !!(access && (access.all_access || access.courses || access.dsa));
    const entitlements = access?.entitlements || [];
    const deleteValid = deleteConfirmText === 'DELETE' && deleteAck;

    const closeDeleteModal = () => {
        setDeleteOpen(false);
        setDeleteConfirmText('');
        setDeletePassword('');
        setDeleteAck(false);
        setDeleteError('');
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (pwLoading) return;
        if (!currentPassword) {
            showToast('Please enter your current password.', 'error');
            return;
        }
        if (newPassword.length < 8) {
            showToast('New password must be at least 8 characters.', 'error');
            return;
        }
        if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
            showToast('New password must include an uppercase letter, a lowercase letter, and a digit.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match.', 'error');
            return;
        }
        setPwLoading(true);
        try {
            await apiCall('/auth/password/change', {
                method: 'POST',
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
            });
            showToast('Password changed. Please sign in again.', 'success');
            logout();
            navigate('/login');
        } catch (err) {
            showToast(friendlyError(err.message, {
                401: 'Current password is incorrect.',
                400: 'This account uses Google sign-in. Use "Forgot password?" on the sign-in page to set a password first.',
            }), 'error');
            setPwLoading(false);
        }
    };

    const togglePref = async (key) => {
        if (!prefs) return;
        const next = !prefs[key];
        setPrefs(prev => ({ ...prev, [key]: next }));
        try {
            const updated = await apiCall('/notifications/preferences', {
                method: 'PUT',
                body: JSON.stringify({ [key]: next }),
            });
            if (updated) setPrefs(updated);
        } catch (err) {
            setPrefs(prev => ({ ...prev, [key]: !next }));
            showToast(friendlyError(err.message, {}), 'error');
        }
    };

    const handleDeleteAccount = async () => {
        if (!deleteValid || deleteLoading) return;
        setDeleteLoading(true);
        setDeleteError('');
        try {
            await apiCall('/auth/account/delete', {
                method: 'POST',
                body: JSON.stringify({ password: deletePassword || null, confirm: 'DELETE' }),
            });
            showToast('Your account has been deleted.', 'success');
            logout();
            navigate('/');
        } catch (err) {
            setDeleteError(friendlyError(err.message, {
                401: 'Incorrect password.',
                400: 'Could not delete your account. Check the confirmation and try again.',
            }));
            setDeleteLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px 60px' }}>
            {/* ── Header ───────────────────────────────────────────────── */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)', margin: 0 }}>Settings</h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
                    Manage your account, security, notifications and data.
                </p>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
                {/* ── (a) ACCOUNT ──────────────────────────────────────── */}
                <SectionCard>
                    <SectionTitle icon={User}>Account</SectionTitle>
                    <InfoRow label="Username">
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>{username || '—'}</span>
                    </InfoRow>
                    <div style={{ borderTop: '1px solid var(--border)' }} />
                    <InfoRow label="Email">
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)', overflowWrap: 'anywhere' }}>{email || '—'}</span>
                        {me && (
                            emailVerified ? (
                                <Chip color={palette.success}><BadgeCheck size={11} /> Verified</Chip>
                            ) : (
                                <>
                                    <Chip color={palette.warning}>Unverified</Chip>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/verify-email?email=' + encodeURIComponent(email))}
                                        style={{
                                            padding: '5px 12px', borderRadius: 10,
                                            border: '1px solid var(--border)', background: 'transparent',
                                            color: 'var(--primary)', fontWeight: 700, fontSize: '0.75rem',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Verify email
                                    </button>
                                </>
                            )
                        )}
                    </InfoRow>
                </SectionCard>

                {/* ── (b) SECURITY ─────────────────────────────────────── */}
                <SectionCard>
                    <SectionTitle icon={Lock}>Security</SectionTitle>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div>
                            <label className={labelCls} htmlFor="settings-current-password">Current password</label>
                            <input
                                id="settings-current-password"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className={inputCls}
                                autoComplete="current-password"
                            />
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="settings-new-password">New password</label>
                            <input
                                id="settings-new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className={inputCls}
                                autoComplete="new-password"
                            />
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                At least 8 characters, with an uppercase letter, a lowercase letter and a digit.
                            </p>
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="settings-confirm-password">Confirm new password</label>
                            <input
                                id="settings-confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={inputCls}
                                autoComplete="new-password"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={pwLoading}
                            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all duration-150 disabled:opacity-50"
                            style={{
                                background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                                boxShadow: '0 4px 16px rgba(var(--primary-rgb),0.3), 0 1px 0 rgba(255,255,255,0.15) inset',
                            }}
                        >
                            {pwLoading ? 'Changing…' : 'Change password'}
                        </button>
                    </form>
                </SectionCard>

                {/* ── (c) NOTIFICATIONS ────────────────────────────────── */}
                <SectionCard>
                    <SectionTitle icon={Bell}>Notifications</SectionTitle>
                    {prefs ? (
                        <div>
                            {PREF_ROWS.map((row, i) => (
                                <div key={row.key} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                                    <PrefRow
                                        label={row.label}
                                        description={row.description}
                                        checked={!!prefs[row.key]}
                                        onChange={() => togglePref(row.key)}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: 0 }}>
                            {loading ? 'Loading preferences…' : 'Notification preferences are unavailable right now. Refresh the page to try again.'}
                        </p>
                    )}
                </SectionCard>

                {/* ── (d) SUBSCRIPTION ─────────────────────────────────── */}
                <SectionCard>
                    <SectionTitle icon={CreditCard}>Subscription</SectionTitle>
                    {hasPaid ? (
                        <div style={{ display: 'grid', gap: 14 }}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {['all_access', 'courses', 'dsa'].filter(k => access[k]).map(k => (
                                    <Chip key={k} color={palette.success}>
                                        <BadgeCheck size={11} /> {PRODUCT_LABELS[k]} · Active
                                    </Chip>
                                ))}
                            </div>
                            {entitlements.length > 0 && (
                                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                                    {entitlements.map((ent, i) => (
                                        <div
                                            key={`${ent.product}-${i}`}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                                                padding: '12px 14px', fontSize: '0.8rem',
                                                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                                            }}
                                        >
                                            <span style={{ fontWeight: 700, color: 'var(--foreground)', minWidth: 90 }}>
                                                {PRODUCT_LABELS[ent.product] || ent.product}
                                            </span>
                                            <span style={{ color: 'var(--muted-foreground)' }}>via {ent.source}</span>
                                            <span style={{ color: 'var(--muted-foreground)', flex: 1 }}>
                                                {fmtDate(ent.starts_at) || '—'} → {ent.expires_at ? fmtDate(ent.expires_at) : 'Lifetime'}
                                            </span>
                                            <Chip color={ent.status === 'active' ? palette.success : palette.warning}>{ent.status}</Chip>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: 0 }}>
                            {loading && !access ? 'Loading subscription…' : "You're on the free plan."}
                        </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
                        <button
                            type="button"
                            onClick={() => navigate('/plan')}
                            style={{
                                padding: '9px 18px', borderRadius: 10, fontWeight: 700, fontSize: '0.8rem',
                                border: '1px solid var(--border)', background: 'transparent',
                                color: 'var(--foreground)', cursor: 'pointer',
                            }}
                        >
                            View plans
                        </button>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                            Payments &amp; invoices:{' '}
                            <a href="mailto:support@marevlo.com" style={{ color: 'var(--primary)', fontWeight: 600 }}>support@marevlo.com</a>
                        </span>
                    </div>
                </SectionCard>

                {/* ── (e) PRIVACY ──────────────────────────────────────── */}
                <SectionCard>
                    <SectionTitle icon={Shield}>Privacy</SectionTitle>
                    <div>
                        {LEGAL_LINKS.map((link, i) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                className="flex items-center justify-between gap-3 py-2.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                            >
                                {link.label}
                                <ChevronRight size={16} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                            </Link>
                        ))}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '12px 0 0', lineHeight: 1.5 }}>
                        Your data: you can verify your email, change your password, and delete your account from this page.
                    </p>
                </SectionCard>

                {/* ── (f) DANGER ZONE ──────────────────────────────────── */}
                <SectionCard style={{ border: '1px solid color-mix(in srgb, #e06661 45%, var(--border))' }}>
                    <SectionTitle icon={Trash2} accentColor="#e06661">Delete account</SectionTitle>
                    <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '0 0 16px', lineHeight: 1.55 }}>
                        Deleting your account is permanent. Your profile, learning progress, submissions and
                        entitlements become inaccessible, and your posts and comments are anonymized or made
                        inaccessible, as described in our{' '}
                        <Link to="/legal/privacy" style={{ color: 'var(--primary)', fontWeight: 600 }}>Privacy Policy</Link>.
                        This cannot be undone.
                    </p>
                    <button
                        type="button"
                        onClick={() => { closeDeleteModal(); setDeleteOpen(true); }}
                        style={{
                            padding: '9px 18px', borderRadius: 10, fontWeight: 700, fontSize: '0.8rem',
                            border: '1.5px solid #e06661', background: 'transparent',
                            color: '#e06661', cursor: 'pointer',
                        }}
                    >
                        Delete my account
                    </button>
                </SectionCard>
            </div>

            {/* ── Delete-account confirm modal ─────────────────────────── */}
            {deleteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
                    style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                    <div className={modalPanelCls}>
                        {/* gradient accent strip */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-rose-500" />

                        {/* header */}
                        <div className={`p-6 border-b flex items-center justify-between ${modalDividerCls}`}>
                            <h3 className={modalTitleCls}>
                                <Trash2 size={18} className="text-red-400" /> Delete account
                            </h3>
                            <button type="button" onClick={closeDeleteModal} className={modalCloseCls}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* body */}
                        <div className="p-6 space-y-4">
                            {deleteError && (
                                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm">{deleteError}</div>
                            )}

                            <p className="text-sm text-muted-foreground">
                                This permanently deletes your Marevlo account. Your profile, learning progress,
                                submissions and entitlements become inaccessible, and your posts and comments are
                                anonymized or made inaccessible.
                            </p>

                            <div>
                                <label className={modalLabelCls}>Type DELETE to confirm</label>
                                <input
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    className={`${modalInputCls} font-mono`}
                                    placeholder="DELETE"
                                    autoComplete="off"
                                />
                            </div>

                            <div>
                                <label className={modalLabelCls}>Password</label>
                                <input
                                    type="password"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    className={modalInputCls}
                                    autoComplete="current-password"
                                />
                                <p className="mt-1.5 text-xs text-muted-foreground">Leave blank if you sign in with Google.</p>
                            </div>

                            <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={deleteAck}
                                    onChange={(e) => setDeleteAck(e.target.checked)}
                                    className="mt-1"
                                />
                                <span>I understand this cannot be undone.</span>
                            </label>
                        </div>

                        {/* footer */}
                        <div className={modalFooterCls}>
                            <button
                                type="button"
                                onClick={closeDeleteModal}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all border border-border text-foreground hover:bg-muted"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteAccount}
                                disabled={!deleteValid || deleteLoading}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all disabled:opacity-50"
                                style={{ background: '#e06661' }}
                            >
                                {deleteLoading ? 'Deleting…' : 'Delete my account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
