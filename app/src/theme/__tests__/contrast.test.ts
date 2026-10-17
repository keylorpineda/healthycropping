import { darkColors, lightColors } from '../colors';

/**
 * Convert a hex color string (#RRGGBB) to linear relative luminance according to WCAG 2.1 specs.
 * Formula: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number): number => {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const rLin = toLinear(r);
  const gLin = toLinear(g);
  const bLin = toLinear(b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculate WCAG contrast ratio between two hex colors.
 * Returns a value in range [1.0, 21.0].
 */
export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = getRelativeLuminance(foregroundHex);
  const l2 = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('WCAG AA Contrast Compliance', () => {
  const WCAG_AA_BODY_MIN = 4.5;
  const WCAG_AA_LARGE_TEXT_MIN = 3.0;

  describe('Light Theme Contrast', () => {
    it('primary brand and UI accents satisfy WCAG graphical component contrast (>= 3.0:1)', () => {
      const primaryRatio = getContrastRatio(lightColors.primary, lightColors.surface);
      const actNowRatio = getContrastRatio(lightColors.status.actNow.main, lightColors.surface);
      expect(primaryRatio).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT_MIN);
      expect(actNowRatio).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT_MIN);
    });

    it('primary text on background satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio(lightColors.textPrimary, lightColors.background);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('primary text on surface satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio(lightColors.textPrimary, lightColors.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('secondary text on surface satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio(lightColors.textSecondary, lightColors.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('onPrimary text on primary satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio(lightColors.onPrimary, lightColors.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('status badge texts satisfy WCAG AA on their status backgrounds', () => {
      const healthyRatio = getContrastRatio(
        lightColors.status.healthy.text,
        lightColors.status.healthy.background,
      );
      const watchRatio = getContrastRatio(
        lightColors.status.watch.text,
        lightColors.status.watch.background,
      );
      const actNowRatio = getContrastRatio(
        lightColors.status.actNow.text,
        lightColors.status.actNow.background,
      );
      const lowConfRatio = getContrastRatio(
        lightColors.status.lowConfidence.text,
        lightColors.status.lowConfidence.background,
      );

      expect(healthyRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(watchRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(actNowRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(lowConfRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('crop badge texts satisfy WCAG AA on crop subtle backgrounds', () => {
      const coffeeRatio = getContrastRatio(
        lightColors.crops.coffee.badgeText,
        lightColors.crops.coffee.accentSubtle,
      );
      const cacaoRatio = getContrastRatio(
        lightColors.crops.cacao.badgeText,
        lightColors.crops.cacao.accentSubtle,
      );
      const bananaRatio = getContrastRatio(
        lightColors.crops.banana.badgeText,
        lightColors.crops.banana.accentSubtle,
      );

      expect(coffeeRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(cacaoRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(bananaRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });
  });

  describe('Dark Theme Contrast', () => {
    it('primary text on background satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio(darkColors.textPrimary, darkColors.background);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('primary text on surface satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio(darkColors.textPrimary, darkColors.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('secondary text on surface satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio(darkColors.textSecondary, darkColors.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('onPrimary text on primary satisfies WCAG AA (>= 4.5:1)', () => {
      const ratio = getContrastRatio(darkColors.onPrimary, darkColors.primary);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('status badge texts satisfy WCAG AA on their dark status backgrounds', () => {
      const healthyRatio = getContrastRatio(
        darkColors.status.healthy.text,
        darkColors.status.healthy.background,
      );
      const watchRatio = getContrastRatio(
        darkColors.status.watch.text,
        darkColors.status.watch.background,
      );
      const actNowRatio = getContrastRatio(
        darkColors.status.actNow.text,
        darkColors.status.actNow.background,
      );
      const lowConfRatio = getContrastRatio(
        darkColors.status.lowConfidence.text,
        darkColors.status.lowConfidence.background,
      );

      expect(healthyRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(watchRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(actNowRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(lowConfRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });

    it('crop badge texts satisfy WCAG AA on dark crop subtle backgrounds', () => {
      const coffeeRatio = getContrastRatio(
        darkColors.crops.coffee.badgeText,
        darkColors.crops.coffee.accentSubtle,
      );
      const cacaoRatio = getContrastRatio(
        darkColors.crops.cacao.badgeText,
        darkColors.crops.cacao.accentSubtle,
      );
      const bananaRatio = getContrastRatio(
        darkColors.crops.banana.badgeText,
        darkColors.crops.banana.accentSubtle,
      );

      expect(coffeeRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(cacaoRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
      expect(bananaRatio).toBeGreaterThanOrEqual(WCAG_AA_BODY_MIN);
    });
  });
});
