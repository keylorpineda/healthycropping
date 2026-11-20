import AsyncStorage from '@react-native-async-storage/async-storage';

import i18n from '@/i18n';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  parsePreferences,
  usePreferencesStore,
} from '../preferences';

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

describe('persistence (#154)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES, hydrated: false });
    await i18n.changeLanguage('es');
  });

  async function readSavedPreferences(): Promise<unknown> {
    await Promise.resolve();
    const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
    expect(typeof raw).toBe('string');
    return JSON.parse(raw as string) as unknown;
  }

  it('persists all three preference values under PREFERENCES_KEY on each setter', async () => {
    usePreferencesStore.getState().setLanguage('en');
    expect(await readSavedPreferences()).toEqual({
      language: 'en',
      theme: 'system',
      hasCompletedOnboarding: false,
    });

    usePreferencesStore.getState().setTheme('dark');
    expect(await readSavedPreferences()).toEqual({
      language: 'en',
      theme: 'dark',
      hasCompletedOnboarding: false,
    });

    usePreferencesStore.getState().setHasCompletedOnboarding(true);
    expect(await readSavedPreferences()).toEqual({
      language: 'en',
      theme: 'dark',
      hasCompletedOnboarding: true,
    });
  });

  it('restores saved values, marks hydrated true, and syncs i18n on hydrate()', async () => {
    await AsyncStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ language: 'en', theme: 'light', hasCompletedOnboarding: true }),
    );

    await usePreferencesStore.getState().hydrate();

    const state = usePreferencesStore.getState();
    expect(state.language).toBe('en');
    expect(state.theme).toBe('light');
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(state.hydrated).toBe(true);
    expect(i18n.language).toBe('en');
  });

  it('keeps defaults and marks hydrated true when nothing is saved', async () => {
    await usePreferencesStore.getState().hydrate();

    const state = usePreferencesStore.getState();
    expect(state.language).toBe(DEFAULT_PREFERENCES.language);
    expect(state.theme).toBe(DEFAULT_PREFERENCES.theme);
    expect(state.hasCompletedOnboarding).toBe(DEFAULT_PREFERENCES.hasCompletedOnboarding);
    expect(state.hydrated).toBe(true);
    expect(i18n.language).toBe('es');
  });

  it('parsePreferences ignores unknown values, invalid JSON, null, and keeps valid partial keys', () => {
    expect(
      parsePreferences('{"language":"fr","theme":"blue","hasCompletedOnboarding":"yes"}'),
    ).toEqual({});
    expect(parsePreferences('{not-valid-json')).toEqual({});
    expect(parsePreferences(null)).toEqual({});
    expect(
      parsePreferences('{"language":"en","theme":"blue","hasCompletedOnboarding":true}'),
    ).toEqual({
      language: 'en',
      hasCompletedOnboarding: true,
    });
  });

  it('keeps defaults and marks hydrated true without throwing when AsyncStorage.getItem rejects', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));

    await expect(usePreferencesStore.getState().hydrate()).resolves.toBeUndefined();

    const state = usePreferencesStore.getState();
    expect(state.language).toBe(DEFAULT_PREFERENCES.language);
    expect(state.theme).toBe(DEFAULT_PREFERENCES.theme);
    expect(state.hasCompletedOnboarding).toBe(DEFAULT_PREFERENCES.hasCompletedOnboarding);
    expect(state.hydrated).toBe(true);
  });

  it('persists defaults when resetPreferences() is called', async () => {
    usePreferencesStore.getState().setLanguage('en');
    usePreferencesStore.getState().setTheme('dark');
    usePreferencesStore.getState().setHasCompletedOnboarding(true);
    await Promise.resolve();

    usePreferencesStore.getState().resetPreferences();

    expect(await readSavedPreferences()).toEqual(DEFAULT_PREFERENCES);
  });
});
