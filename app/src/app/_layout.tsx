import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/i18n';
import { startSyncTriggers } from '@/services/syncTriggers';
import { useAuthStore } from '@/stores/auth';
import { usePreferencesStore } from '@/stores/preferences';
import { ThemeProvider, useReducedMotion, useTheme } from '@/theme';

function NavigationStack(): React.JSX.Element {
  const { isDark } = useTheme();
  const reduceMotion = useReducedMotion();

  // Restore language, theme and onboarding state saved on this device (#154).
  useEffect(() => {
    void usePreferencesStore.getState().hydrate();
  }, []);
  // Restore the persisted Firebase session; signed-out users keep full offline access.
  useEffect(() => useAuthStore.getState().start(), []);
  // Push pending local changes on sign-in, reconnect and foreground.
  useEffect(() => startSyncTriggers(), []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? 'none' : 'fade',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'HealthyCropping' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="onboarding" options={{ title: 'Onboarding' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="scan-detail" options={{ title: 'Scan Detail' }} />
        <Stack.Screen name="farms" options={{ title: 'Farms' }} />
        <Stack.Screen name="plot-detail" options={{ title: 'Plot Detail' }} />
        <Stack.Screen name="plot-map" options={{ title: 'Plot Map' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign In' }} />
        <Stack.Screen name="sign-up" options={{ title: 'Sign Up' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
      </Stack>
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
