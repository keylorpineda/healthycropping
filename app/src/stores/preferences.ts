import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import i18n, { type SupportedLanguage } from '@/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

/** AsyncStorage key holding the persisted preferences as JSON (#154). */
export const PREFERENCES_KEY = 'healthycropping.preferences';

export interface PreferencesState {
  language: SupportedLanguage;
  theme: ThemePreference;
  hasCompletedOnboarding: boolean;
  /** True once `hydrate` has restored the saved values (or found none). */
  hydrated: boolean;
  setLanguage: (language: SupportedLanguage) => void;
  setTheme: (theme: ThemePreference) => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  resetPreferences: () => void;
  /** Restores the saved preferences; safe to call more than once. */
  hydrate: () => Promise<void>;
}

export const DEFAULT_PREFERENCES = {
  language: 'es' as SupportedLanguage,
  theme: 'system' as ThemePreference,
  hasCompletedOnboarding: false,
};

type Persisted = typeof DEFAULT_PREFERENCES;

const LANGUAGES: readonly SupportedLanguage[] = ['es', 'en'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Keeps only known values, so an old or corrupted entry falls back to the defaults. */
export function parsePreferences(text: string | null): Partial<Persisted> {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return {};
    const record = value as Record<string, unknown>;
    const result: Partial<Persisted> = {};
    if (LANGUAGES.includes(record.language as SupportedLanguage)) {
      result.language = record.language as SupportedLanguage;
    }
    if (THEMES.includes(record.theme as ThemePreference)) {
      result.theme = record.theme as ThemePreference;
    }
    if (typeof record.hasCompletedOnboarding === 'boolean') {
      result.hasCompletedOnboarding = record.hasCompletedOnboarding;
    }
    return result;
  } catch {
    return {};
  }
}

function persist(state: Persisted): void {
  // A failed write only means the choice is asked again next launch.
  AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(state)).catch(() => undefined);
}

export const usePreferencesStore = create<PreferencesState>((set, get) => {
  const save = (changes: Partial<Persisted>) => {
    set(changes);
    const { language, theme, hasCompletedOnboarding } = get();
    persist({ language, theme, hasCompletedOnboarding });
  };

  return {
    ...DEFAULT_PREFERENCES,
    hydrated: false,

    setLanguage: (language) => {
      void i18n.changeLanguage(language);
      save({ language });
    },

    setTheme: (theme) => {
      save({ theme });
    },

    setHasCompletedOnboarding: (hasCompletedOnboarding) => {
      save({ hasCompletedOnboarding });
    },

    resetPreferences: () => {
      void i18n.changeLanguage(DEFAULT_PREFERENCES.language);
      save(DEFAULT_PREFERENCES);
    },

    hydrate: async () => {
      let saved: Partial<Persisted> = {};
      try {
        saved = parsePreferences(await AsyncStorage.getItem(PREFERENCES_KEY));
      } catch {
        saved = {};
      }
      if (saved.language && saved.language !== i18n.language) {
        void i18n.changeLanguage(saved.language);
      }
      set({ ...saved, hydrated: true });
    },
  };
});
