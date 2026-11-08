import { APP_PACKAGE_ID, APP_VERSION, DEFAULT_LOCALE, SUPPORTED_CROPS } from '../version';

describe('HealthyCropping Phase 0 smoke suite', () => {
  it('exposes the canonical Android package identifier and defaults', () => {
    expect(APP_PACKAGE_ID).toBe('com.keylorpineda.healthycropping');
    expect(APP_VERSION).toBe('0.5.0');
    expect(DEFAULT_LOCALE).toBe('es');
    expect(SUPPORTED_CROPS).toEqual(['coffee', 'cacao', 'banana']);
  });
});
