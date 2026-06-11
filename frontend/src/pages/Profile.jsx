import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Camera, Edit2, Save, X, MapPin, Briefcase, FileText,
    Zap, Trophy, Github, Linkedin, ArrowUpRight,
    Code2, BookOpen, CheckCircle, Flame, GraduationCap,
    User, Link as LinkIcon, Activity, Lock,
    Loader, Sparkles, Target, ChevronRight,
    Award, Calendar, CalendarCheck, UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loadAllTopics } from '../utils/topicsLoader';

/* ────────────────────────────────────────────────────────────────────────
   PALETTE — brand-monochrome + 4 semantic colors only.
   `brand` resolves to the same blue in both light and dark mode (close
   match to var(--color-accent), kept as a literal hex so it can be used
   in template strings like `${brand}1a` for opacity suffixes).
   ──────────────────────────────────────────────────────────────────────── */
const palette = {
    brand:   '#5d8ede',
    success: '#41bd78',
    warning: '#e0a050',
    danger:  '#e06661',
};

/* Surface tint helper — mixes a colour into the current theme surface so
   the result reads correctly in BOTH light and dark mode. Use this instead
   of hex+alpha tints (`${c}1a`) which look wrong on light backgrounds. */
const tint = (color, pct = 10) =>
    `color-mix(in srgb, ${color} ${pct}%, var(--card))`;

/* Mirror of Backend BADGE_CATALOGUE so we can render LOCKED badges
   client-side with progress hints. Real Lucide icons (no emoji) and
   colour-disciplined to brand + 3 semantic accents only. */
const BADGE_CATALOGUE = [
    { key: 'first_solve',      label: 'First Blood',     Icon: Zap,            color: palette.warning, hint: 'Solve your first problem',     progress: s => Math.min(1, s.problems_solved / 1) },
    { key: 'ten_solves',       label: 'Problem Crusher', Icon: Flame,          color: palette.danger,  hint: 'Solve 10 problems',            progress: s => Math.min(1, s.problems_solved / 10) },
    { key: 'fifty_solves',     label: 'Algorithm Ace',   Icon: Trophy,         color: palette.brand,   hint: 'Solve 50 problems',            progress: s => Math.min(1, s.problems_solved / 50) },
    { key: 'hundred_solves',   label: 'Code Legend',     Icon: Award,          color: palette.brand,   hint: 'Solve 100 problems',           progress: s => Math.min(1, s.problems_solved / 100) },
    { key: 'streak_7',         label: 'Week Warrior',    Icon: Calendar,       color: palette.brand,   hint: 'Reach a 7-day streak',         progress: s => Math.min(1, s.streak / 7) },
    { key: 'streak_30',        label: 'Month Master',    Icon: CalendarCheck,  color: palette.success, hint: 'Reach a 30-day streak',        progress: s => Math.min(1, s.streak / 30) },
    { key: 'first_course',     label: 'Scholar',         Icon: GraduationCap,  color: palette.brand,   hint: 'Complete your first course',   progress: s => Math.min(1, s.courses_completed / 1) },
    { key: 'profile_complete', label: 'Identity',        Icon: UserCheck,      color: palette.success, hint: 'Add a bio + location',         progress: () => 0 },
];

/* Mirror of profile_service.SKILL_MASTERY_XP. */
const SKILL_MASTERY_XP = 200;
const SKILL_DOT_XP = SKILL_MASTERY_XP / 5;
const SKILL_COLORS = [palette.brand, palette.success, palette.warning, palette.danger];

const VIBES = [
    { Icon: Sparkles,      label: 'Building things', bio: "Building stuff and learning out loud. Currently leveling up my skills one problem at a time." },
    { Icon: Target,        label: 'Going deep',      bio: "Going deep on fundamentals. I like the parts of CS that other people skip." },
    { Icon: Flame,         label: 'Grinding',        bio: "On a mission. Daily problems, weekly projects, monthly wins." },
];

/* ────────────────────────────────────────────────────────────────────────
   PRIMITIVES
   ──────────────────────────────────────────────────────────────────────── */

function Tag({ children, color = palette.brand, icon: Icon }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 999,
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em',
            background: tint(color, 10), color, border: `1px solid ${color}40`,
            whiteSpace: 'nowrap',
        }}>
            {Icon ? <Icon size={11} /> : null}
            {children}
        </span>
    );
}

function SectionCard({ children, style }) {
    return (
        <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: 22,
            boxShadow: '0 4px 32px color-mix(in srgb, var(--foreground) 4%, transparent), 0 1px 4px color-mix(in srgb, var(--foreground) 6%, transparent)',
            ...style,
        }}>
            {children}
        </div>
    );
}

