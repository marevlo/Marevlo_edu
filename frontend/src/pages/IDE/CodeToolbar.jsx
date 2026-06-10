import React, { useState, memo } from 'react';
import { Settings, ChevronDown, RotateCcw, Copy, Check } from 'lucide-react';

/**
 * CodeToolbar - Theme-aware toolbar with:
 * - Language selector
 * - Copy code button (checkmark 2s feedback)
 * - Reset code button (with confirmation)
 * - Keyboard shortcut hints
 */

/* ─── Module-level stable constants ─────────────────────────────────────── */

const ICON_BTN_STYLE = {
    padding: '5px 10px', borderRadius: 8, background: 'transparent',
    border: '1px solid transparent', color: 'var(--color-muted-text)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
    transition: 'all 0.18s ease',
};

const onIconBtnEnter = e => {
    e.currentTarget.style.color = 'var(--color-primary-text)';
    e.currentTarget.style.background = 'var(--color-surface-hover)';
    e.currentTarget.style.borderColor = 'var(--color-border)';
};
const onIconBtnLeave = e => {
    e.currentTarget.style.color = 'var(--color-muted-text)';
    e.currentTarget.style.background = 'transparent';
    e.currentTarget.style.borderColor = 'transparent';
};

/* ─── IconBtn — proper component so React can track it across renders ───── */
const IconBtn = memo(({ title, onClick, children }) => (
    <button
        title={title}
        onClick={onClick}
        style={ICON_BTN_STYLE}
        onMouseEnter={onIconBtnEnter}
        onMouseLeave={onIconBtnLeave}
    >
        {children}
    </button>
));
IconBtn.displayName = 'IconBtn';

/* ─── Language dropdown item hover handlers ─────────────────────────────── */
const onLangEnter = (selectedId) => (e, langId) => {
    if (langId !== selectedId) {
        e.currentTarget.style.background = 'var(--color-surface-hover)';
        e.currentTarget.style.color = 'var(--color-primary-text)';
    }
};
const onLangLeave = (selectedId) => (e, langId) => {
    if (langId !== selectedId) {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--color-muted-text)';
    }
};

/* ─── Component ─────────────────────────────────────────────────────────── */
const CodeToolbar = ({ selectedLanguage, onLanguageChange, languages = [], onCopy, onReset }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);

    const currentLanguage = languages.find(l => l.id === selectedLanguage) || languages[0] || { name: 'Select' };

    const handleCopy = () => {
        onCopy?.();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReset = () => {
        if (confirmReset) {
            onReset?.();
            setConfirmReset(false);
        } else {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 3000);
        }
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 16px',
            margin: '8px 8px 0',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            flexShrink: 0,
            gap: 8,
        }}>
            {/* Left: Logo + Language */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 24, height: 24, background: 'linear-gradient(135deg, #41bd78, #059669)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(65,189,120,0.3)' }}>
                        <span style={{ color: '#fff', fontWeight: 700, fontSize: 11 }}>M</span>
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary-text)', fontSize: 13, letterSpacing: '-0.01em' }}>Marevlo</span>
                </div>

                <div style={{ width: 1, height: 16, background: 'var(--color-border)' }} />

                {/* Language Selector */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setIsDropdownOpen(o => !o)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 11px', borderRadius: 8,
                            background: 'var(--color-surface-hover)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-primary-text)',
                            fontSize: 12, cursor: 'pointer', fontWeight: 500,
                            transition: 'all 0.18s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-muted-text)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                    >
                        {currentLanguage.name}
                        <ChevronDown size={12} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: '0.2s', opacity: 0.7 }} />
                    </button>

                    {isDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, marginTop: 6,
                                width: 160, background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                zIndex: 20, padding: '5px',
                                backdropFilter: 'blur(12px)',
                            }}>
                                {languages.map((lang) => (
                                    <button
                                        key={lang.id}
                                        onClick={() => { onLanguageChange(lang.id); setIsDropdownOpen(false); }}
                                        style={{
                                            width: '100%', textAlign: 'left',
                                            padding: '7px 10px', fontSize: 13,
                                            borderRadius: 6,
                                            background: lang.id === selectedLanguage ? 'var(--color-surface-hover)' : 'transparent',
                                            color: lang.id === selectedLanguage ? 'var(--color-primary-text)' : 'var(--color-muted-text)',
                                            fontWeight: lang.id === selectedLanguage ? 600 : 400,
                                            border: 'none', cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                        onMouseEnter={e => { if (lang.id !== selectedLanguage) { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-primary-text)'; }}}
                                        onMouseLeave={e => { if (lang.id !== selectedLanguage) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-muted-text)'; }}}
                                    >
                                        {lang.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Right: Copy + Reset + Settings */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {/* Copy Code */}
                <IconBtn title={copied ? 'Copied!' : 'Copy code'} onClick={handleCopy}>
                    {copied ? <Check size={14} style={{ color: '#41bd78' }} /> : <Copy size={14} />}
                    <span style={{ color: copied ? '#41bd78' : 'inherit' }}>{copied ? 'Copied' : 'Copy'}</span>
                </IconBtn>

                {/* Reset Code */}
                <IconBtn title={confirmReset ? 'Click again to confirm reset' : 'Reset to starter code'} onClick={handleReset}>
                    <RotateCcw size={14} style={{ color: confirmReset ? '#e06661' : 'inherit' }} />
                    <span style={{ color: confirmReset ? '#e06661' : 'inherit' }}>
                        {confirmReset ? 'Confirm?' : 'Reset'}
                    </span>
                </IconBtn>

                <div style={{ width: 1, height: 14, background: 'var(--color-border)', margin: '0 4px' }} />

                {/* Settings (placeholder) */}
                <IconBtn title="Settings" onClick={() => {}}>
                    <Settings size={15} />
                </IconBtn>
            </div>
        </div>
    );
};

export default CodeToolbar;
