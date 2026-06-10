import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('ErrorBoundary caught:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="text-muted-foreground" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
                    <p className="text-foreground" style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Something went wrong</p>
                    <p style={{ fontSize: '13px', margin: 0 }}>Reload the page to try again.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-foreground" style={{ marginTop: '8px', padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                    >
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
