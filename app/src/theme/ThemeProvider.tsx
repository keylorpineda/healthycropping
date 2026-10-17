import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferencesStore } from '@/stores/preferences';
import { darkTheme, lightTheme, type Theme } from './theme';

const ThemeContext = createContext<Theme>(lightTheme);

export interface ThemeProviderProps {
  children: React.ReactNode;
  forcedTheme?: 'light' | 'dark';
}

export function ThemeProvider({ children, forcedTheme }: ThemeProviderProps): React.JSX.Element {
  const systemColorScheme = useColorScheme();
  const themePreference = usePreferencesStore((state) => state.theme);

  const activeTheme = useMemo<Theme>(() => {
    if (forcedTheme) {
      return forcedTheme === 'dark' ? darkTheme : lightTheme;
    }
    if (themePreference === 'dark') {
      return darkTheme;
    }
    if (themePreference === 'light') {
      return lightTheme;
    }
    return systemColorScheme === 'dark' ? darkTheme : lightTheme;
  }, [forcedTheme, themePreference, systemColorScheme]);

  return <ThemeContext.Provider value={activeTheme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
