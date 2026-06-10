import { useEffect, useRef, useState } from 'react';

/**
 * One-shot scroll reveal. Returns [ref, visible] — `visible` flips to true the
 * first time the element enters the viewport and stays true (the observer
 * disconnects, so there's zero ongoing cost).
 *
 * Usage:
 *   const [ref, visible] = useScrollReveal();
 *   <div ref={ref} style={{ opacity: visible ? 1 : 0, ... }}>
 */
export function useScrollReveal(threshold = 0.12) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) {
                setVisible(true);
                obs.disconnect();
            }
        }, { threshold });
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);
    return [ref, visible];
}

/**
 * Returns [ref, active] — `active` is true only while the element is on-screen
 * AND the tab is visible. Use it to gate auto-cycling timers so they stop
 * re-rendering (and burning CPU) when scrolled out of view / tab hidden.
 */
export function useActiveInView(threshold = 0.15) {
    const ref = useRef(null);
    const [active, setActive] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let inView = false;
        const apply = () => setActive(inView && !document.hidden);
        const obs = new IntersectionObserver(([e]) => { inView = e.isIntersecting; apply(); }, { threshold });
        obs.observe(el);
        const onVis = () => apply();
        document.addEventListener('visibilitychange', onVis);
        return () => { obs.disconnect(); document.removeEventListener('visibilitychange', onVis); };
    }, [threshold]);
    return [ref, active];
}
