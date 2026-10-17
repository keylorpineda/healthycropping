import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import es from './locales/es.json';
import en from './locales/en.json';

export const defaultNS = 'translation';
export const resources = {
  es: { translation: es },
  en: { translation: en },
} as const;

export type SupportedLanguage = 'es' | 'en';

/**
 * Resolve the device's preferred language code, defaulting to Spanish ('es').
 */
export function resolveDeviceLanguage(): SupportedLanguage {
  try {
    const locales = Localization.getLocales();
    const primary = locales[0]?.languageCode;
    if (primary === 'en') {
      return 'en';
    }
  } catch {
    // In test or non-native environments, default to Spanish
  }
  return 'es';
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'es',
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });
}

export default i18n;
