import { Variants, Transition } from 'framer-motion';

/**
 * Bauhaus Animation Config
 *
 * Mechanical precision — no springs, no bounce.
 * Ease-out for entries, ease-in for exits.
 */

// ============================================================
// Transitions
// ============================================================

export const transitions = {
  fast: { duration: 0.1, ease: 'easeOut' } as Transition,
  normal: { duration: 0.2, ease: 'easeOut' } as Transition,
  slow: { duration: 0.3, ease: 'easeOut' } as Transition,
};

// ============================================================
// Common Variants
// ============================================================

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitions.normal },
  exit: { opacity: 0, transition: transitions.fast },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0, transition: transitions.normal },
  exit: { opacity: 0, y: -30, transition: transitions.fast },
};

export const slideIn: Variants = {
  initial: { opacity: 0, x: -30 },
  animate: { opacity: 1, x: 0, transition: transitions.normal },
  exit: { opacity: 0, x: 30, transition: transitions.fast },
};

/** Stamp effect — replaces popIn/scale. Scale 1.3→1.0 snap. */
export const stampIn: Variants = {
  initial: { opacity: 0, scale: 1.3 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
  exit: { opacity: 0, scale: 1.3, transition: transitions.fast },
};

// ============================================================
// Component-Specific Variants
// ============================================================

/** PlayerShape draws on via scale from 0 with snap */
export const playerCardVariants: Variants = {
  initial: { opacity: 0, scale: 0 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    scale: 0,
    transition: transitions.fast,
  },
};

/** Bid placed — stamp effect */
export const bidPlacedVariants: Variants = {
  initial: { opacity: 0, scale: 1.3 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
};

/** Score change — vertical slide (old up+out, new up+in) */
export const scoreChangeVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.normal,
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: transitions.fast,
  },
};

/** Toast — slide in from bottom, no bounce */
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 50 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.normal,
  },
  exit: {
    opacity: 0,
    y: 20,
    transition: transitions.fast,
  },
};

/** Connection pulse — keep pulse for connected, flat for others */
export const connectionPulseVariants: Variants = {
  connected: {
    opacity: 1,
    scale: 1,
  },
  connecting: {
    opacity: [0.5, 1],
    transition: {
      repeat: Infinity,
      duration: 1,
      ease: 'easeInOut',
    },
  },
  disconnected: {
    opacity: 1,
    scale: 1,
  },
  reconnecting: {
    opacity: [0.5, 1],
    transition: {
      repeat: Infinity,
      duration: 1,
      ease: 'easeInOut',
    },
  },
};

/** Dialog — slide up from bottom with deceleration */
export const dialogContentVariants: Variants = {
  initial: { opacity: 0, y: 100 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.slow,
  },
  exit: {
    opacity: 0,
    y: 100,
    transition: transitions.normal,
  },
};

/** Container list animation — staggered children */
export const containerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

/** Item animation for staggered lists */
export const itemVariants: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: transitions.normal,
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: transitions.fast,
  },
};

// ============================================================
// New Bauhaus Variants
// ============================================================

/** Phase transition — horizontal line wipe */
export const phaseTransitionVariants: Variants = {
  initial: { scaleX: 0 },
  animate: {
    scaleX: 1,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

/** Trick claimed — 90° rotation snap on PlayerShape */
export const trickClaimedVariants: Variants = {
  initial: { rotate: 0 },
  animate: {
    rotate: 90,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
};

/** Score count up — number slides in from below, staggered per player */
export const scoreCountUpVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.normal,
  },
};
