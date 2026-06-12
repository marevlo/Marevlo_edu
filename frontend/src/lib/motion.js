/**
 * Shared framer-motion variants — one motion language for the whole app.
 *
 * Usage:
 *   <motion.div variants={staggerParent} initial="hidden" animate="visible">
 *       <motion.div variants={fadeUp}>…</motion.div>
 *   </motion.div>
 *
 * All transitions use transform + opacity only (compositor-friendly).
 * Reduced motion is handled globally by MotionConfig reducedMotion="user".
 */

// Snappy spring for interactive elements (dropdowns, modals, toggles)
export const springSnappy = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 };

// Soft spring for larger surfaces (panels, cards)
export const springSoft = { type: 'spring', stiffness: 260, damping: 28 };

// The house easing curve — matches .route-enter in index.css
export const easeOutExpo = [0.22, 1, 0.36, 1];

export const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOutExpo } },
};

export const fadeIn = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
};

export const scaleIn = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: springSnappy },
};

// Parent that staggers its fadeUp/scaleIn children
export const staggerParent = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

// Dropdown / popover: scales from its anchor corner (set transformOrigin on the element)
export const popover = {
    hidden: { opacity: 0, scale: 0.92, y: -6 },
    visible: { opacity: 1, scale: 1, y: 0, transition: springSnappy },
    exit: { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.14, ease: 'easeIn' } },
};

// Modal panel: rises with a spring; pair with backdrop fadeIn
export const modalPanel = {
    hidden: { opacity: 0, scale: 0.94, y: 24 },
    visible: { opacity: 1, scale: 1, y: 0, transition: springSoft },
    exit: { opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.16, ease: 'easeIn' } },
};

export const backdrop = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
};

// Mobile drawer: collapses height; children stagger in via fadeUp
export const drawer = {
    hidden: { opacity: 0, height: 0 },
    visible: {
        opacity: 1,
        height: 'auto',
        transition: { height: { duration: 0.28, ease: easeOutExpo }, opacity: { duration: 0.2 } },
    },
    exit: {
        opacity: 0,
        height: 0,
        transition: { height: { duration: 0.2, ease: 'easeIn' }, opacity: { duration: 0.12 } },
    },
};

// Inline error / notice: slides down into place without layout jank
export const notice = {
    hidden: { opacity: 0, y: -8, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: springSnappy },
    exit: { opacity: 0, y: -6, transition: { duration: 0.12, ease: 'easeIn' } },
};
