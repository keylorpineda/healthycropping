/**
 * Motion Tokens & Reduced-Motion Accessibility Helpers
 */

export const duration = {
  instant: 0,
  micro: 100,
  fast: 180,
  normal: 280,
  relaxed: 450,
} as const;

export const spring = {
  snappy: {
    mass: 0.8,
    damping: 15,
    stiffness: 200,
  },
  gentle: {
    mass: 1.0,
    damping: 20,
    stiffness: 120,
  },
  bouncy: {
    mass: 1.0,
    damping: 12,
    stiffness: 160,
  },
} as const;

export interface MotionTokens {
  duration: typeof duration;
  spring: typeof spring;
  getDuration: (key: keyof typeof duration, reduceMotion?: boolean) => number;
}

export const motion: MotionTokens = {
  duration,
  spring,
  getDuration: (key, reduceMotion = false) => {
    if (reduceMotion) {
      return duration.instant;
    }
    return duration[key];
  },
};