function SectionTitle({ children, icon: Icon, accentColor = palette.brand, action }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
                width: 30, height: 30, borderRadius: 9,
                background: tint(accentColor, 12),
                border: `1.5px solid ${accentColor}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                {React.createElement(Icon, { size: 14, style: { color: accentColor } })}
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)', flex: 1 }}>{children}</span>
            {action}
        </div>
    );
}

function InlineInput({ value, onChange, placeholder, multiline, rows = 4, type = 'text', list, max }) {
    const shared = {
        width: '100%', borderRadius: 12, padding: '10px 14px',
        fontSize: '0.85rem', color: 'var(--foreground)',
        background: 'var(--color-input-bg)',
        border: '1.5px solid var(--border)',
        outline: 'none', transition: 'border-color 0.2s',
        fontFamily: 'inherit',
        resize: multiline ? 'vertical' : undefined,
        boxSizing: 'border-box',
        // Make the native date-picker icon visible in dark mode (the
        // browser default is a black icon which disappears on dark inputs).
        colorScheme: type === 'date' ? 'light dark' : undefined,
    };
    const focus = (e) => (e.currentTarget.style.borderColor = palette.brand);
    const blur = (e) => (e.currentTarget.style.borderColor = 'var(--border)');

    return multiline
        ? <textarea value={value || ''} onChange={onChange} placeholder={placeholder} rows={rows}
            style={shared} onFocus={focus} onBlur={blur} />
        : <input type={type} value={value || ''} onChange={onChange} placeholder={placeholder}
            list={list} max={max}
            style={shared} onFocus={focus} onBlur={blur} />;
}


/* Common college-year suggestions surfaced via a <datalist>. Keeps the
   field free-text (international users, postgrads, dropouts all fit) but
   shortens the path for the common case. */
const COLLEGE_YEAR_OPTIONS = [
    'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5',
    'Freshman', 'Sophomore', 'Junior', 'Senior',
    'Postgrad', 'PhD',
];

/* Format an ISO date (YYYY-MM-DD) as a friendly localised string. Returns
   '—' for null/undefined so the quick-facts grid never renders 'Invalid
   Date'. */
function formatDob(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}


/* ────────────────────────────────────────────────────────────────────────
   AVATAR + XP RING — ring uses var(--color-accent) so the live theme value
   (light: #2563eb, dark: #5d8ede) drives it, not a frozen hex.
   ──────────────────────────────────────────────────────────────────────── */
function AvatarRing({ src, initials, xpInLevel, level, onClick, loading, hovered }) {
    const SIZE = 96;
    const STROKE = 4;
    const RING_PAD = 6;
    const radius = (SIZE / 2) + RING_PAD - STROKE / 2;
    const circ = 2 * Math.PI * radius;
    const pct = Math.max(0, Math.min(1, xpInLevel / 100));
    const dash = circ * pct;
    const ringSize = SIZE + RING_PAD * 2;

    return (
        <div style={{ position: 'relative', flexShrink: 0, width: ringSize, height: ringSize }}>
            <svg
                width={ringSize}
                height={ringSize}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={xpInLevel}
                aria-label={`Level ${level}, ${xpInLevel} of 100 XP to next level`}
                style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
            >
                <circle cx={ringSize/2} cy={ringSize/2} r={radius}
                    fill="none" stroke="var(--border)" strokeWidth={STROKE} />
                <circle cx={ringSize/2} cy={ringSize/2} r={radius}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circ - dash}`}
                    style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(.2,.8,.2,1)' }}
                />
            </svg>

            <button
                type="button"
                onClick={onClick}
                disabled={loading}
                aria-label="Change avatar"
                style={{
                    position: 'absolute',
                    top: RING_PAD, left: RING_PAD,
                    width: SIZE, height: SIZE, borderRadius: '50%',
                    overflow: 'hidden',
                    background: `linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 65%, ${palette.success}))`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', padding: 0,
                    cursor: loading ? 'wait' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                }}
            >
                {src
                    ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '2rem', fontWeight: 800, color: '#fff' }}>{initials}</span>
                }
                {hovered && (
                    <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Camera size={20} style={{ color: '#fff' }} />
                    </div>
                )}
            </button>

            {/* Level chip */}
            <div style={{
                position: 'absolute',
                bottom: -2, right: -2,
                minWidth: 28, height: 22, padding: '0 7px',
                borderRadius: 11,
                background: 'var(--color-accent)',
                border: '2px solid var(--card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 800, color: '#fff',
                boxShadow: `0 2px 8px color-mix(in srgb, var(--color-accent) 40%, transparent)`,
            }}>
                Lv {level}
            </div>
        </div>
    );
}
 
/* ────────────────────────────────────────────────────────────────────────
   MESH BANNER — deterministic but theme-aware. Uses HSL hues seeded from
   user.id for personality, layered over `var(--muted)` so it
   sits naturally on the active theme. Hue range constrained to blue→violet
   so it stays in brand territory (no rainbow).
   ──────────────────────────────────────────────────────────────────────── */
function MeshBanner({ seed = 1 }) {
    const h1 = 200 + ((seed * 17) % 60);   // 200-260: blue→violet
    const h2 = 220 + ((seed * 31) % 60);   // 220-280: blue→magenta
    const h3 = 180 + ((seed * 53) % 80);   // 180-260: cyan→violet
    return (
        <div style={{
            height: 110, position: 'relative', overflow: 'hidden',
            background: `
                radial-gradient(ellipse at 18% 30%, hsl(${h1} 75% 55% / 0.32), transparent 55%),
                radial-gradient(ellipse at 82% 60%, hsl(${h2} 70% 55% / 0.30), transparent 60%),
                radial-gradient(ellipse at 50% 100%, hsl(${h3} 70% 55% / 0.22), transparent 65%),
                var(--muted)
            `,
        }}>
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, transparent 60%, color-mix(in srgb, var(--background) 35%, transparent))',
            }} />
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   TODAY PANEL — primary engagement surface.
   ──────────────────────────────────────────────────────────────────────── */
