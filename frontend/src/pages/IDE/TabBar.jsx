import React, { useRef, useState, useEffect } from 'react';

const TabBar = ({ activeTab, onTabChange, tabs }) => {
    const containerRef = useRef(null);
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const btn = containerRef.current.querySelector(`[data-tab-id="${activeTab}"]`);
        if (btn) {
            const cr = containerRef.current.getBoundingClientRect();
            const br = btn.getBoundingClientRect();
            setIndicator({ left: br.left - cr.left, width: br.width });
        }
    }, [activeTab, tabs]);

    return (
        <div ref={containerRef} style={{
            display: 'flex', alignItems: 'center', gap: 0, padding: '0 14px',
            position: 'relative', borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            flexShrink: 0,
        }}>
            {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                    <button key={tab.id} data-tab-id={tab.id} onClick={() => onTabChange(tab.id)}
                        style={{
                            padding: '12px 14px', fontSize: 13, fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--color-primary-text)' : 'var(--color-muted-text)',
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            outline: 'none', transition: 'color 0.18s ease',
                            display: 'flex', alignItems: 'center', gap: 6,
                            userSelect: 'none',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-primary-text)'; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-muted-text)'; }}
                    >
                        {tab.icon && <tab.icon size={13} style={{ opacity: isActive ? 1 : 0.6 }} />}
                        {tab.label}
                    </button>
                );
            })}
            {/* Animated underline indicator */}
            <div style={{
                position: 'absolute', bottom: -1, left: indicator.left, width: indicator.width,
                height: 2, borderRadius: '2px 2px 0 0',
                background: 'var(--color-primary-text)',
                opacity: 0.85,
                transition: 'left .22s cubic-bezier(.4,0,.2,1), width .22s cubic-bezier(.4,0,.2,1)',
                pointerEvents: 'none',
            }} />
        </div>
    );
};

export default TabBar;
