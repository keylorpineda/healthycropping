import { APP_PACKAGE_ID, APP_VERSION, DEFAULT_LOCALE, SUPPORTED_CROPS } from '../version';

describe('HealthyCrop Phase 0 smoke suite', () => {
  it('exposes the canonical Android package identifier and defaults', () => {
    expect(APP_PACKAGE_ID).toBe('com.keylorpineda.healthycrop');
    expect(APP_VERSION).toBe('0.2.0');
    expect(DEFAULT_LOCALE).toBe('es');
    expect(SUPPORTED_CROPS).toEqual(['coffee', 'cacao', 'banana']);
  });
});
