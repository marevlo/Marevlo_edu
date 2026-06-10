import React, { useState } from 'react';
import { ArrowRight, Github, Globe, X, Mail, Lock } from 'lucide-react';
import { getFirebaseAuth } from '../lib/firebase';
import AuthVisual from '../components/AuthVisual';

const API = import.meta.env.VITE_API_URL;

export default function Login({ onLogin, onSignup }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [error, setError] = useState('');
    const [forgotOpen, setForgotOpen] = useState(false);
    const [forgotStep, setForgotStep] = useState('email'); // email | verify
    const [forgotEmail, setForgotEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [forgotMsg, setForgotMsg] = useState('');
    const [forgotError, setForgotError] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);

    const [googleLoading, setGoogleLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const formData = new FormData();
            formData.append('username', email);
            formData.append('password', password);

            const response = await fetch(`${API}/auth/login`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Incorrect email or password');
            }

            const data = await response.json();
            const token = data.access_token;
            const refreshToken = data.refresh_token;
            localStorage.setItem('access_token', token);
            if (refreshToken) {
                localStorage.setItem('refresh_token', refreshToken);
            }

            const userResponse = await fetch(`${API}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (userResponse.ok) {
                const userData = await userResponse.json();
                onLogin(userData);
            } else {
                onLogin();
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setGoogleLoading(true);
        try {
            const { auth, googleProvider, signInWithPopup } = await getFirebaseAuth();
            const result = await signInWithPopup(auth, googleProvider);
            const idToken = await result.user.getIdToken();
            const displayName = result.user.displayName;

            const response = await fetch(`${API}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
    id_token: idToken,
    display_name: displayName
}),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Google login failed');
            }

            const data = await response.json();
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);

            const userResponse = await fetch(`${API}/auth/me`, {
                headers: { Authorization: `Bearer ${data.access_token}` },
            });

            if (userResponse.ok) {
                const userData = await userResponse.json();
                onLogin(userData);
            } else {
                onLogin();
            }

            const { auth: a } = await getFirebaseAuth();
            await a.signOut();
        } catch (err) {
            if (err.code === 'auth/popup-closed-by-user') {
                setError('');
            } else {
                setError(err.message);
            }
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleGitHubLogin = () => {
        setError('GitHub login is not configured yet. Please use email or Google.');
    };

    const resetForgotState = () => {
        setForgotStep('email');
        setForgotEmail('');
        setOtp('');
        setNewPassword('');
        setConfirmNewPassword('');
        setForgotMsg('');
        setForgotError('');
        setForgotLoading(false);
    };

    const handleSendOtp = async () => {
        setForgotError('');
        setForgotMsg('');
        if (!forgotEmail) {
            setForgotError('Please enter your email.');
            return;
        }
        setForgotLoading(true);
        try {
            const response = await fetch(`${API}/auth/password/forgot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to send OTP');
            }
            setForgotMsg('If the email exists, an OTP has been sent.');
            setForgotStep('verify');
        } catch (err) {
            setForgotError(err.message);
        } finally {
            setForgotLoading(false);
        }
    };

    const handleResetPassword = async () => {
        setForgotError('');
        setForgotMsg('');
        if (!otp || !newPassword || !confirmNewPassword) {
            setForgotError('Please fill all fields.');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setForgotError('Passwords do not match.');
            return;
        }
        setForgotLoading(true);
        try {
            const response = await fetch(`${API}/auth/password/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: forgotEmail,
                    otp,
                    new_password: newPassword,
                }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to reset password');
            }
            setForgotMsg('Password reset successful. Please log in.');
            setForgotOpen(false);
            setEmail(forgotEmail);
            setPassword('');
            resetForgotState();
        } catch (err) {
            setForgotError(err.message);
        } finally {
            setForgotLoading(false);
        }
    };

    const labelCls = 'block text-[13px] font-semibold text-foreground mb-1.5';
    const inputCls = 'block w-full rounded-xl border py-3 pl-11 pr-4 text-sm transition-all duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none border-border bg-card text-foreground placeholder:text-muted-foreground hover:border-primary/40';
    const iconCls = 'text-muted-foreground';
    const socialBtnCls = 'flex w-full items-center justify-center gap-2.5 rounded-xl px-3 py-2.5 border transition-all duration-150 bg-card text-foreground hover:bg-muted border-border hover:border-primary/30 text-sm font-semibold';
    const modalPanelCls = 'w-full max-w-md rounded-2xl border shadow-2xl relative overflow-hidden bg-card border-border';
    const modalDividerCls = 'border-border';
    const modalTitleCls = 'text-lg font-bold flex items-center gap-2 text-foreground';
    const modalCloseCls = 'p-2 rounded-lg transition-colors hover:bg-muted text-muted-foreground hover:text-foreground';
    const modalLabelCls = 'block text-sm font-medium text-muted-foreground';
    const modalInputCls = 'mt-2 block w-full rounded-xl border py-3 px-4 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm transition-all border-border bg-muted text-foreground placeholder:text-muted-foreground';
    const modalFooterCls = 'p-6 border-t flex gap-3 justify-end border-border bg-muted/50';

    return (
        <div className="min-h-[calc(100vh-64px)] flex text-foreground bg-background">
            <div className="flex-1 flex flex-col justify-center py-12 px-6 sm:px-10 lg:flex-none lg:px-16 xl:px-24 relative z-10 w-full lg:w-1/2 max-w-[580px]">
                <div className="mx-auto w-full max-w-sm lg:w-96 relative">
                    <div className="mb-9">
                        <h2 className="text-[2rem] font-extrabold tracking-[-0.02em] mb-2 text-foreground">Welcome back</h2>
                        <p className="text-muted-foreground text-[0.95rem]">
                            Sign in to continue your coding streak.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-500 text-sm font-medium flex items-center gap-2">
                            <X size={15} className="flex-shrink-0" /> {error}
                        </div>
                    )}

                    <form action="#" className="space-y-5" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="email" className={labelCls}>Email address</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail size={16} className={iconCls} />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={inputCls}
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="password" className={labelCls} style={{ margin: 0 }}>Password</label>
                                <button
                                    type="button"
                                    onClick={() => { resetForgotState(); setForgotEmail(email); setForgotOpen(true); }}
                                    className="text-[13px] font-semibold text-primary hover:text-primary/80 transition-colors"
                                >
                                    Forgot password?
                                </button>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock size={16} className={iconCls} />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={inputCls}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="pt-1">
                            <button
                                type="submit"
                                className="flex w-full justify-center items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0"
                                style={{
                                    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                                    boxShadow: '0 4px 16px rgba(var(--primary-rgb),0.3), 0 1px 0 rgba(255,255,255,0.15) inset',
                                }}
                            >
                                Sign in <ArrowRight size={15} />
                            </button>
                        </div>
                    </form>

                    <div className="mt-7">
                        <div className="relative flex items-center gap-3">
                            <div className="flex-1 border-t border-border" />
                            <span className="text-[12px] font-medium text-muted-foreground whitespace-nowrap px-1">or continue with</span>
                            <div className="flex-1 border-t border-border" />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button type="button" onClick={handleGitHubLogin} className={socialBtnCls}>
                                <Github size={17} />
                                GitHub
                            </button>
                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                disabled={googleLoading}
                                className={`${socialBtnCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <Globe size={17} className="text-blue-500" />
                                {googleLoading ? 'Signing in…' : 'Google'}
                            </button>
                        </div>
                    </div>

                    <p className="mt-9 text-center text-[13px] text-muted-foreground">
                        Don't have an account?{' '}
                        <button onClick={onSignup} className="font-bold text-primary hover:text-primary/80 transition-colors">
                            Sign up
                        </button>
                    </p>
                </div>
            </div>

            <AuthVisual />

            {forgotOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
                    style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                >
                    <div className={modalPanelCls}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-600 to-cyan-500" />

                        <div className={`p-6 border-b flex items-center justify-between ${modalDividerCls}`}>
                            <h3 className={modalTitleCls}>
                                <Lock size={18} className="text-violet-400" /> Reset Password
                            </h3>
                            <button
                                type="button"
                                onClick={() => { setForgotOpen(false); resetForgotState(); }}
                                className={modalCloseCls}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {forgotMsg && (
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">
                                    {forgotMsg}
                                </div>
                            )}
                            {forgotError && (
                                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
                                    {forgotError}
                                </div>
                            )}

                            <div>
                                <label className={modalLabelCls}>Email address</label>
                                <input
                                    type="email"
                                    value={forgotEmail}
                                    onChange={(e) => setForgotEmail(e.target.value)}
                                    className={modalInputCls}
                                    placeholder="you@example.com"
                                />
                            </div>

                            {forgotStep === 'verify' && (
                                <>
                                    <div className="animate-[slideUpFade_0.3s_ease-out]">
                                        <label className={modalLabelCls}>OTP</label>
                                        <input
                                            type="text"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value)}
                                            className={`${modalInputCls} text-center tracking-[0.5em] font-mono`}
                                            placeholder="••••••"
                                            maxLength={6}
                                        />
                                    </div>

                                    <div className="animate-[slideUpFade_0.4s_ease-out]">
                                        <label className={modalLabelCls}>New Password</label>
                                        <input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className={modalInputCls}
                                        />
                                    </div>

                                    <div className="animate-[slideUpFade_0.5s_ease-out]">
                                        <label className={modalLabelCls}>Confirm New Password</label>
                                        <input
                                            type="password"
                                            value={confirmNewPassword}
                                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                                            className={modalInputCls}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className={modalFooterCls}>
                            {forgotStep === 'email' ? (
                                <button
                                    type="button"
                                    onClick={handleSendOtp}
                                    disabled={forgotLoading}
                                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 shadow-lg transition-all disabled:opacity-50"
                                >
                                    {forgotLoading ? 'Sending...' : 'Send OTP'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleResetPassword}
                                    disabled={forgotLoading}
                                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 shadow-lg transition-all disabled:opacity-50"
                                >
                                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
