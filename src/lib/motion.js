/**
 * Shared Framer Motion spring physics & GPU-only animation presets.
 *
 * Every variant strictly animates `transform` (x, y, scale) and `opacity` so
 * animations run on the compositor thread at 60/120fps without triggering
 * layout recalculation or CLS.
 */

export const SPRING_SMOOTH = {
  type: 'spring',
  stiffness: 340,
  damping: 30,
  mass: 0.9,
};

export const SPRING_SNAPPY = {
  type: 'spring',
  stiffness: 460,
  damping: 28,
  mass: 0.75,
};

export const SPRING_BOUNCY = {
  type: 'spring',
  stiffness: 420,
  damping: 20,
  mass: 0.8,
};

export const screenVariants = {
  initial: { opacity: 0, y: 14, scale: 0.99 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING_SMOOTH,
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.99,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  },
};

export const cardContainerVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.02,
    },
  },
};

export const cardItemVariants = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING_SMOOTH,
  },
};

export const popBadgeVariants = {
  initial: { opacity: 0, scale: 0.72, y: 6 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SPRING_BOUNCY,
  },
  exit: {
    opacity: 0,
    scale: 0.85,
    y: -4,
    transition: { duration: 0.14 },
  },
};

export const BUTTON_TAP = { scale: 0.965 };
export const BUTTON_HOVER = { y: -1.5, scale: 1.015 };
export const CARD_HOVER = { y: -2 };
export const CARD_TAP = { scale: 0.985 };
