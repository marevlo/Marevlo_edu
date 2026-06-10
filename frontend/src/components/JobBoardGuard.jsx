import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

function ProgressBar({ pct, color }) {
    return (
        <div style={{ height: '8px', borderRadius: '9999px', background: 'var(--muted)', overflow: 'hidden' }}>
            <div style={{
                height: '100%', borderRadius: '9999px',
                width: `${Math.min(pct, 100)}%`,
                background: color,
                transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
        </div>
    );
}

function LockedJobBoard({ problemsPct, problemsCompleted, problemsTotal, coursesPct, lessonsCompleted, lessonsTotal }) {
    const { isDark } = useTheme();
    const navigate = useNavigate();
    const surface = 'var(--card)';
    const border = 'var(--border)';
    const muted = 'var(--muted-foreground)';
    const text = 'var(--foreground)';

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', background: 'var(--color-app-bg)' }}>
            <div style={{ maxWidth: '480px', width: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '64px', height: '64px', borderRadius: '16px',
                        background: 'var(--muted)',
                        border: `1px solid ${border}`, marginBottom: '16px',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </div>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: text, margin: '0 0 8px' }}>Jobs Locked</h1>
                    <p style={{ fontSize: '14px', color: muted, margin: 0, lineHeight: 1.5 }}>
                        Complete <strong style={{ color: text }}>75% of problems</strong> and <strong style={{ color: text }}>75% of course lessons</strong> to unlock job opportunities.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                    <div style={{ padding: '20px', borderRadius: '12px', background: surface, border: `1px solid ${border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: text }}>Problems Solved</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: problemsPct >= 75 ? '#41bd78' : muted }}>
                                {problemsCompleted} / {problemsTotal} &nbsp;·&nbsp; {problemsPct}%
                            </span>
                        </div>
                        <ProgressBar pct={problemsPct} color={problemsPct >= 75 ? '#41bd78' : '#6672e0'} />
                        {problemsPct < 75
                            ? <p style={{ fontSize: '12px', color: muted, margin: '8px 0 0' }}>{Math.ceil((0.75 * problemsTotal) - problemsCompleted)} more problems to go</p>
                            : <p style={{ fontSize: '12px', color: '#41bd78', margin: '8px 0 0', fontWeight: 600 }}>✓ Requirement met</p>
                        }
                    </div>

                    <div style={{ padding: '20px', borderRadius: '12px', background: surface, border: `1px solid ${border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: text }}>Course Lessons</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: coursesPct >= 75 ? '#41bd78' : muted }}>
                                {lessonsCompleted} / {lessonsTotal} &nbsp;·&nbsp; {coursesPct}%
                            </span>
                        </div>
                        <ProgressBar pct={coursesPct} color={coursesPct >= 75 ? '#41bd78' : '#e0a050'} />
                        {coursesPct < 75
                            ? <p style={{ fontSize: '12px', color: muted, margin: '8px 0 0' }}>{Math.ceil((0.75 * lessonsTotal) - lessonsCompleted)} more lessons to go</p>
                            : <p style={{ fontSize: '12px', color: '#41bd78', margin: '8px 0 0', fontWeight: 600 }}>✓ Requirement met</p>
                        }
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/problems')}
                        style={{ flex: 1, padding: '11px 0', borderRadius: '10px', fontWeight: 600, fontSize: '14px', border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', color: text }}
                    >
                        Go to Problems
                    </button>
                    <button
                        onClick={() => navigate('/courses')}
                        style={{ flex: 1, padding: '11px 0', borderRadius: '10px', fontWeight: 600, fontSize: '14px', border: 'none', background: 'var(--foreground)', color: 'var(--background)', cursor: 'pointer' }}
                    >
                        Go to Courses
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function JobBoardGuard({ children }) {
    const { user } = useAuth();
    const [status, setStatus] = useState(undefined);

    useEffect(() => {
        if (!user) return;
        setStatus(undefined);
        const controller = new AbortController();
        const token = localStorage.getItem('access_token');
        fetch(`${import.meta.env.VITE_API_URL}/unlock/job-board`, {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setStatus(data))
            .catch((err) => { if (err.name !== 'AbortError') setStatus(false); });
        return () => controller.abort();
    }, [user]);

    if (!user) return children;

    if (status === undefined) {
        return (
            <div className="text-muted-foreground" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '14px' }}>
                Checking access…
            </div>
        );
    }

    if (status === false || status.unlocked) return children;

    return (
        <LockedJobBoard
            problemsPct={status.problems.pct}
            problemsCompleted={status.problems.completed}
            problemsTotal={status.problems.total}
            coursesPct={status.courses.pct}
            lessonsCompleted={status.courses.lessons_completed}
            lessonsTotal={status.courses.lessons_total}
        />
    );
}
