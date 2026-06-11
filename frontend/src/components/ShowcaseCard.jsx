import React from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * ShowcaseCard — the Research Courses card, extracted for reuse.
 *
 * Anatomy: part label with fading rule, watermark number, tinted icon tile,
 * tagline pill, heavy title, description, translucent meta chips and CTA
 * buttons along the bottom. Accents cycle through four brand themes by
 * `index` so a grid reads curated rather than random. Theme-aware: deep
 * violet gradients in dark mode, soft lavender/sky in light.
 *
 * Used by: Courses, Problems, Projects. Keep visual changes here so the
 * three grids never drift apart.
 */
export const SHOWCASE_THEMES = [
    {
        primary: '#6672e0', secondary: '#98a0ed',
        dark: 'linear-gradient(145deg, #0d0221 0%, #1a0533 45%, #0f0a2e 100%)',
        light: 'linear-gradient(145deg, #f5f3ff 0%, #ede9fe 45%, #f0f9ff 100%)',
        shadow: 'rgba(102,114,224',
    },
    {
        primary: '#9180e8', secondary: '#ab9df0',
        dark: 'linear-gradient(145deg, #0f0520 0%, #1e0835 45%, #140728 100%)',
        light: 'linear-gradient(145deg, #faf5ff 0%, #f3e8ff 45%, #fdf4ff 100%)',
        shadow: 'rgba(145,128,232',
    },
    {
        primary: '#3fa9c9', secondary: '#5fc4dd',
        dark: 'linear-gradient(145deg, #051522 0%, #082435 45%, #071a28 100%)',
        light: 'linear-gradient(145deg, #f0f9ff 0%, #e0f2fe 45%, #ecfeff 100%)',
        shadow: 'rgba(63,169,201',
    },
    {
        primary: '#7a68d4', secondary: '#ab9df0',
        dark: 'linear-gradient(145deg, #120522 0%, #22083a 45%, #16082b 100%)',
        light: 'linear-gradient(145deg, #f5f3ff 0%, #ede9fe 45%, #f3e8ff 100%)',
        shadow: 'rgba(122,104,212',
    },
];

