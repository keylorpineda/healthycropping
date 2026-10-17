import i18n from '@/i18n';
import { usePreferencesStore } from '../preferences';

describe('Preferences store (Zustand)', () => {
  beforeEach(() => {
    usePreferencesStore.getState().resetPreferences();
  });

  it('initializes with default preferences (Spanish, system theme, onboarding false)', () => {
    const state = usePreferencesStore.getState();
    expect(state.language).toBe('es');
    expect(state.theme).toBe('system');
    expect(state.hasCompletedOnboarding).toBe(false);
  });

  it('updates language and syncs with i18n instance', () => {
    usePreferencesStore.getState().setLanguage('en');
    expect(usePreferencesStore.getState().language).toBe('en');
    expect(i18n.language).toBe('en');

    usePreferencesStore.getState().setLanguage('es');
    expect(usePreferencesStore.getState().language).toBe('es');
    expect(i18n.language).toBe('es');
  });

  it('updates theme preference between light, dark, and system', () => {
    usePreferencesStore.getState().setTheme('dark');
    expect(usePreferencesStore.getState().theme).toBe('dark');

    usePreferencesStore.getState().setTheme('light');
    expect(usePreferencesStore.getState().theme).toBe('light');

    usePreferencesStore.getState().setTheme('system');
    expect(usePreferencesStore.getState().theme).toBe('system');
  });

  it('updates onboarding completion flag', () => {
    expect(usePreferencesStore.getState().hasCompletedOnboarding).toBe(false);
    usePreferencesStore.getState().setHasCompletedOnboarding(true);
    expect(usePreferencesStore.getState().hasCompletedOnboarding).toBe(true);
  });

  it('resets preferences to default state', () => {
    usePreferencesStore.getState().setLanguage('en');
    usePreferencesStore.getState().setTheme('dark');
    usePreferencesStore.getState().setHasCompletedOnboarding(true);

    usePreferencesStore.getState().resetPreferences();

    const state = usePreferencesStore.getState();
    expect(state.language).toBe('es');
    expect(state.theme).toBe('system');
    expect(state.hasCompletedOnboarding).toBe(false);
    expect(i18n.language).toBe('es');
  });
});
