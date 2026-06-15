import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { MailCheck, ArrowRight } from 'lucide-react';
import { useToast } from '../components/Toast';

const API = import.meta.env.VITE_API_URL;

const labelCls = 'block text-sm font-medium text-muted-foreground';
const inputCls = 'mt-2 block w-full rounded-xl border py-3 px-4 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm transition-all border-border bg-muted text-foreground placeholder:text-muted-foreground';

/* Parse both backend error envelopes defensively:
   domain errors -> {"error":{"code","message"}}, HTTPException -> {"detail"} */
async function parseErrorMessage(resp, fallback) {
    if (resp.status === 429) {
        return 'Too many attempts. Please wait a minute and try again.';
    }
    const errData = await resp.json().catch(() => ({}));
    const code = errData?.error?.code;
    const msg = errData?.detail || errData?.error?.message;
    if (resp.status === 401 || code === 'invalid_credentials') {
        return 'That code is invalid or has expired. Request a new one and try again.';
    }
    return msg || fallback;
}

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const showToast = useToast();

    const [email, setEmail] = useState(searchParams.get('email') || '');
    const [otp, setOtp] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [resending, setResending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const cooldownActive = cooldown > 0;
    useEffect(() => {
        if (!cooldownActive) return undefined;
        const timer = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
        return () => clearInterval(timer);
    }, [cooldownActive]);

    const handleVerify = async (e) => {
        e.preventDefault();
        if (verifying) return;
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setError('Please enter your email address.');
            return;
        }
        if (otp.length !== 6) {
            setError('Please enter the 6-digit code from your email.');
            return;
        }
        setVerifying(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch(`${API}/auth/email/verify/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmedEmail, otp }),
            });
            if (!response.ok) {
                throw new Error(await parseErrorMessage(response, 'Verification failed. Please try again.'));
            }
            showToast('Email verified! Please sign in.', 'success');
            navigate('/login');
        } catch (err) {
            setError(err.message || 'Verification failed. Please try again.');
            setVerifying(false);
        }
    };

    const handleResend = async () => {
        if (resending || cooldown > 0) return;
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setError('Please enter your email address.');
            return;
        }
        setResending(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch(`${API}/auth/email/verify/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmedEmail }),
            });
            if (!response.ok) {
                throw new Error(await parseErrorMessage(response, 'Could not send the code. Please try again.'));
            }
            setMessage('If the email exists, a verification code has been sent.');
            setCooldown(60);
        } catch (err) {
            setError(err.message || 'Could not send the code. Please try again.');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="min-h-full flex items-center justify-center px-4 py-12" style={{ background: 'var(--color-app-bg)' }}>
            <div className="w-full rounded-2xl border shadow-2xl relative overflow-hidden bg-card border-border" style={{ maxWidth: 440 }}>
                {/* gradient accent strip */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-600 to-cyan-500" />

                <div className="p-8">
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 56, height: 56, borderRadius: 16,
                        background: 'var(--muted)', border: '1px solid var(--border)', marginBottom: 16,
                    }}>
                        <MailCheck size={26} className="text-primary" />
                    </div>

                    <h1 className="text-[1.5rem] font-extrabold tracking-[-0.02em] text-foreground mb-2">Verify your email</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                        We sent a 6-digit code to{' '}
                        {email.trim()
                            ? <strong className="text-foreground" style={{ overflowWrap: 'anywhere' }}>{email.trim()}</strong>
                            : 'your email address'}
                        . Enter it below to verify your account.
                    </p>

                    {message && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm mb-4">{message}</div>
                    )}
                    {error && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm mb-4">{error}</div>
                    )}

                    <form onSubmit={handleVerify} className="space-y-4">
                        <div>
                            <label className={labelCls} htmlFor="verify-email-address">Email address</label>
                            <input
                                id="verify-email-address"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={inputCls}
                                placeholder="you@example.com"
                                autoComplete="email"
                            />
                        </div>

                        <div>
                            <label className={labelCls} htmlFor="verify-email-otp">Verification code</label>
                            <input
                                id="verify-email-otp"
                                type="text"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className={`${inputCls} text-center tracking-[0.5em] font-mono`}
                                placeholder="••••••"
                                maxLength={6}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={verifying}
                            className="flex w-full justify-center items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
                            style={{
                                background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                                boxShadow: '0 4px 16px rgba(var(--primary-rgb),0.3), 0 1px 0 rgba(255,255,255,0.15) inset',
                            }}
                        >
                            {verifying ? 'Verifying…' : <>Verify email <ArrowRight size={15} /></>}
                        </button>

                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={resending || cooldown > 0}
                            className="flex w-full items-center justify-center gap-2.5 rounded-xl px-3 py-2.5 border transition-all duration-150 bg-card text-foreground hover:bg-muted border-border hover:border-primary/30 text-sm font-semibold disabled:opacity-50"
                        >
                            {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
                        </button>
                    </form>

                    <p className="mt-5 text-center text-sm text-muted-foreground">
                        Skip for now —{' '}
                        <Link to="/login" className="font-semibold text-primary hover:text-primary/80 transition-colors">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