export default function ShowcaseCard({
    index = 0,
    icon: Icon,
    title,
    tagline,
    description,
    partLabel,        // custom string, or pass null to hide; defaults to "Part NN · title"
    chips = [],       // [{ icon?: Component, label, color? }] — color makes a tinted chip (e.g. difficulty)
    actions = [],     // [{ icon?: Component, label, onClick }] — CTA buttons, bottom-right
    onClick,
    minHeight = 300,
}) {
    const { isDark } = useTheme();
    const t = SHOWCASE_THEMES[index % SHOWCASE_THEMES.length];
    const num = String(index + 1).padStart(2, '0');
    const label = partLabel === undefined ? <>Part {num} &nbsp;·&nbsp; {title}</> : partLabel;

    const accentText = isDark ? t.secondary : t.primary;

    // Light mode: white surface with a faint accent wash in the top corner,
    // crisp neutral border, and small layered shadows (Stripe/Linear style).
    // A full pastel gradient blends into the pale page background and reads
    // flat — accent belongs in small doses (tile, pill, watermark), not as
    // the whole card wash. Dark mode keeps its rich gradients untouched.
    const surface = isDark
        ? t.dark
        : `radial-gradient(130% 70% at 0% 0%, ${t.primary}0D 0%, rgba(255,255,255,0) 55%), #ffffff`;
    const restingBorder = isDark ? `${t.primary}30` : 'rgba(15,23,42,0.08)';
    const hoverBorder = isDark ? `${t.primary}66` : `${t.primary}59`;
    const restingShadow = isDark
        ? `0 16px 48px ${t.shadow},0.15)`
        : '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.05)';
    const hoverShadow = isDark
        ? `0 30px 80px ${t.shadow},0.32)`
        : `0 4px 8px rgba(15,23,42,0.04), 0 16px 40px rgba(15,23,42,0.08), 0 16px 48px ${t.shadow},0.14)`;
    const hoverTransform = isDark ? 'translateY(-8px) scale(1.005)' : 'translateY(-4px)';

    const titleColor = isDark ? '#eeeeff' : 'var(--foreground)';
    const descColor = isDark ? 'rgba(200,200,240,0.6)' : 'var(--muted-foreground)';
    const chipBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.03)';
    const chipBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.08)';
    const chipText = isDark ? 'rgba(220,220,245,0.75)' : '#475569';

    const ctaBase = {
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 10,
        fontSize: '0.75rem', fontWeight: 700,
        background: `${t.primary}${isDark ? '1F' : '12'}`,
        border: `1px solid ${t.primary}${isDark ? '4D' : '38'}`,
        color: accentText,
        cursor: 'pointer', transition: 'all 0.2s ease',
    };
    const ctaHoverIn = (e) => {
        e.currentTarget.style.background = t.primary;
        e.currentTarget.style.color = '#fff';
        e.currentTarget.style.boxShadow = `0 6px 16px ${t.shadow},0.4)`;
    };
    const ctaHoverOut = (e) => {
        e.currentTarget.style.background = `${t.primary}${isDark ? '1F' : '12'}`;
        e.currentTarget.style.color = accentText;
        e.currentTarget.style.boxShadow = 'none';
    };

    return (
        // Fill the grid cell so every card in a row gets the same height —
        // the card body flexes, the part label keeps its natural height.
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            animation: 'fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) both',
            animationDelay: `${Math.min(index, 8) * 50}ms`,
        }}>
            {label && (
                <div className="rc-part-label" style={{ color: t.primary }}>
                    {label}
                </div>
            )}

            <div
                onClick={onClick}
                style={{
                    position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
                    borderRadius: 24, minHeight, padding: 24, flex: 1,
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    background: surface,
                    border: `1px solid ${restingBorder}`,
                    boxShadow: restingShadow,
                    transition: 'transform 0.45s cubic-bezier(.34,1.56,.64,1), box-shadow 0.45s ease, border-color 0.3s ease',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = hoverTransform;
                    e.currentTarget.style.boxShadow = hoverShadow;
                    e.currentTarget.style.borderColor = hoverBorder;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = restingShadow;
                    e.currentTarget.style.borderColor = restingBorder;
                }}
            >
                {/* Watermark number */}
                <div style={{
                    position: 'absolute', right: 16, top: 8,
                    fontSize: 110, fontWeight: 900, lineHeight: 1,
                    color: isDark ? `${t.primary}0D` : `${t.primary}14`,
                    letterSpacing: '-0.06em', userSelect: 'none', pointerEvents: 'none',
                }}>{num}</div>

                <div style={{ position: 'relative', zIndex: 1 }}>
                    {Icon && (
                        <div style={{
                            width: 42, height: 42, borderRadius: 12,
                            background: `${t.primary}${isDark ? '18' : '10'}`,
                            border: `1px solid ${t.primary}${isDark ? '66' : '3D'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 18,
                        }}>
                            <Icon size={18} color={accentText} />
                        </div>
                    )}

                    {tagline && (
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '4px 12px', borderRadius: 100,
                            background: `${t.primary}${isDark ? '1F' : '12'}`,
                            border: `1px solid ${t.primary}${isDark ? '4D' : '33'}`,
                            marginBottom: 14,
                        }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentText }} />
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: accentText }}>
                                {tagline}
                            </span>
                        </div>
                    )}

                    <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: titleColor, lineHeight: 1.12, marginBottom: 8, letterSpacing: '-0.02em' }}>
                        {title}
                    </h2>

                    {description && (
                        <p className="line-clamp-3" style={{ fontSize: '0.8rem', color: descColor, lineHeight: 1.65, maxWidth: 320 }}>
                            {description}
                        </p>
                    )}
                </div>

                {/* Bottom row: meta chips + CTA buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {chips.map(({ icon: ChipIcon, label: chipLabel, color }) => (
                            <div key={chipLabel} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 10,
                                background: color ? `${color}14` : chipBg,
                                border: `1px solid ${color ? `${color}40` : chipBorder}`,
                            }}>
                                {ChipIcon && <ChipIcon size={13} color={color || accentText} />}
                                <span style={{
                                    fontSize: color ? '0.7rem' : '0.74rem',
                                    fontWeight: color ? 700 : 600,
                                    color: color || chipText,
                                    ...(color ? { textTransform: 'uppercase', letterSpacing: '0.04em' } : {}),
                                }}>{chipLabel}</span>
                            </div>
                        ))}
                    </div>

                    {actions.length > 0 && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            {actions.map(({ icon: ActIcon, label: actLabel, onClick: actClick }) => (
                                <button key={actLabel} style={ctaBase} onMouseEnter={ctaHoverIn} onMouseLeave={ctaHoverOut}
                                    onClick={(e) => { e.stopPropagation(); actClick?.(); }}>
                                    {ActIcon && <ActIcon size={13} />} {actLabel}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
