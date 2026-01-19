import { Variants, Transition } from 'framer-motion';

// ============================================================
// Transitions
// ============================================================

export const transitions = {
  fast: { duration: 0.15, ease: 'easeOut' } as Transition,
  normal: { duration: 0.25, ease: 'easeOut' } as Transition,
  slow: { duration: 0.4, ease: 'easeOut' } as Transition,
  spring: { type: 'spring', stiffness: 400, damping: 30 } as Transition,
  springBouncy: { type: 'spring', stiffness: 500, damping: 20 } as Transition,
};

// ============================================================
// Common Variants
// ============================================================

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const slideIn: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

export const scale: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: transitions.springBouncy,
  },
  exit: { opacity: 0, scale: 0.8 },
};

// ============================================================
// Component-Specific Variants
// ============================================================

// Player card joining animation
export const playerCardVariants: Variants = {
  initial: { opacity: 0, scale: 0.8, y: 20 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    y: -20,
    transition: transitions.fast,
  },
};

// Bid placed animation
export const bidPlacedVariants: Variants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 25,
    },
  },
};

// Score change animation
export const scoreChangeVariants: Variants = {
  initial: { opacity: 0, scale: 1.2 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
    },
  },
};

// Positive score animation
export const positiveScoreVariants: Variants = {
  initial: { opacity: 0, y: 20, color: '#16a34a' },
  animate: {
    opacity: 1,
    y: 0,
    color: '#16a34a',
    transition: transitions.spring,
  },
};

// Negative score animation
export const negativeScoreVariants: Variants = {
  initial: { opacity: 0, y: 20, color: '#dc2626' },
  animate: {
    opacity: 1,
    y: 0,
    color: '#dc2626',
    transition: transitions.spring,
  },
};

// Toast animation
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 50, scale: 0.9 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.9,
    transition: transitions.fast,
  },
};

// Connection pulse animation
export const connectionPulseVariants: Variants = {
  connected: {
    opacity: 1,
    scale: 1,
  },
  connecting: {
    opacity: [0.5, 1],
    scale: [0.95, 1.05],
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
    scale: [0.95, 1.05],
    transition: {
      repeat: Infinity,
      duration: 1,
      ease: 'easeInOut',
    },
  },
};

// Dialog animations
export const dialogContentVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: -20 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.normal,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -20,
    transition: transitions.fast,
  },
};

// Container list animation
export const containerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

// Item animation for staggered lists
export const itemVariants: Variants = {
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
