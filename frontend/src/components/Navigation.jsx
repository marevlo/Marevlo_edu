import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Zap, Sun, Moon, Menu, X, ArrowRight } from 'lucide-react';
import { popover, drawer, backdrop, modalPanel, staggerParent, fadeUp } from '../lib/motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NavItem from './NavItem';
import NotificationBell from './NotificationBell';
import BugReportModal from './BugReportModal';

function getInitials(name) {
    return name
        ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : 'AU';
}

export default function Navigation() {
    const { user, userPoints, logout, profileData } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [showBugReport, setShowBugReport] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [showHeardFromModal, setShowHeardFromModal] = useState(false);
    const [heardFrom, setHeardFrom] = useState('');
    const [scrolled, setScrolled] = useState(false);
    const profileMenuRef = useRef(null);

    // Detect scroll to add elevated shadow to nav.
    // Layout.jsx puts overflow-auto on <main>, not on window — so
    // window.scrollY stays 0 forever. We listen on the actual scroller.
    useEffect(() => {
        const scroller = document.getElementById('main-scroll') || window;
        const onScroll = () => {
            const top = scroller === window ? window.scrollY : scroller.scrollTop;
            setScrolled(top > 8);
        };
        scroller.addEventListener('scroll', onScroll, { passive: true });
        return () => scroller.removeEventListener('scroll', onScroll);
    }, []);

    const heardFromOptions = [
        'Friend or colleague',
        'Google Search',
        'YouTube',
        'Instagram',
        'LinkedIn',
        'College or university',
        'Teacher or mentor',
        'Hackathon or event',
        'Blog or article',
        'GitHub',
        'Other',
    ];

    const handleGetStartedClick = () => {
        setHeardFrom('');
        setShowHeardFromModal(true);
    };

    const handleHeardFromContinue = () => {
        if (!heardFrom) return;
        localStorage.setItem('heardFrom', heardFrom);
        setShowHeardFromModal(false);
        navigate('/signup');
    };

    useEffect(() => {
        if (!showProfileMenu) return;
        const handleClickOutside = (e) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
                setShowProfileMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showProfileMenu]);

    // Esc closes whichever menu is open
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            setShowProfileMenu(false);
            setShowMobileMenu(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    return (
        <>
            <nav className={`fixed top-0 left-0 right-0 z-50 glass-chrome transition-shadow duration-300 ${scrolled ? 'nav-scrolled' : ''}`}>
                <div className="relative max-w-7xl mx-auto px-4 h-[68px] flex items-center justify-between">
                    <div className="flex items-center cursor-pointer group" onClick={() => navigate('/')}>
                        <img src="/logo/logo marevlo.svg" alt="Marevlo" className="h-10 w-auto group-hover:scale-105 transition-transform duration-300" />
                    </div>

                    {user && (
                        <div className="hidden md:flex items-center gap-6">
                            <div className="flex items-center gap-6">
                                <NavItem label="Project" to="/project" />
                                <NavItem label="Jobs" to="/jobs" />
                                <NavItem label="Feed" to="/feed" />
                            </div>
                            <div className="flex items-center gap-4">
                                <NavItem label="Plan" to="/plan" />
                                <NavItem label="Courses" to="/courses" />
                                <NavItem label="Problems" to="/problems" />
                                <NavItem label="Research" to="/research" />
                            </div>
                        </div>
                    )}

                    <div className="flex items-center space-x-4">
                        {user && (
                            <button
                                onClick={() => setShowMobileMenu(prev => !prev)}
                                aria-label="Toggle navigation menu"
                                aria-expanded={showMobileMenu}
                                className="md:hidden p-2.5 rounded-xl transition-all duration-200 active:scale-95"
                                style={{ backgroundColor: 'var(--muted)', border: '1px solid var(--border)' }}
                            >
                                {showMobileMenu ? <X size={20} /> : <Menu size={20} />}
                            </button>
                        )}

                        <button
                            onClick={toggleTheme}
                            className="relative p-2.5 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
                            style={{ backgroundColor: 'var(--muted)', border: '1px solid var(--border)' }}
                            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            <div className="relative w-5 h-5">
                                <Sun size={20} className={`absolute inset-0 transition-all duration-300 ${isDark ? 'opacity-100 rotate-0 text-yellow-400' : 'opacity-0 rotate-90 text-yellow-500'}`} />
                                <Moon size={20} className={`absolute inset-0 transition-all duration-300 ${isDark ? 'opacity-0 -rotate-90 text-slate-400' : 'opacity-100 rotate-0 text-slate-700'}`} />
                            </div>
                        </button>

                        {user ? (
                            <>
                                <div
                                    className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-full shadow-sm text-foreground"
                                    style={{ backgroundColor: 'var(--muted)', border: '1px solid var(--border)' }}
                                >
                                    <Zap size={14} fill="currentColor" />
                                    <span className="font-mono font-bold text-xs">{userPoints} XP</span>
                                </div>

                                <NotificationBell />

                                <div className="relative" ref={profileMenuRef}>
                                    <button
                                        onClick={() => setShowProfileMenu(prev => !prev)}
                                        aria-label="Account menu"
                                        aria-haspopup="menu"
                                        aria-expanded={showProfileMenu}
                                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-lg hover:ring-2 transition-all overflow-hidden"
                                        style={{ backgroundColor: isDark ? '#ffffff' : '#000000', color: isDark ? '#000000' : '#ffffff' }}
                                    >
                                        {profileData?.avatar_url
                                            ? <img src={profileData.avatar_url} alt="" className="w-full h-full object-cover" />
                                            : getInitials(user.name)
                                        }
                                    </button>

                                    <AnimatePresence>
                                    {showProfileMenu && (
                                        <Motion.div
                                            variants={popover}
                                            initial="hidden"
                                            animate="visible"
                                            exit="exit"
                                            style={{ transformOrigin: 'top right' }}
                                            className="absolute right-0 top-12 w-48 rounded-xl py-2 z-50 glass-card glass-edge"
                                        >
                                            <div className="px-4 py-2 mb-1 border-b border-border">
                                                <p className="text-sm font-bold truncate text-foreground">{user.name}</p>
                                                <p className="text-xs truncate text-muted-foreground">{user.handle || user.email}</p>
                                            </div>
                                            <button onClick={() => { navigate('/profile'); setShowProfileMenu(false); }} className="nav-dropdown-item">Profile</button>
                                            <button onClick={() => { navigate('/settings'); setShowProfileMenu(false); }} className="nav-dropdown-item">Settings</button>
                                            <button onClick={() => { navigate('/about'); setShowProfileMenu(false); }} className="nav-dropdown-item">About Us</button>
                                            <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                                            <button onClick={() => { setShowBugReport(true); setShowProfileMenu(false); }} className="nav-dropdown-item">Report a Bug</button>
                                            <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                                            <button onClick={() => { logout(); navigate('/'); }} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors">Sign Out</button>
                                        </Motion.div>
                                    )}
                                    </AnimatePresence>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => navigate('/login')}
                                    className="hidden sm:inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground transition-colors duration-200"
                                >
                                    Sign in
                                </button>
                                <button
                                    onClick={handleGetStartedClick}
                                    className="group inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(102,114,224,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                                    style={{
                                        background: 'linear-gradient(135deg, #6672e0, #3fa9c9)',
                                        boxShadow: '0 4px 16px rgba(102,114,224,0.35)',
                                    }}
                                >
                                    Get Started
                                    <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile drawer */}
                <AnimatePresence>
                {user && showMobileMenu && (
                    <Motion.div
                        variants={drawer}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="md:hidden border-t border-border overflow-hidden"
                    >
                        <Motion.div
                            variants={staggerParent}
                            initial="hidden"
                            animate="visible"
                            className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1"
                        >
                            {[
                                { label: 'Project', to: '/project' },
                                { label: 'Jobs', to: '/jobs' },
                                { label: 'Feed', to: '/feed' },
                                { label: 'Plan', to: '/plan' },
                                { label: 'Courses', to: '/courses' },
                                { label: 'Problems', to: '/problems' },
                                { label: 'Research', to: '/research' },
                            ].map(item => (
                                <Motion.div key={item.to} variants={fadeUp} className="glass-row px-1">
                                    <NavItem label={item.label} to={item.to} onNavigate={() => setShowMobileMenu(false)} />
                                </Motion.div>
                            ))}
                            <Motion.div variants={fadeUp} className="mt-2 pt-2 border-t border-border flex items-center gap-2 text-foreground">
                                <Zap size={14} fill="currentColor" />
                                <span className="font-mono font-bold text-xs">{userPoints} XP</span>
                            </Motion.div>
                        </Motion.div>
                    </Motion.div>
                )}
                </AnimatePresence>
            </nav>

            {showBugReport && <BugReportModal isDark={isDark} onClose={() => setShowBugReport(false)} />}

            <AnimatePresence>
            {showHeardFromModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <Motion.div
                        variants={backdrop}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setShowHeardFromModal(false)}
                    />
                    <Motion.div
                        variants={modalPanel}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="relative w-full max-w-md rounded-2xl p-6 glass-card glass-edge"
                    >
                        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--color-primary-text)' }}>
                            How did you hear about us?
                        </h2>

                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {heardFromOptions.map((option) => (
                                <label
                                    key={option}
                                    className="glass-row flex items-center gap-3 px-3 py-2 cursor-pointer"
                                    style={{ backgroundColor: 'var(--color-surface-hover)' }}
                                >
                                    <input
                                        type="radio"
                                        name="heardFrom"
                                        value={option}
                                        checked={heardFrom === option}
                                        onChange={(event) => setHeardFrom(event.target.value)}
                                    />
                                    <span className="text-sm" style={{ color: 'var(--color-primary-text)' }}>
                                        {option}
                                    </span>
                                </label>
                            ))}
                        </div>

                        <button
                            onClick={handleHeardFromContinue}
                            disabled={!heardFrom}
                            className="mt-6 w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                backgroundColor: isDark ? '#ffffff' : '#000000',
                                color: isDark ? '#000000' : '#ffffff',
                            }}
                        >
                            Continue
                        </button>
                    </Motion.div>
                </div>
            )}
            </AnimatePresence>

        </>
    );
}
