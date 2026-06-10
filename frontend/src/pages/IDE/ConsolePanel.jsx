import React from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * ConsolePanel - Theme-aware collapsible console output
 */

/* ─── Module-level stable constants ─────────────────────────────────────── */

/** O(1) status → color lookup — avoids a function call + switch on every render */
const OUTPUT_COLOR = {
    error:   '#e06661',
    success: '#41bd78',
    running: '#e0a050',
};

/** Header button hover handlers — stable references, never recreated */
const onHeaderEnter = e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; };
const onHeaderLeave = e => { e.currentTarget.style.background = 'var(--color-surface)'; };

/* ─── Component ─────────────────────────────────────────────────────────── */
const ConsolePanel = ({
    output, status, isExpanded, onToggle,
    stdin, onStdinChange,
    useCustomInput, onToggleCustomInput,
    autoWrapReturn, onToggleAutoWrap
}) => {
    const outputColor = OUTPUT_COLOR[status] ?? 'var(--color-primary-text)';

    const onFocus = e => {
        if (useCustomInput) {
            e.currentTarget.style.borderColor = 'var(--color-primary-text)';
            e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary-text) 10%, transparent)';
        }
    };
    const onBlur = e => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.boxShadow = 'none';
    };

    return (
        <div style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            flexShrink: 0,
            height: isExpanded ? 256 : 46,
            transition: 'height 0.22s cubic-bezier(.4,0,.2,1)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
        }}>
            {/* Header */}
            <button
                onClick={onToggle}
                style={{
                    width: '100%', height: 46, flexShrink: 0,
                    padding: '0 18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--color-surface)', border: 'none', cursor: 'pointer',
                    color: 'var(--color-primary-text)',
                    borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none',
                    transition: 'background 0.15s ease',
                }}
                onMouseEnter={onHeaderEnter}
                onMouseLeave={onHeaderLeave}
                aria-label={isExpanded ? "Collapse console" : "Expand console"}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Terminal size={14} style={{ color: 'var(--color-muted-text)' }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-primary-text)' }}>Console</span>
                    {output && !isExpanded && (
                        <span style={{ fontSize: 12, color: outputColor, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
                            — {output.slice(0, 48)}{output.length > 48 ? '…' : ''}
                        </span>
                    )}
                </div>
                {isExpanded
                    ? <ChevronDown size={14} style={{ color: 'var(--color-muted-text)' }} />
                    : <ChevronUp size={14} style={{ color: 'var(--color-muted-text)' }} />
                }
            </button>

            {/* Output body */}
            {isExpanded && (
                <div className="premium-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column' }}>
                    {output ? (
                        <div style={{ flex: 1, minHeight: 60 }}>
                            <pre style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13, color: outputColor, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                                {output}
                            </pre>
                        </div>
                    ) : (
                        <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--color-muted-text)', flex: 1 }}>
                            <Terminal size={24} style={{ opacity: 0.25 }} />
                            <p style={{ fontSize: 13, margin: 0, fontWeight: 500, opacity: 0.7 }}>Run your code to see output here</p>
                        </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, marginTop: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted-text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>STDIN</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-muted-text)', cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={useCustomInput} onChange={e => onToggleCustomInput?.(e.target.checked)} style={{ accentColor: 'var(--color-accent, #2563eb)', width: 13, height: 13 }} />
                                    Use custom input
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-muted-text)', cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={autoWrapReturn} onChange={e => onToggleAutoWrap?.(e.target.checked)} style={{ accentColor: 'var(--color-accent, #2563eb)', width: 13, height: 13 }} />
                                    Auto print return
                                </label>
                            </div>
                        </div>
                        <textarea
                            className="premium-scrollbar"
                            value={stdin}
                            onChange={e => onStdinChange?.(e.target.value)}
                            disabled={!useCustomInput}
                            placeholder="Enter input for the program (passed as STDIN)"
                            style={{
                                width: '100%', height: 90, borderRadius: 10,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface-hover)',
                                color: 'var(--color-primary-text)',
                                fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                padding: '10px 14px', resize: 'none', outline: 'none',
                                boxSizing: 'border-box',
                                lineHeight: 1.55,
                                transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
                                opacity: useCustomInput ? 1 : 0.5,
                            }}
                            onFocus={onFocus}
                            onBlur={onBlur}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConsolePanel;
