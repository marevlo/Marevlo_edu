import React, { useRef } from 'react';

/**
 * Pointer-tracking 3D tilt wrapper (the landing-page hero's signature move,
 * reusable). Pure CSS perspective — no WebGL, no library.
 *
 * Performance notes:
 * - The bounding rect is cached on mouse-enter; reading it per-move forces a
 *   sync layout reflow.
 * - Transform is written imperatively inside requestAnimationFrame, so
 *   mousemove never re-renders the React subtree.
 * - Respects prefers-reduced-motion; inert on touch devices (no mousemove).
 *
 * Keep `max` small (3–6°) — subtle reads premium, large reads gimmick.
 */
export default function TiltCard({ children, max = 4, className = '', style, ...rest }) {
    const ref = useRef(null);
    const rectRef = useRef(null);
    const rafRef = useRef(0);

    const onEnter = (e) => { rectRef.current = e.currentTarget.getBoundingClientRect(); };

    const onMove = (e) => {
        const el = ref.current;
        const r = rectRef.current;
        if (!el || !r) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
        });
    };

    const onLeave = () => {
        cancelAnimationFrame(rafRef.current);
        const el = ref.current;
        if (el) el.style.transform = '';
    };

    return (
        <div
            ref={ref}
            className={className}
            style={{ transition: 'transform 0.18s ease-out', willChange: 'transform', ...style }}
            onMouseEnter={onEnter}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            {...rest}
        >
            {children}
        </div>
    );
}
