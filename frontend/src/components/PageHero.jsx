import React from 'react';
import { motion as Motion } from 'framer-motion';
import { staggerParent, fadeUp } from '../lib/motion';

/**
 * PageHero — the shared full-width hero used by Courses, Projects, and
 * Problems. One source of truth for sizing (minHeight, paddings, type
 * scale) so the three catalog pages always render at exactly the same
 * height. Visual changes go here, never in the pages.
 */
export default function PageHero({
    badgeIcon: BadgeIcon,
    badgeLabel,
    title,
    subtitle,
    chips = [],   // [{ icon: Component, label }]
}) {
    return (
        <div
            className="relative overflow-hidden border-b bg-card dark:bg-background border-black/[0.06] dark:border-white/[0.06]"
            style={{ minHeight: '340px' }}
        >
            {/* Subtle grid backdrop (matches the landing hero — calm, no glow) */}
            <div
                className="absolute inset-0 pointer-events-none"
                aria-hidden="true"
                style={{
                    backgroundImage: 'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
                    backgroundSize: '44px 44px',
                    maskImage: 'radial-gradient(circle at center, black 20%, transparent 90%)',
                }}
            />

            <Motion.div
                variants={staggerParent}
                initial="hidden"
                animate="visible"
                className="relative z-10 text-center px-6 pt-12 pb-10 max-w-4xl mx-auto"
            >
                <Motion.div variants={fadeUp}>
                    <div className="page-hero-badge">
                        {BadgeIcon && <BadgeIcon size={10} style={{ color: '#3fa9c9' }} />}
                        {badgeLabel}
                    </div>
                </Motion.div>

                <Motion.h1 variants={fadeUp} className="text-5xl md:text-[3.75rem] font-black tracking-tight leading-none courses-hero-title-grad mb-3">
                    {title}
                </Motion.h1>

                <Motion.p variants={fadeUp} className="page-hero-sub">
                    {subtitle}
                </Motion.p>

                <Motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {chips.map(({ icon: ChipIcon, label }) => (
                        <div key={label} className="page-hero-chip">
                            {ChipIcon && <span><ChipIcon size={13} /></span>}
                            {label}
                        </div>
                    ))}
                </Motion.div>
            </Motion.div>
        </div>
    );
}
