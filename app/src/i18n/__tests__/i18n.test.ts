import i18n, { resolveDeviceLanguage } from '../index';
import es from '../locales/es.json';
import en from '../locales/en.json';

function getNestedKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return getNestedKeys(value as Record<string, unknown>, fullPath);
    }
    return [fullPath];
  });
}

describe('HealthyCrop i18n subsystem', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('defaults to Spanish (es) as primary market language', () => {
    expect(i18n.language).toBe('es');
    expect(i18n.t('common.appName')).toBe('HealthyCrop');
    expect(i18n.t('nav.home')).toBe('Inicio');
    expect(i18n.t('crops.coffee')).toBe('Café');
  });

  it('switches to English when requested', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
    expect(i18n.t('nav.home')).toBe('Home');
    expect(i18n.t('crops.coffee')).toBe('Coffee');
    expect(i18n.t('status.actNow')).toBe('Act Now');
  });

  it('has identical, symmetric translation key structure in es and en', () => {
    const esKeys = getNestedKeys(es).sort();
    const enKeys = getNestedKeys(en).sort();
    expect(esKeys).toEqual(enKeys);
    expect(esKeys.length).toBeGreaterThan(25);
  });

  it('contains mandatory agronomic non-replacement disclaimer in both locales', () => {
    const esDisclaimer = es.common.disclaimer.toLowerCase();
    const enDisclaimer = en.common.disclaimer.toLowerCase();

    expect(esDisclaimer).toContain('no reemplaza');
    expect(esDisclaimer).toContain('agrónomo');
    expect(enDisclaimer).toContain('does not replace');
    expect(enDisclaimer).toContain('agronomist');
  });

  it('resolves device language gracefully', () => {
    const lang = resolveDeviceLanguage();
    expect(['es', 'en']).toContain(lang);
  });
});
