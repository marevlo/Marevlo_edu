/**
 * BugReportModal.jsx — Modal dialog for reporting platform bugs.
 *
 * Fields: title (required), description (required).
 * Submits to POST /bug-reports as JSON.
 */
import { useEffect, useRef, useState } from 'react';
import { X, Bug, CheckCircle, AlertCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function BugReportModal({ onClose, isDark }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('idle'); // idle | submitting | success | error
    const [errorMsg, setErrorMsg] = useState('');
    const abortRef = useRef(null);


    // Abort any in-flight request when the modal is closed/unmounted.
    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (title.trim().length < 5) {
            setErrorMsg('Title must be at least 5 characters.');
            return;
        }
        if (description.trim().length < 10) {
            setErrorMsg('Description must be at least 10 characters.');
            return;
        }
        setErrorMsg('');
        setStatus('submitting');

        abortRef.current?.abort();
        abortRef.current = new AbortController();

        const token = localStorage.getItem('access_token');
        const fd = new FormData();
        fd.append('title', title.trim());
        fd.append('description', description.trim());

        try {
            const resp = await fetch(`${API_BASE}/bug-reports`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
                signal: abortRef.current.signal,
            });
            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                throw new Error(body?.detail || `Server error (${resp.status})`);
            }
            setStatus('success');
        } catch (err) {
            if (err.name === 'AbortError') return;
            setErrorMsg(err.message || 'Something went wrong. Please try again.');
            setStatus('error');
        }
    }

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '16px',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Report a bug"
                style={{
                    width: '100%', maxWidth: 520,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 20,
                    boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
                    overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid var(--border)',
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'rgba(224,102,97,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Bug size={18} color="#e06661" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                            Report a Bug
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                            Help us improve Marevlo
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--muted-foreground)', padding: 6, borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                {status === 'success' ? (
                    <div style={{
                        padding: '48px 24px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                    }}>
                        <CheckCircle size={48} color="#41bd78" />
                        <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                            Bug reported — thank you!
                        </p>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                            We've received your report and will look into it.
                        </p>
                        <button
                            onClick={onClose}
                            style={{
                                marginTop: 12, padding: '10px 28px',
                                background: 'var(--primary)', color: '#fff',
                                border: 'none', borderRadius: 10,
                                fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                            }}
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* Title */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground)' }}>
                                    Title <span style={{ color: '#e06661' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    maxLength={200}
                                    placeholder="Short summary of the issue"
                                    style={{
                                        padding: '10px 14px',
                                        background: 'var(--muted)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 10,
                                        fontSize: '0.875rem',
                                        color: 'var(--foreground)',
                                        outline: 'none',
                                    }}
                                    required
                                />
                            </div>

                            {/* Description */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground)' }}>
                                    Description <span style={{ color: '#e06661' }}>*</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    maxLength={5000}
                                    rows={5}
                                    placeholder="Steps to reproduce, what you expected, what actually happened…"
                                    style={{
                                        padding: '10px 14px',
                                        background: 'var(--muted)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 10,
                                        fontSize: '0.875rem',
                                        color: 'var(--foreground)',
                                        resize: 'vertical',
                                        outline: 'none',
                                        lineHeight: 1.6,
                                        fontFamily: 'inherit',
                                    }}
                                    required
                                />
                                <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', alignSelf: 'flex-end' }}>
                                    {description.length} / 5000
                                </span>
                            </div>

                            {/* Error */}
                            {errorMsg && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 14px',
                                    background: 'rgba(224,102,97,0.08)',
                                    border: '1px solid rgba(224,102,97,0.25)',
                                    borderRadius: 10,
                                    color: '#e06661',
                                    fontSize: '0.82rem',
                                }}>
                                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                                    {errorMsg}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '16px 24px',
                            borderTop: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'flex-end', gap: 10,
                        }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    padding: '9px 20px',
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    borderRadius: 10,
                                    fontSize: '0.85rem', fontWeight: 600,
                                    color: 'var(--muted-foreground)', cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={status === 'submitting'}
                                style={{
                                    padding: '9px 22px',
                                    background: 'var(--primary)',
                                    opacity: status === 'submitting' ? 0.5 : 1,
                                    border: 'none', borderRadius: 10,
                                    fontSize: '0.85rem', fontWeight: 700,
                                    color: '#fff', cursor: status === 'submitting' ? 'wait' : 'pointer',
                                    transition: 'opacity 0.15s',
                                }}
                            >
                                {status === 'submitting' ? 'Sending…' : 'Submit Report'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