function TodayPanel({ streak, todayActive, onCta }) {
    let title, sub, ctaLabel, color, Icon;

    if (streak === 0 && !todayActive) {
        title = 'Start your streak today';
        sub = 'Solve one problem to begin. Streaks compound — the hardest day is day one.';
        ctaLabel = 'Pick a problem';
        color = palette.warning;
        Icon = Sparkles;
    } else if (streak > 0 && !todayActive) {
        title = `Keep your ${streak}-day streak alive`;
        sub = 'You haven’t solved anything today. One accepted submission keeps the fire going.';
        ctaLabel = 'Solve now';
        color = palette.danger;
        Icon = Flame;
    } else if (streak > 0 && todayActive) {
        title = `Day ${streak} secured`;
        sub = 'Today is locked in. Push further to widen the gap.';
        ctaLabel = 'Solve another';
        color = palette.success;
        Icon = CheckCircle;
    } else {
        title = 'You’re back. Day 1 logged.';
        sub = 'Come back tomorrow to start a streak.';
        ctaLabel = 'Solve another';
        color = palette.brand;
        Icon = Sparkles;
    }

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            background: tint(color, 8),
            border: `1px solid ${color}40`,
            borderRadius: 18, padding: '18px 22px',
            boxShadow: `0 4px 24px ${color}1a`,
        }}>
            <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: tint(color, 18),
                border: `1.5px solid ${color}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                <Icon size={22} style={{ color }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--foreground)', marginBottom: 3 }}>
                    {title}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
                    {sub}
                </div>
            </div>
            <button
                type="button"
                onClick={onCta}
                style={{
                    padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: color, color: '#fff',
                    fontSize: '0.82rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                    boxShadow: `0 4px 14px ${color}55`,
                    transition: 'transform 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
                {ctaLabel}
                <ChevronRight size={14} />
            </button>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   STAT STRIP
   ──────────────────────────────────────────────────────────────────────── */
function StatStrip({ stats }) {
    const items = [
        { icon: Zap,         value: stats.xp,                                      label: 'XP',      color: palette.warning },
        { icon: Flame,       value: stats.streak > 0 ? `${stats.streak}d` : '0d',  label: 'Streak',  color: palette.danger },
        { icon: Trophy,      value: stats.rank != null ? `#${stats.rank}` : '—',   label: 'Rank',    color: palette.brand },
        { icon: BookOpen,    value: stats.courses_completed,                       label: 'Courses', color: palette.brand },
        { icon: CheckCircle, value: stats.problems_solved,                         label: 'Solved',  color: palette.success },
    ];
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 8,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 10,
            boxShadow: '0 2px 12px color-mix(in srgb, var(--foreground) 4%, transparent)',
        }}>
            {items.map(({ icon: ItemIcon, value, label, color }) => (
                <div key={label} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 12,
                }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: 9,
                        background: tint(color, 12), border: `1px solid ${color}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        {React.createElement(ItemIcon, { size: 14, style: { color } })}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.1 }}>
                            {value}
                        </div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {label}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   XP BAR — uses var(--color-accent) so the bar fill follows the theme.
   ──────────────────────────────────────────────────────────────────────── */
function XpBar({ xp, level, nextReward }) {
    const xpInLevel = xp % 100;
    const pct = (xpInLevel / 100) * 100;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>
                    Level {level}
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                    {xpInLevel} / 100 XP
                </span>
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--muted)', overflow: 'visible' }}>
                <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: 999,
                    background: `linear-gradient(90deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 60%, white))`,
                    boxShadow: `0 0 10px color-mix(in srgb, var(--color-accent) 50%, transparent)`,
                    transition: 'width 0.9s cubic-bezier(.2,.8,.2,1)',
                }} />
                {[25, 50, 75].map(t => (
                    <div key={t} style={{
                        position: 'absolute', top: 0, bottom: 0, left: `${t}%`,
                        width: 1, background: 'var(--border)',
                    }} />
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>
                    {(100 - xpInLevel)} XP to Level {level + 1}
                </span>
                {nextReward && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: '0.65rem', fontWeight: 700,
                        color: nextReward.color,
                        padding: '2px 8px', borderRadius: 999,
                        background: tint(nextReward.color, 10),
                        border: `1px solid ${nextReward.color}40`,
                    }}>
                        {React.createElement(nextReward.Icon, { size: 11, style: { color: nextReward.color } })}
                        Next: {nextReward.label}
                    </span>
                )}
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   ACHIEVEMENTS — always renders all 8 catalogue badges. Earned ones glow,
   locked ones show greyscale + a hint + a tiny progress bar.
   ──────────────────────────────────────────────────────────────────────── */
function AchievementsGrid({ earned, stats }) {
    const earnedMap = new Map(earned.map(a => [a.badge_key, a]));
    const earnedCount = earnedMap.size;
    const total = BADGE_CATALOGUE.length;

    return (
        <>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginBottom: 10, fontWeight: 600 }}>
                {earnedCount} of {total} earned
            </div>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
            }}>
                {BADGE_CATALOGUE.map(b => {
                    const e = earnedMap.get(b.key);
                    const isEarned = !!e;
                    const progress = isEarned ? 1 : (b.progress(stats) || 0);
                    return <BadgeTile key={b.key} badge={b} earned={isEarned} earnedAt={e?.earned_at} progress={progress} />;
                })}
            </div>
        </>
    );
}

function BadgeTile({ badge, earned, earnedAt, progress }) {
    const [hov, setHov] = useState(false);
    const title = earned
        ? `${badge.label}\n${badge.hint}${earnedAt ? `\nEarned ${new Date(earnedAt).toLocaleDateString()}` : ''}`
        : `Locked: ${badge.label}\n${badge.hint}\nProgress: ${Math.round(progress * 100)}%`;
    const Icon = badge.Icon;

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            title={title}
            style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '14px 6px 10px', borderRadius: 12, cursor: 'default',
                background: earned ? tint(badge.color, hov ? 18 : 10) : 'var(--muted)',
                border: `1.5px solid ${earned ? (hov ? badge.color + '90' : badge.color + '50') : 'var(--border)'}`,
                boxShadow: earned && hov ? `0 4px 16px ${badge.color}40` : 'none',
                transform: hov ? 'translateY(-3px)' : 'translateY(0)',
                transition: 'all 0.22s cubic-bezier(0.34,1.2,0.64,1)',
                opacity: earned ? 1 : 0.7,
            }}
        >
            <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: earned ? tint(badge.color, 18) : 'transparent',
                border: earned ? `1px solid ${badge.color}50` : '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={18} style={{ color: earned ? badge.color : 'var(--muted-foreground)' }} />
            </div>
            <span style={{
                fontSize: '0.6rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.25,
                color: earned ? badge.color : 'var(--muted-foreground)',
            }}>
                {badge.label}
            </span>
            {!earned && progress > 0 && progress < 1 && (
                <div style={{
                    position: 'absolute', bottom: 4, left: 8, right: 8,
                    height: 3, borderRadius: 999, background: 'var(--border)', overflow: 'hidden',
                }}>
                    <div style={{ height: '100%', width: `${progress * 100}%`, background: badge.color, transition: 'width 0.6s ease' }} />
                </div>
            )}
            {!earned && (
                <div style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 14, height: 14, borderRadius: '50%',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Lock size={7} style={{ color: 'var(--muted-foreground)' }} />
                </div>
            )}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   SKILL CHIP — 5-dot level (40 XP per dot, mastery at 200 XP).
   ──────────────────────────────────────────────────────────────────────── */
function SkillChip({ label, xp, color }) {
    const dots = Math.min(5, Math.max(1, Math.ceil(xp / SKILL_DOT_XP)));
    const [hov, setHov] = useState(false);
    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            title={`${label}: ${xp} XP (${Math.round((xp / SKILL_MASTERY_XP) * 100)}% to mastery)`}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', borderRadius: 12,
                background: tint(color, hov ? 16 : 8),
                border: `1px solid ${color}45`,
                cursor: 'default',
                transition: 'all 0.18s',
            }}
        >
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground)' }}>{label}</span>
            <span style={{ display: 'inline-flex', gap: 2 }}>
                {[1,2,3,4,5].map(i => (
                    <span key={i} style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: i <= dots ? color : 'var(--border)',
                    }} />
                ))}
            </span>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   VIBE PICKER — empty-bio fallback (Lucide icons, no emoji).
   ──────────────────────────────────────────────────────────────────────── */
function VibePicker({ onPick }) {
    return (
        <div>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginBottom: 12 }}>
                No bio yet. Pick a vibe to start with — you can edit it.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {VIBES.map(v => {
                    const VIcon = v.Icon;
                    return (
                        <button key={v.label}
                            type="button"
                            onClick={() => onPick(v.bio)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '10px 14px', borderRadius: 12,
                                background: 'var(--muted)',
                                border: '1px solid var(--border)',
                                color: 'var(--foreground)',
                                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = palette.brand + '70'; e.currentTarget.style.background = tint(palette.brand, 10); }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--muted)'; }}
                        >
                            <VIcon size={14} style={{ color: palette.brand }} />
                            {v.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   LINK ROW — service brand colors (GitHub neutral, LinkedIn blue) kept as
   conventional choices; everything else theme-aware.
   ──────────────────────────────────────────────────────────────────────── */
function LinkRow({ label, href, color, icon: Icon }) {
    const [hov, setHov] = useState(false);
    if (!href) return (
        <div style={{
            padding: '10px 14px', borderRadius: 12,
            color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic',
            background: 'var(--muted)',
            border: '1px dashed var(--border)',
        }}>
            {label} not added
        </div>
    );
    return (
        <a href={href} target="_blank" rel="noopener noreferrer"
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 12, textDecoration: 'none',
                background: hov ? tint(color, 12) : 'var(--muted)',
                border: `1px solid ${hov ? color + '55' : 'transparent'}`,
                transition: 'all 0.2s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {Icon ? <Icon size={16} style={{ color: hov ? color : 'var(--foreground)', flexShrink: 0 }} /> : <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />}
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: hov ? color : 'var(--foreground)' }}>{label}</span>
            </div>
            <ArrowUpRight size={14} style={{ color: hov ? color : 'var(--muted-foreground)' }} />
        </a>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   ACTIVITY — full-width card with heatmap on the left and summary stats
   on the right. The wider canvas lets the heatmap breathe and the side
   stats fill the otherwise-empty right half meaningfully.
   ──────────────────────────────────────────────────────────────────────── */
const cellBg = (count) => {
    if (count === 0) return 'var(--muted)';
    if (count <= 2) return tint(palette.brand, 25);
    if (count <= 5) return tint(palette.brand, 55);
    return palette.brand;
};

function ActivityFullWidth({ activityData }) {
    const today = new Date();
    const cells = [];
    for (let i = 69; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const entry = activityData.find(a => a.date === key);
        cells.push({ key, count: entry ? entry.count : 0 });
    }

    const totalActive = cells.filter(c => c.count > 0).length;
    const totalActions = cells.reduce((sum, c) => sum + c.count, 0);
    const busiest = cells.reduce((max, c) => c.count > max.count ? c : max, { count: 0, key: null });

    return (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 360px', minWidth: 0 }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(14, 1fr)',
                    gap: 5,
                    maxWidth: 600,
                }}>
                    {cells.map(({ key, count }) => (
                        <div key={key}
                            title={`${key}: ${count} ${count === 1 ? 'activity' : 'activities'}`}
                            style={{
                                width: '100%', aspectRatio: '1', borderRadius: 4,
                                background: cellBg(count),
                                transition: 'transform 0.15s',
                            }}
                        />
                    ))}
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 14, fontSize: '0.7rem', color: 'var(--muted-foreground)',
                    maxWidth: 600,
                }}>
                    <span>Less</span>
                    {[0, 1, 3, 6].map(c => (
                        <div key={c} style={{ width: 11, height: 11, borderRadius: 3, background: cellBg(c) }} />
                    ))}
                    <span>More</span>
                    <span style={{ marginLeft: 'auto' }}>Last 70 days</span>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: '0 1 200px', minWidth: 160 }}>
                <ActivityStat label="Active days" value={`${totalActive} / 70`} color={palette.brand} />
                <ActivityStat label="Total actions" value={totalActions} color={palette.success} />
                <ActivityStat
                    label="Busiest day"
                    value={busiest.count > 0 ? `${busiest.count} ${busiest.count === 1 ? 'action' : 'actions'}` : '—'}
                    color={palette.warning}
                />
            </div>
        </div>
    );
}

function ActivityStat({ label, value, color }) {
    return (
        <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: tint(color, 8),
            border: `1px solid ${color}35`,
        }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color }}>{value}</div>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────
   RESUME ROW — single-line presentation that lives inside the Links tab
   alongside GitHub / LinkedIn. View mode = clickable file pill + replace.
   Empty state = dashed upload button. Edit mode = same upload control.
   ──────────────────────────────────────────────────────────────────────── */
function ResumeRow({ resumeUrl, resumeName, onUpload, onDelete, loading }) {
    if (resumeUrl) {
        const href = /^https?:\/\//.test(resumeUrl)
            ? resumeUrl
            : `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}${resumeUrl}`;
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 12,
                background: tint(palette.brand, 10),
                border: `1px solid ${palette.brand}40`,
            }}>
                <FileText size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <a href={href} target="_blank" rel="noopener noreferrer" style={{
                    flex: 1, minWidth: 0,
                    fontSize: '0.85rem', fontWeight: 600,
                    color: 'var(--color-accent)',
                    textDecoration: 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {resumeName || 'Resume'}
                </a>
                <button onClick={onUpload} disabled={loading} style={{
                    padding: '5px 10px', borderRadius: 8,
                    fontSize: '0.7rem', fontWeight: 700,
                    background: 'transparent',
                    color: 'var(--muted-foreground)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    opacity: loading ? 0.6 : 1,
                }}>
                    {loading ? '...' : 'Replace'}
                </button>
                <button onClick={onDelete} aria-label="Remove resume" style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                }}>
                    <X size={14} style={{ color: palette.danger }} />
                </button>
            </div>
        );
    }
    return (
        <button onClick={onUpload} disabled={loading} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 12,
            background: 'var(--muted)',
            border: '1px dashed var(--border)',
            cursor: loading ? 'wait' : 'pointer',
            width: '100%', textAlign: 'left',
            color: 'var(--foreground)',
            opacity: loading ? 0.7 : 1,
            transition: 'all 0.15s',
        }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = palette.brand + '70'; e.currentTarget.style.background = tint(palette.brand, 8); }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--muted)'; }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={16} style={{ color: 'var(--muted-foreground)' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {loading ? 'Uploading...' : 'Upload resume'}
                </span>
            </div>
            {loading
                ? <Loader size={14} style={{ color: 'var(--muted-foreground)', animation: 'spin 1s linear infinite' }} />
                : <ArrowUpRight size={14} style={{ color: 'var(--muted-foreground)' }} />}
        </button>
    );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════════════════ */
export default function Profile() {
    const { user, profileStats, achievements, profileData, updateUser, uploadResume, uploadAvatar, refreshStats } = useAuth();
    const navigate = useNavigate();

    const [isEditing, setIsEditing] = useState(false);
    const [activityData, setActivityData] = useState([]);
    const [saveLoading, setSaveLoading] = useState(false);
    const [resumeLoading, setResumeLoading] = useState(false);
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [avatarHover, setAvatarHover] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const fileRef = useRef(null);
    const resumeRef = useRef(null);

    const buildForm = () => ({
        name: profileData?.name || user?.name || '',
        headline: profileData?.headline || user?.headline || 'Aspiring Developer',
        bio: profileData?.bio || user?.bio || '',
        location: profileData?.location || user?.location || '',
        college: profileData?.college || '',
        college_year: profileData?.college_year || '',
        company: profileData?.company || '',
        // Backend returns dob as ISO date string (YYYY-MM-DD) — pass straight
        // to <input type="date"> which expects exactly that format.
        dob: profileData?.dob || '',
        email: user?.email || '',
        avatar: profileData?.avatar_url || user?.avatar || null,
        github: profileData?.github_url || user?.github || '',
        linkedin: profileData?.linkedin_url || user?.linkedin || '',
        resumeName: profileData?.resume_filename
            || (profileData?.resume_url ? profileData.resume_url.split('?')[0].split('/').pop() : null),
        resumeUrl: profileData?.resume_url || null,
    });

    const [form, setForm] = useState(buildForm());

    useEffect(() => {
        if (!isEditing) setForm(buildForm());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileData, user, isEditing]);

    useEffect(() => {
        if (!user?.id) return;
        const token = localStorage.getItem('access_token');
        if (!token) return;
        fetch(`${import.meta.env.VITE_API_URL}/profile/activity`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : [])
            .then(setActivityData)
            .catch(() => setActivityData([]));
    }, [user?.id]);

    const handleSolveAnother = async () => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            navigate('/login');
            return;
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/submissions/my-submissions?limit=100`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                navigate('/problems');
                return;
            }
            const submissions = await res.json();
            const lastAccepted = submissions.find(s => s.status === 'accepted');
            const topics = await loadAllTopics();
            
            if (lastAccepted) {
                const lastTitleNormalized = lastAccepted.problem_title.trim().toLowerCase();
                let solvedTopicIndex = -1;
                let solvedProblemIndex = -1;
                
                for (let tIdx = 0; tIdx < topics.length; tIdx++) {
                    const pIdx = topics[tIdx].problems.findIndex(
                        p => p.title.trim().toLowerCase() === lastTitleNormalized
                    );
                    if (pIdx !== -1) {
                        solvedTopicIndex = tIdx;
                        solvedProblemIndex = pIdx;
                        break;
                    }
                }
                
                if (solvedTopicIndex !== -1 && solvedProblemIndex !== -1) {
                    const currentTopic = topics[solvedTopicIndex];
                    if (solvedProblemIndex + 1 < currentTopic.problems.length) {
                        const nextProblem = currentTopic.problems[solvedProblemIndex + 1];
                        navigate(`/problems/${currentTopic.id}/${nextProblem.id}`);
                        return;
                    } else {
                        const nextTopicIndex = (solvedTopicIndex + 1) % topics.length;
                        const nextTopic = topics[nextTopicIndex];
                        if (nextTopic && nextTopic.problems.length > 0) {
                            const nextProblem = nextTopic.problems[0];
                            navigate(`/problems/${nextTopic.id}/${nextProblem.id}`);
                            return;
                        }
                    }
                }
            }
            
            for (const t of topics) {
                if (t.problems && t.problems.length > 0) {
                    navigate(`/problems/${t.id}/${t.problems[0].id}`);
                    return;
                }
            }
            navigate('/problems');
        } catch (err) {
            console.error('Error finding next problem:', err);
            navigate('/problems');
        }
    };

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    const handleAvatar = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        if (!file.type.startsWith('image/')) { alert('Avatar must be an image'); return; }
        if (file.size > 2 * 1024 * 1024)     { alert('Avatar must be 2 MB or smaller'); return; }

        const reader = new FileReader();
        reader.onloadend = () => set('avatar', reader.result);
        reader.readAsDataURL(file);

        setAvatarLoading(true);
        try {
            const updated = await uploadAvatar(file);
            set('avatar', updated.avatar_url);
        } catch (err) {
            alert('Avatar upload failed: ' + err.message);
            set('avatar', profileData?.avatar_url || user?.avatar || null);
        } finally {
            setAvatarLoading(false);
        }
    };

    const handleResume = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setResumeLoading(true);
        try {
            const data = await uploadResume(file);
            set('resumeName', file.name);
            set('resumeUrl', data.resume_url);
        } catch (err) {
            alert('Resume upload failed: ' + err.message);
        } finally {
            setResumeLoading(false);
        }
    };

    const save = async () => {
        setSaveLoading(true);
        try {
            await updateUser({
                name: form.name,
                headline: form.headline,
                bio: form.bio,
                location: form.location,
                college: form.college,
                college_year: form.college_year,
                company: form.company,
                // Backend accepts null to clear, "" would fail Date parsing.
                dob: form.dob || null,
                github_url: form.github,
                linkedin_url: form.linkedin,
            });
            await refreshStats();
            setIsEditing(false);
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
        } catch (err) {
            alert('Save failed: ' + err.message);
        } finally {
            setSaveLoading(false);
        }
    };

    const cancel = () => { setForm(buildForm()); setIsEditing(false); };

    const pickVibe = (text) => {
        setIsEditing(true);
        setForm(f => ({ ...f, bio: text }));
    };

    const dp = form;
    const initials = (dp.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase())
        || (user?.username?.slice(0, 2).toUpperCase())
        || 'U';
    const displayStats = profileStats || { xp: 0, level: 1, streak: 0, rank: null, courses_completed: 0, problems_solved: 0 };
    const memberYear = profileData?.created_at ? new Date(profileData.created_at).getFullYear() : new Date().getFullYear();
    const handle = user?.handle || (user?.username ? `@${user.username}` : '@user');

    const todayActive = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return activityData.some(a => a.date === today && a.count > 0);
    }, [activityData]);

    const nextReward = useMemo(() => {
        const earnedKeys = new Set(achievements.map(a => a.badge_key));
        return BADGE_CATALOGUE.find(b => !earnedKeys.has(b.key)) || null;
    }, [achievements]);

    const TABS = [
        { id: 'overview', label: 'Overview', icon: User },
        { id: 'skills',   label: 'Skills',   icon: Code2 },
        { id: 'links',    label: 'Links',    icon: LinkIcon },
    ];

    const SKILLS = Object.entries(profileData?.skills || {})
        .sort((a, b) => b[1] - a[1])
        .map(([label, xp], i) => ({ label, xp, color: SKILL_COLORS[i % SKILL_COLORS.length] }));

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', overflowY: 'auto', position: 'relative' }}
             className="custom-scrollbar">

            {/* Toast */}
            <div style={{
                position: 'fixed', bottom: 30, right: 30, zIndex: 100,
                background: 'var(--card)', border: `1px solid ${palette.success}55`,
                padding: '12px 20px', borderRadius: 12,
                boxShadow: `0 8px 32px ${palette.success}30`,
                display: 'flex', alignItems: 'center', gap: 10,
                transform: showToast ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.9)',
                opacity: showToast ? 1 : 0, pointerEvents: showToast ? 'auto' : 'none',
                transition: 'all 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)',
            }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: tint(palette.success, 18), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle size={14} style={{ color: palette.success }} />
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>Profile saved successfully</span>
            </div>

            <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                <div className="profile-orb profile-orb-1" />
                <div className="profile-orb profile-orb-2" />
                <div className="profile-orb profile-orb-3" />
            </div>

            <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 16px 60px', position: 'relative', zIndex: 1 }}>

                {/* ═════ HERO ═════ */}
                <div className="profile-fade-in" style={{
                    borderRadius: 24, overflow: 'hidden', marginBottom: 16,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    boxShadow: '0 8px 40px color-mix(in srgb, var(--foreground) 5%, transparent), 0 2px 8px color-mix(in srgb, var(--foreground) 6%, transparent)',
                    position: 'relative',
                }}>
                    <MeshBanner seed={user?.id || 1} />

                    {!isEditing && (
                        <button onClick={() => setIsEditing(true)} aria-label="Edit profile"
                            style={{
                                position: 'absolute', top: 14, right: 14, zIndex: 2,
                                width: 36, height: 36, borderRadius: 10,
                                background: 'var(--card)',
                                border: '1px solid var(--border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.15s',
                                boxShadow: '0 2px 8px color-mix(in srgb, var(--foreground) 8%, transparent)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = tint(palette.brand, 12); e.currentTarget.style.borderColor = palette.brand + '55'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                            <Edit2 size={15} style={{ color: 'var(--foreground)' }} />
                        </button>
                    )}

                    <div style={{ padding: '0 28px 24px', marginTop: -52, position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
                            <div
                                onMouseEnter={() => setAvatarHover(true)}
                                onMouseLeave={() => setAvatarHover(false)}
                            >
                                <AvatarRing
                                    src={form.avatar}
                                    initials={initials}
                                    xpInLevel={displayStats.xp % 100}
                                    level={displayStats.level}
                                    onClick={() => { if (!avatarLoading) fileRef.current?.click(); }}
                                    loading={avatarLoading}
                                    hovered={avatarHover}
                                />
                            </div>
                            <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={handleAvatar} />

                            <div style={{ flex: 1, minWidth: 220, paddingBottom: 4 }}>
                                {isEditing
                                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <InlineInput value={form.name}     onChange={e => set('name', e.target.value)}     placeholder="Your name" />
                                        <InlineInput value={form.headline} onChange={e => set('headline', e.target.value)} placeholder="What you're about (e.g. CS junior, ML enthusiast)" />
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                                            <InlineInput value={form.college}      onChange={e => set('college', e.target.value)}      placeholder="College / School" />
                                            <InlineInput value={form.college_year} onChange={e => set('college_year', e.target.value)} placeholder="Year (e.g. Year 2)" list="college-year-list" />
                                        </div>
                                        <datalist id="college-year-list">
                                            {COLLEGE_YEAR_OPTIONS.map(o => <option key={o} value={o} />)}
                                        </datalist>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <InlineInput value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company (optional)" />
                                            <InlineInput value={form.dob}     onChange={e => set('dob', e.target.value)}     placeholder="Date of birth" type="date" max={new Date().toISOString().split('T')[0]} />
                                        </div>
                                        <InlineInput value={form.location} onChange={e => set('location', e.target.value)} placeholder="Location" />
                                    </div> 
                                    : <div>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
                                            <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1.15, letterSpacing: '-0.02em', margin: 0 }}>
                                                {dp.name || user?.username || 'Set your name'}
                                            </h1>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                                                {handle}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '0.88rem', color: 'var(--muted-foreground)', margin: '0 0 10px' }}>
                                            {dp.headline}
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {dp.college && (
                                                <Tag color={palette.brand} icon={GraduationCap}>
                                                    {dp.college_year ? `${dp.college_year} · ${dp.college}` : dp.college}
                                                </Tag>
                                            )}
                                            {!dp.college && dp.college_year && (
                                                <Tag color={palette.brand} icon={GraduationCap}>{dp.college_year}</Tag>
                                            )}
                                            {dp.company  && <Tag color={palette.brand} icon={Briefcase}>{dp.company}</Tag>}
                                            {dp.location && <Tag color={palette.brand} icon={MapPin}>{dp.location}</Tag>}
                                            {!dp.college && !dp.company && !dp.location && !dp.college_year && (
                                                <button onClick={() => setIsEditing(true)} style={{
                                                    padding: '4px 10px', borderRadius: 999,
                                                    fontSize: '0.7rem', fontWeight: 600,
                                                    background: 'transparent',
                                                    color: 'var(--muted-foreground)',
                                                    border: '1px dashed var(--border)',
                                                    cursor: 'pointer',
                                                }}>+ Add school, company, or location</button>
                                            )}
                                        </div>
                                    </div>
                                }
                            </div>

                            {isEditing && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0, paddingBottom: 4 }}>
                                    <button onClick={cancel} style={{
                                        padding: '9px 16px', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600,
                                        border: '1px solid var(--border)',
                                        color: 'var(--muted-foreground)', background: 'transparent', cursor: 'pointer',
                                    }}>Cancel</button>
                                    <button onClick={save} disabled={saveLoading} style={{
                                        padding: '9px 20px', borderRadius: 12, fontSize: '0.82rem', fontWeight: 700,
                                        color: '#fff', cursor: 'pointer',
                                        background: 'var(--color-accent)',
                                        border: 'none',
                                        boxShadow: `0 4px 14px color-mix(in srgb, var(--color-accent) 40%, transparent)`,
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        opacity: saveLoading ? 0.7 : 1,
                                    }}>
                                        {saveLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                                        Save
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                            <XpBar xp={displayStats.xp} level={displayStats.level} nextReward={nextReward} />
                        </div>
                    </div>
                </div>

                {/* ═════ TODAY ═════ */}
                <div className="profile-fade-in" style={{ marginBottom: 16 }}>
                    <TodayPanel
                        streak={displayStats.streak}
                        todayActive={todayActive}
                        onCta={handleSolveAnother}
                    />
                </div>

                {/* ═════ STATS ═════ */}
                <div className="profile-fade-in-delay" style={{ marginBottom: 16 }}>
                    <StatStrip stats={displayStats} />
                </div>

                {/* ═════ ACTIVITY (full-width) ═════ */}
                <div className="profile-fade-in-delay" style={{ marginBottom: 20 }}>
                    <SectionCard>
                        <SectionTitle icon={Activity} accentColor={palette.brand}>Activity</SectionTitle>
                        <ActivityFullWidth activityData={activityData} />
                    </SectionCard>
                </div>

                {/* ═════ TABS ═════ */}
                <div className="profile-fade-in-delay-2" style={{
                    display: 'flex', padding: 5, marginBottom: 18,
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
                    boxShadow: '0 2px 12px color-mix(in srgb, var(--foreground) 4%, transparent)',
                    position: 'relative',
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 5, bottom: 5,
                        width: `calc(${100 / TABS.length}% - ${10 / TABS.length}px)`,
                        background: tint(palette.brand, 14),
                        border: `1.5px solid color-mix(in srgb, var(--color-accent) 40%, transparent)`,
                        borderRadius: 11,
                        transform: `translateX(calc(${TABS.findIndex(t => t.id === activeTab)} * (100% + ${10 / TABS.length}px)))`,
                        transition: 'transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)',
                        pointerEvents: 'none', zIndex: 0,
                    }} />
                    {TABS.map(({ id, label, icon: Icon }) => {
                        const active = activeTab === id;
                        return (
                            <button key={id} onClick={() => setActiveTab(id)} style={{
                                flex: 1, padding: '10px 14px', borderRadius: 11, border: 'none', cursor: 'pointer',
                                fontWeight: active ? 700 : 600, fontSize: '0.82rem',
                                background: 'transparent',
                                color: active ? 'var(--color-accent)' : 'var(--muted-foreground)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                transition: 'color 0.2s',
                                position: 'relative', zIndex: 1,
                            }}>
                                {React.createElement(Icon, { size: 14 })} {label}
                            </button>
                        );
                    })}
                </div>

                {/* ═════ CONTENT ═════ */}
                <div className="profile-grid">
                    <div>
                        {activeTab === 'overview' && (
                            <SectionCard>
                                <SectionTitle icon={User} accentColor={palette.brand}>About Me</SectionTitle>
                                {isEditing
                                    ? <InlineInput multiline value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="Tell us about yourself..." />
                                    : (dp.bio
                                        ? <p style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--foreground)', margin: 0 }}>
                                            {dp.bio}
                                        </p>
                                        : <VibePicker onPick={pickVibe} />
                                    )
                                }

                                <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                                    {[
                                        { label: 'Email',         value: dp.email || '—' },
                                        { label: 'Location',      value: dp.location || '—' },
                                        { label: 'School',        value: dp.college || '—' },
                                        { label: 'Year',          value: dp.college_year || '—' },
                                        { label: 'Company',       value: dp.company || '—' },
                                        { label: 'Date of birth', value: formatDob(dp.dob) },
                                        { label: 'Member since',  value: memberYear },
                                    ].map(({ label, value }) => (
                                        <div key={label} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--muted)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: 3 }}>{label}</div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {activeTab === 'skills' && (
                            <SectionCard>
                                <SectionTitle icon={Target} accentColor={palette.brand}>Skill Levels</SectionTitle>
                                {SKILLS.length === 0
                                    ? <div style={{
                                        padding: 18, borderRadius: 12,
                                        background: 'var(--muted)',
                                        border: '1px dashed var(--border)',
                                        textAlign: 'center',
                                    }}>
                                        <Code2 size={22} style={{ color: 'var(--muted-foreground)', opacity: 0.6, margin: '0 auto 8px' }} />
                                        <p style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', margin: '0 0 4px' }}>
                                            No skill XP yet
                                        </p>
                                        <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', opacity: 0.7, margin: 0 }}>
                                            Solve problems — your topic XP shows up here as 1–5 dot levels.
                                        </p>
                                    </div>
                                    : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {SKILLS.map(s => <SkillChip key={s.label} {...s} />)}
                                    </div>
                                }

                                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', marginBottom: 8 }}>
                                        How levels work
                                    </div>
                                    <p style={{ fontSize: '0.76rem', lineHeight: 1.55, color: 'var(--muted-foreground)', margin: 0 }}>
                                        Each topic earns XP from solved problems. 5 dots = mastery ({SKILL_MASTERY_XP} XP).
                                        Hover a chip to see exact XP.
                                    </p>
                                </div>
                            </SectionCard>
                        )}

                        {activeTab === 'links' && (
                            <SectionCard>
                                <SectionTitle icon={LinkIcon} accentColor={palette.brand}>Showcase</SectionTitle>
                                {isEditing
                                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <InlineInput value={form.github   || ''} onChange={e => set('github',   e.target.value)} placeholder="GitHub profile URL" />
                                        <InlineInput value={form.linkedin || ''} onChange={e => set('linkedin', e.target.value)} placeholder="LinkedIn profile URL" />
                                        <ResumeRow
                                            resumeUrl={dp.resumeUrl}
                                            resumeName={dp.resumeName}
                                            loading={resumeLoading}
                                            onUpload={() => resumeRef.current?.click()}
                                            onDelete={async () => {
                                                await updateUser({ resume_url: null });
                                                set('resumeName', null);
                                                set('resumeUrl', null);
                                            }}
                                        />
                                    </div>
                                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <LinkRow label="GitHub"   href={dp.github}   color="var(--foreground)" icon={Github} />
                                        <LinkRow label="LinkedIn" href={dp.linkedin} color="#0a66c2" icon={Linkedin} />
                                        <ResumeRow
                                            resumeUrl={dp.resumeUrl}
                                            resumeName={dp.resumeName}
                                            loading={resumeLoading}
                                            onUpload={() => resumeRef.current?.click()}
                                            onDelete={async () => {
                                                await updateUser({ resume_url: null });
                                                set('resumeName', null);
                                                set('resumeUrl', null);
                                            }}
                                        />
                                    </div>
                                }
                                <input type="file" ref={resumeRef} className="hidden" accept=".pdf,.doc,.docx" onChange={handleResume} />
                            </SectionCard>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <SectionCard>
                            <SectionTitle icon={Trophy} accentColor={palette.brand}>Achievements</SectionTitle>
                            <AchievementsGrid earned={achievements} stats={displayStats} />
                        </SectionCard>
                    </div>
                </div>
            </div>
        </div>
    );
}
