import { create } from 'zustand';

import i18n, { type SupportedLanguage } from '@/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface PreferencesState {
  language: SupportedLanguage;
  theme: ThemePreference;
  hasCompletedOnboarding: boolean;
  setLanguage: (language: SupportedLanguage) => void;
  setTheme: (theme: ThemePreference) => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  resetPreferences: () => void;
}

export const DEFAULT_PREFERENCES = {
  language: 'es' as SupportedLanguage,
  theme: 'system' as ThemePreference,
  hasCompletedOnboarding: false,
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULT_PREFERENCES,

  setLanguage: (language) => {
    void i18n.changeLanguage(language);
    set({ language });
  },

  setTheme: (theme) => {
    set({ theme });
  },

  setHasCompletedOnboarding: (hasCompletedOnboarding) => {
    set({ hasCompletedOnboarding });
  },

  resetPreferences: () => {
    void i18n.changeLanguage(DEFAULT_PREFERENCES.language);
    set(DEFAULT_PREFERENCES);
  },
}));
