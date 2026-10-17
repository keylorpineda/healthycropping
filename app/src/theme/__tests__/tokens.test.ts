import {
  darkColors,
  darkElevation,
  darkTheme,
  duration,
  fontSizes,
  fontWeights,
  lightColors,
  lightElevation,
  lightTheme,
  lineHeights,
  motion,
  palette,
  radii,
  spacing,
  spring,
  typography,
} from '../index';

describe('Design tokens integrity', () => {
  describe('Color palettes', () => {
    it('defines non-empty hex values in base palette', () => {
      Object.entries(palette).forEach(([key, color]) => {
        expect(typeof color).toBe('string');
        if (key !== 'transparent') {
          expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
      });
    });

    it('defines complete light and dark theme color sets with matching structure', () => {
      const lightKeys = Object.keys(lightColors).sort();
      const darkKeys = Object.keys(darkColors).sort();
      expect(lightKeys).toEqual(darkKeys);

      expect(lightColors.primary).toBeDefined();
      expect(darkColors.primary).toBeDefined();
      expect(lightColors.status.healthy.main).toBeDefined();
      expect(darkColors.status.healthy.main).toBeDefined();
      expect(lightColors.crops.coffee.accent).toBeDefined();
      expect(darkColors.crops.coffee.accent).toBeDefined();
    });
  });

  describe('Typography scale', () => {
    it('defines positive line heights larger than font sizes', () => {
      (Object.keys(fontSizes) as (keyof typeof fontSizes)[]).forEach((key) => {
        expect(fontSizes[key]).toBeGreaterThan(0);
        expect(lineHeights[key]).toBeGreaterThanOrEqual(fontSizes[key]);
      });
    });

    it('provides standardized font weights', () => {
      expect(fontWeights.regular).toBe('400');
      expect(fontWeights.medium).toBe('500');
      expect(fontWeights.semiBold).toBe('600');
      expect(fontWeights.bold).toBe('700');
    });

    it('exports all typography style presets', () => {
      expect(typography.display.fontSize).toBe(32);
      expect(typography.title1.fontSize).toBe(28);
      expect(typography.title2.fontSize).toBe(22);
      expect(typography.title3.fontSize).toBe(18);
      expect(typography.headline.fontSize).toBe(16);
      expect(typography.body.fontSize).toBe(15);
      expect(typography.caption.fontSize).toBe(11);
    });
  });

  describe('Spacing and Radii scales', () => {
    it('defines non-negative spacing tokens in increasing order', () => {
      const values = Object.values(spacing);
      values.forEach((val) => expect(val).toBeGreaterThanOrEqual(0));
      expect(spacing.none).toBe(0);
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(12);
      expect(spacing.lg).toBe(16);
      expect(spacing.xxl).toBe(24);
      expect(spacing.colossal).toBe(64);
    });

    it('defines radii tokens from none to full', () => {
      expect(radii.none).toBe(0);
      expect(radii.sm).toBe(6);
      expect(radii.md).toBe(10);
      expect(radii.lg).toBe(16);
      expect(radii.xl).toBe(24);
      expect(radii.full).toBe(9999);
    });
  });

  describe('Elevation and Shadow tokens', () => {
    it('provides distinct elevation levels for light and dark modes', () => {
      expect(lightElevation.none.elevation).toBe(0);
      expect(lightElevation.sm.elevation).toBe(1);
      expect(lightElevation.md.elevation).toBe(3);
      expect(lightElevation.lg.elevation).toBe(6);
      expect(lightElevation.xl.elevation).toBe(12);

      expect(darkElevation.sm.elevation).toBe(1);
      expect(darkElevation.lg.elevation).toBe(6);
    });
  });

  describe('Motion tokens', () => {
    it('defines durations from instant to relaxed', () => {
      expect(duration.instant).toBe(0);
      expect(duration.micro).toBe(100);
      expect(duration.fast).toBe(180);
      expect(duration.normal).toBe(280);
      expect(duration.relaxed).toBe(450);
    });

    it('returns duration.instant when reduceMotion is requested', () => {
      expect(motion.getDuration('normal', true)).toBe(0);
      expect(motion.getDuration('normal', false)).toBe(280);
    });

    it('defines valid spring damping and stiffness presets', () => {
      expect(spring.snappy.stiffness).toBe(200);
      expect(spring.gentle.damping).toBe(20);
      expect(spring.bouncy.damping).toBe(12);
    });
  });

  describe('Theme objects', () => {
    it('creates lightTheme and darkTheme with matching structure', () => {
      expect(lightTheme.name).toBe('light');
      expect(lightTheme.isDark).toBe(false);
      expect(darkTheme.name).toBe('dark');
      expect(darkTheme.isDark).toBe(true);

      expect(lightTheme.colors).toEqual(lightColors);
      expect(darkTheme.colors).toEqual(darkColors);
      expect(lightTheme.spacing).toEqual(spacing);
      expect(darkTheme.spacing).toEqual(spacing);
    });
  });
});
