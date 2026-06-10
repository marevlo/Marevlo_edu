import React from 'react';
import { Check, AlertCircle, ArrowRight } from 'lucide-react';

/**
 * StatusNotification - Success/Error notification overlay
 */
const StatusNotification = ({
    status,
    attempts,
    onNext,
    onDismiss
}) => {
    const cardStyle = {
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        borderRadius: 14,
        padding: '20px 22px',
        width: 300,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
    };

    if (status === 'success') {
        return (
            <div className="absolute top-20 right-8 z-50 animate-in fade-in slide-in-from-right-10">
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{ padding: 10, borderRadius: '50%', background: '#41bd78', color: '#fff', flexShrink: 0, boxShadow: '0 2px 8px rgba(65,189,120,0.35)' }}>
                            <Check size={18} strokeWidth={3} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ color: 'var(--color-primary-text)', fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>Accepted! 🎉</h3>
                            <p style={{ color: 'var(--color-muted-text)', fontSize: 13, margin: '0 0 14px' }}>Your solution passed all test cases.</p>
                            <button
                                onClick={onNext}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 16px', background: '#41bd78', color: '#fff', borderRadius: 9, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', transition: 'background 0.18s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#059669'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#41bd78'; }}
                            >
                                Next Problem <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'error' && attempts === 1) {
        return (
            <div className="absolute top-20 right-8 z-50 animate-in fade-in slide-in-from-right-10 duration-300">
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{ padding: 10, borderRadius: '50%', background: 'rgba(244,63,94,0.15)', color: '#f43f5e', flexShrink: 0 }}>
                            <AlertCircle size={18} strokeWidth={3} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ color: 'var(--color-primary-text)', fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>Wrong Answer</h3>
                            <p style={{ color: 'var(--color-muted-text)', fontSize: 13, margin: '0 0 10px' }}>Your code didn't produce the expected output. Try again!</p>
                            <button
                                onClick={onDismiss}
                                style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-primary-text)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-muted-text)'; }}
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'error' && attempts > 1) {
        return (
            <div className="absolute top-20 right-8 z-50 animate-in fade-in slide-in-from-right-10 duration-300">
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{ padding: 10, borderRadius: '50%', background: 'rgba(244,63,94,0.15)', color: '#f43f5e', flexShrink: 0 }}>
                            <AlertCircle size={18} strokeWidth={3} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ color: 'var(--color-primary-text)', fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>Wrong Answer</h3>
                            <p style={{ color: 'var(--color-muted-text)', fontSize: 13, margin: '0 0 12px' }}>Still incorrect. Keep trying or skip to the next problem.</p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={onDismiss}
                                    style={{ flex: 1, padding: '8px 12px', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', color: 'var(--color-primary-text)', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.18s ease' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-card-bg)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                                >
                                    Try Again
                                </button>
                                <button
                                    onClick={onNext}
                                    style={{ flex: 1, padding: '8px 12px', background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', color: 'var(--color-primary-text)', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, transition: 'background 0.18s ease' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-card-bg)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                                >
                                    Skip <ArrowRight size={12} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default StatusNotification;

