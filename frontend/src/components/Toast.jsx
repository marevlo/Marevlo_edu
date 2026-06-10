import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info', duration = 4000) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const bg = {
        success: 'var(--color-success, #41bd78)',
        error: 'var(--destructive)',
        info: 'var(--primary)',
    };

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <div style={{ position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', pointerEvents: 'none' }}>
                {toasts.map(t => (
                    <div
                        key={t.id}
                        style={{
                            padding: '11px 22px', borderRadius: '10px', fontSize: '14px', fontWeight: 500,
                            background: bg[t.type] ?? bg.info, color: '#fff',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                            whiteSpace: 'nowrap', animation: 'toast-slide-up 200ms ease',
                        }}
                    >
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
