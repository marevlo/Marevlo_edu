import React, { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, User, Mail, Lock, X, Github, Globe } from 'lucide-react';
import { getFirebaseAuth } from '../lib/firebase';
import AuthVisual from '../components/AuthVisual';
import { staggerParent, fadeUp, notice } from '../lib/motion';

const API = import.meta.env.VITE_API_URL;

export default function Signup({ onLogin, onSignupSuccess }) {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        dateOfBirth: '',
        guardianEmail: '',
        guardianConsent: false
    });

    const [passwordStrength, setPasswordStrength] = useState(0);
    const [passwordError, setPasswordError] = useState('');

    const calculateStrength = (password) => {
        let strength = 0;
        if (password.length >= 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        return strength;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });

        if (name === 'password') {
            setPasswordStrength(calculateStrength(value));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setPasswordError('');

        if (passwordStrength < 3) {
            setPasswordError('Please choose a stronger password.');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setPasswordError('Passwords do not match.');
            return;
        }
        if (!formData.dateOfBirth) {
            setPasswordError('Please enter your date of birth.');
            return;
        }
        const _d = new Date(formData.dateOfBirth), _t = new Date();
        let _age = _t.getFullYear() - _d.getFullYear();
        if (_t.getMonth() < _d.getMonth() || (_t.getMonth() === _d.getMonth() && _t.getDate() < _d.getDate())) _age--;
        const minor = _age >= 0 && _age < 18;
        if (minor && (!formData.guardianEmail || !formData.guardianConsent)) {
            setPasswordError('A parent/guardian email and consent are required for users under 18.');
            return;
        }

        try {
            // Ensure username meets backend requirements: 3-50 chars, letters/numbers/underscore
            const rawUsername = formData.name || (formData.email ? formData.email.split('@')[0] : '');
            const username = rawUsername
                .trim()
                .replace(/\s+/g, '_')
                .replace(/[^A-Za-z0-9_]/g, '');

            if (username.length < 3) {
                throw new Error('Choose a username (3+ chars, letters/numbers/_).');
            }

            const response = await fetch(`${API}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    username,
                    password: formData.password,
                    date_of_birth: formData.dateOfBirth,
                    guardian_email: minor ? formData.guardianEmail : undefined,
                    guardian_consent: minor ? formData.guardianConsent : false,
                    heard_from: localStorage.getItem('heardFrom')
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Registration failed');
            }

            const userData = await response.json();
            onSignupSuccess(userData);

        } catch (error) {
            setPasswordError(error.message);
        }
    };

    const [googleLoading, setGoogleLoading] = useState(false);

    const handleGoogleSignup = async () => {
        setPasswordError('');
        setGoogleLoading(true);
        try {
            const { auth, googleProvider, signInWithPopup } = await getFirebaseAuth();
            const result = await signInWithPopup(auth, googleProvider);
            const idToken = await result.user.getIdToken();
            const displayName = result.user.displayName;

            const response = await fetch(`${API}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_token: idToken, heard_from: localStorage.getItem('heardFrom'), display_name: displayName }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Google signup failed');
            }

            const data = await response.json();
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);

            const userResponse = await fetch(`${API}/auth/me`, {
                headers: { Authorization: `Bearer ${data.access_token}` },
            });

            if (userResponse.ok) {
                const userData = await userResponse.json();
                onSignupSuccess(userData);
            } else {
                onSignupSuccess();
            }

            const { auth: a } = await getFirebaseAuth();
            await a.signOut();
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                setPasswordError(err.message);
            }
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleGitHubSignup = () => {
        setPasswordError('GitHub signup is not configured yet. Please use email or Google.');
    };

    const strengthColor = () => {
        if (passwordStrength < 2) return 'bg-red-500 shadow-[0_0_10px_rgba(224,102,97,0.5)]';
        if (passwordStrength === 2) return 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]';
        if (passwordStrength === 3) return 'bg-emerald-500 shadow-[0_0_10px_rgba(65,189,120,0.5)]';
        return 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]';
    };

    const strengthText = () => {
        if (passwordStrength < 2) return 'Weak';
        if (passwordStrength === 2) return 'Fair';
        if (passwordStrength === 3) return 'Good';
        return 'Strong';
    };

    // ── Theme-aware class helpers (form column adapts to light/dark) ──
    const labelCls = 'block text-[13px] font-semibold text-foreground mb-1.5';
    const inputCls = 'block w-full rounded-xl border py-3 pl-11 pr-4 text-sm transition-all duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none border-border bg-card text-foreground placeholder:text-muted-foreground hover:border-primary/40';
    const iconCls = 'text-muted-foreground';

    // Age check for DPDP minor handling (under 18 needs a guardian email + consent).
    const _todayStr = new Date().toISOString().slice(0, 10);
    let isMinor = false;
    if (formData.dateOfBirth) {
        const d = new Date(formData.dateOfBirth);
        const t = new Date();
        let age = t.getFullYear() - d.getFullYear();
        const m = t.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
        isMinor = age >= 0 && age < 18;
    }
    const socialBtnCls = 'flex w-full items-center justify-center gap-2.5 rounded-xl px-3 py-2.5 border transition-all duration-150 bg-card text-foreground hover:bg-muted border-border hover:border-primary/30 text-sm font-semibold';

    return (
        <div className="min-h-[calc(100vh-64px)] flex text-foreground bg-background">
            <div className="flex-1 flex flex-col justify-center py-12 px-6 sm:px-10 lg:flex-none lg:px-16 xl:px-24 relative z-10 w-full lg:w-1/2 max-w-[580px]">

                <Motion.div
                    variants={staggerParent}
                    initial="hidden"
                    animate="visible"
                    className="mx-auto w-full max-w-sm lg:w-96 relative"
                >
                    <Motion.div variants={fadeUp} className="mb-8">
                        <h2 className="text-[2rem] font-extrabold tracking-[-0.02em] mb-2 text-foreground">Create an account</h2>
                        <p className="text-muted-foreground text-[0.95rem]">
                            Join the community of top-tier developers.
                        </p>
                    </Motion.div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <Motion.div variants={fadeUp}>
                            <label className={labelCls}>Full Name</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User size={16} className={iconCls} />
                                </div>
                                <input
                                    name="name"
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                    className={inputCls}
                                    placeholder="Your Name"
                                />
                            </div>
                        </Motion.div>

                        <Motion.div variants={fadeUp}>
                            <label className={labelCls}>Email address</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail size={16} className={iconCls} />
                                </div>
                                <input
                                    name="email"
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={handleChange}
                                    className={inputCls}
                                    placeholder="you@company.com"
                                />
                            </div>
                        </Motion.div>

                        <Motion.div variants={fadeUp}>
                            <label className={labelCls}>Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock size={16} className={iconCls} />
                                </div>
                                <input
                                    name="password"
                                    type="password"
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    className={inputCls}
                                    placeholder="••••••••"
                                />
                            </div>
                            {/* Password Strength Indicator */}
                            <AnimatePresence>
                            {formData.password && (
                                <Motion.div
                                    variants={notice}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="mt-2.5 p-3 rounded-xl glass-card"
                                >
                                    <div className="flex items-center gap-1 mb-2">
                                        <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${passwordStrength >= 1 ? strengthColor() : 'bg-border'}`}></div>
                                        <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${passwordStrength >= 2 ? strengthColor() : 'bg-border'}`}></div>
                                        <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${passwordStrength >= 3 ? strengthColor() : 'bg-border'}`}></div>
                                        <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${passwordStrength >= 4 ? strengthColor() : 'bg-border'}`}></div>
                                    </div>
                                    <div className="flex justify-between text-xs font-semibold">
                                        <span className={`${passwordStrength < 3 ? 'text-muted-foreground' : 'text-emerald-500'}`}>
                                            Strength: {strengthText()}
                                        </span>
                                        <span className="font-mono text-[10px] text-muted-foreground">Min 8 chars, 1 num & sym</span>
                                    </div>
                                </Motion.div>
                            )}
                            </AnimatePresence>
                        </Motion.div>

                        <Motion.div variants={fadeUp}>
                            <label className={labelCls}>Confirm Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock size={16} className={iconCls} />
                                </div>
                                <input
                                    name="confirmPassword"
                                    type="password"
                                    required
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    className={inputCls}
                                    placeholder="••••••••"
                                />
                            </div>
                        </Motion.div>

                        <Motion.div variants={fadeUp}>
                            <label className={labelCls}>Date of birth</label>
                            <div className="relative">
                                <input
                                    name="dateOfBirth"
                                    type="date"
                                    required
                                    max={_todayStr}
                                    value={formData.dateOfBirth}
                                    onChange={handleChange}
                                    className="block w-full rounded-xl border py-3 px-4 text-sm transition-all duration-150 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none border-border bg-card text-foreground hover:border-primary/40"
                                />
                            </div>
                        </Motion.div>

                        <AnimatePresence>
                        {isMinor && (
                            <Motion.div
                                variants={notice}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="rounded-xl glass-card p-4 space-y-3"
                            >
                                <p className="text-sm text-muted-foreground">
                                    Since you're under 18, a parent or guardian must provide their email and consent.
                                </p>
                                <div>
                                    <label className={labelCls}>Parent / guardian email</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Mail size={16} className={iconCls} />
                                        </div>
                                        <input
                                            name="guardianEmail"
                                            type="email"
                                            required={isMinor}
                                            value={formData.guardianEmail}
                                            onChange={handleChange}
                                            className={inputCls}
                                            placeholder="parent@example.com"
                                        />
                                    </div>
                                </div>
                                <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.guardianConsent}
                                        onChange={(e) => setFormData({ ...formData, guardianConsent: e.target.checked })}
                                        className="mt-1"
                                    />
                                    <span>My parent/guardian consents to my creating this account and to Marevlo processing my data.</span>
                                </label>
                            </Motion.div>
                        )}
                        </AnimatePresence>

                        <AnimatePresence>
                        {passwordError && (
                            <Motion.div
                                variants={notice}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="rounded-xl bg-red-500/10 p-3 text-red-500 text-sm flex items-center gap-2 border border-red-500/25"
                            >
                                <X size={15} className="flex-shrink-0" /> {passwordError}
                            </Motion.div>
                        )}
                        </AnimatePresence>

                        <Motion.div variants={fadeUp} className="pt-1">
                            <button
                                type="submit"
                                className="glass-glow flex w-full justify-center items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0"
                                style={{
                                    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                                }}
                            >
                                Create Account <ArrowRight size={15} />
                            </button>
                        </Motion.div>
                    </form>

                    <Motion.div variants={fadeUp} className="mt-7">
                        <div className="relative flex items-center gap-3">
                            <div className="flex-1 border-t border-border" />
                            <span className="text-[12px] font-medium text-muted-foreground whitespace-nowrap px-1">or sign up with</span>
                            <div className="flex-1 border-t border-border" />
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={handleGitHubSignup}
                                className={socialBtnCls}
                            >
                                <Github size={17} />
                                GitHub
                            </button>
                            <button
                                type="button"
                                onClick={handleGoogleSignup}
                                disabled={googleLoading}
                                className={`${socialBtnCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <Globe size={17} className="text-blue-500" />
                                {googleLoading ? 'Signing up…' : 'Google'}
                            </button>
                        </div>
                    </Motion.div>

                    <Motion.p variants={fadeUp} className="mt-8 text-center text-[13px] text-muted-foreground">
                        Already have an account?{' '}
                        <button onClick={onLogin} className="font-bold text-primary hover:text-primary/80 transition-colors">
                            Sign in
                        </button>
                    </Motion.p>
                </Motion.div>
            </div>

            {/* Right Side - Visuals */}
            <AuthVisual />
        </div>
    );
}
