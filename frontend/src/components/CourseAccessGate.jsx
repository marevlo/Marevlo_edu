import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function LockedCourse({ requiredProduct }) {
    const navigate = useNavigate();
    const border = 'var(--border)';
    const muted = 'var(--muted-foreground)';
    const text = 'var(--foreground)';
    const planLabel = requiredProduct === 'dsa' ? 'the DSA plan' : 'All-Access';

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
                        <Lock size={28} style={{ color: muted }} />
                    </div>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: text, margin: '0 0 8px' }}>This course requires a plan</h1>
                    <p style={{ fontSize: '14px', color: muted, margin: 0, lineHeight: 1.5 }}>
                        This course is part of <strong style={{ color: text }}>{planLabel}</strong>.
                        Upgrade to unlock every lesson and keep your progress in one place.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/courses')}
                        style={{ flex: 1, padding: '11px 0', borderRadius: '10px', fontWeight: 600, fontSize: '14px', border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', color: text }}
                    >
                        Back to courses
                    </button>
                    <button
                        onClick={() => navigate('/plan')}
                        style={{ flex: 1, padding: '11px 0', borderRadius: '10px', fontWeight: 600, fontSize: '14px', border: 'none', background: 'var(--foreground)', color: 'var(--background)', cursor: 'pointer' }}
                    >
                        View plans
                    </button>
                </div>

                <p style={{ fontSize: '12px', color: muted, textAlign: 'center', margin: '16px 0 0' }}>
                    Already purchased?{' '}
                    <a href="mailto:support@marevlo.com" style={{ color: text, fontWeight: 600 }}>support@marevlo.com</a>
                </p>
            </div>
        </div>
    );
}

export default function CourseAccessGate({ children }) {
    const { id } = useParams();
    const { user } = useAuth();
    // Keyed by course id so a result for a previous course reads as "loading"
    // instead of flashing a stale verdict when the route param changes.
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (!user || !id) return;
        const controller = new AbortController();
        const token = localStorage.getItem('access_token');
        fetch(`${import.meta.env.VITE_API_URL}/learning/courses/${encodeURIComponent(id)}/access`, {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setResult({ id, data }))
            .catch((err) => { if (err.name !== 'AbortError') setResult({ id, data: false }); });
        return () => controller.abort();
    }, [user, id]);

    if (!user || !id) return children;

    const status = result && result.id === id ? result.data : undefined;

    if (status === undefined) {
        return (
            <div className="text-muted-foreground" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '14px' }}>
                Checking access…
            </div>
        );
    }

    if (status === false || status.has_access) return children;

    return <LockedCourse requiredProduct={status.required_product} />;
}
