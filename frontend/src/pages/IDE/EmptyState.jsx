import React from 'react';
import { Code2 } from 'lucide-react';

/**
 * EmptyState - Displayed when no problem is selected (Dark Theme)
 */
const EmptyState = () => {
    return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-app-bg)' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: 16, display: 'inline-flex', padding: 16, borderRadius: '50%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                    <Code2 size={44} style={{ color: 'var(--color-muted-text)', opacity: 0.5 }} />
                </div>
                <p style={{ color: 'var(--color-primary-text)', fontSize: 16, fontWeight: 500, margin: 0, opacity: 0.8 }}>No problem selected</p>
                <p style={{ color: 'var(--color-muted-text)', fontSize: 13, marginTop: 8, opacity: 0.6 }}>Select a problem to start coding</p>
            </div>
        </div>
    );
};

export default EmptyState;

