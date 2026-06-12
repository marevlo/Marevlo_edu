import React from 'react';
import { motion as Motion } from 'framer-motion';
import { useScrollReveal } from '../hooks/useScrollReveal';

/**
 * Masked word-by-word headline reveal. Each word sits inside an
 * overflow-hidden inline-block and slides up into place with a stagger —
 * the text appears to rise out of an invisible mask line.
 *
 * segments: array of { text, style?, className? } — style lets a segment keep
 *           a gradient-text treatment — or { br: true } for a line break.
 * mode:     'inView' (default) reveals on scroll into view; 'mount' plays
 *           immediately, for above-the-fold headlines.
 *
 * Gotcha that shapes this implementation: before reveal the words are fully
 * clipped by their masks, and IntersectionObserver measures visibility AFTER
 * ancestor clipping — so per-word whileInView would never fire (0% visible
 * forever). Instead one observer watches the unclipped wrapper span and all
 * words animate from its visibility.
 *
 * The mask uses pb/-mb of 0.12em so descenders (y, g, p) aren't clipped.
 */
export default function RevealText({ segments, delay = 0, stagger = 0.05, duration = 0.6, mode = 'inView' }) {
    const [ref, inView] = useScrollReveal(0.3);
    const visible = mode === 'mount' || inView;

    let wordIndex = 0;
    return (
        <span ref={ref}>
            {segments.map((seg, s) => {
                if (seg.br) return <br key={`br-${s}`} />;
                return seg.text.split(' ').filter(Boolean).map((word, w) => {
                    const i = wordIndex++;
                    return (
                        <React.Fragment key={`${s}-${w}`}>
                            <span className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]">
                                <Motion.span
                                    className={`inline-block will-change-transform ${seg.className || ''}`}
                                    style={seg.style}
                                    initial={{ y: '115%' }}
                                    animate={visible ? { y: 0 } : { y: '115%' }}
                                    transition={{ duration, ease: [0.22, 1, 0.36, 1], delay: delay + i * stagger }}
                                >
                                    {word}
                                </Motion.span>
                            </span>
                            {' '}
                        </React.Fragment>
                    );
                });
            })}
        </span>
    );
}
