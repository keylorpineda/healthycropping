import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { HomeScreen, OnboardingScreen } from '@/screens';
import { usePreferencesStore } from '@/stores/preferences';

export default function IndexScreen(): React.JSX.Element {
  const router = useRouter();
  const hasCompletedOnboarding = usePreferencesStore((state) => state.hasCompletedOnboarding);
  const hydrated = usePreferencesStore((state) => state.hydrated);

  // Wait for saved preferences so a returning farmer never sees onboarding flash (#154).
  if (!hydrated) {
    return <View style={{ flex: 1 }} />;
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingScreen />;
  }

  return (
    <HomeScreen
      onOpenSettings={() => router.push('/settings')}
      onScan={(crop) => router.push({ pathname: '/scan', params: { crop } })}
      onOpenHistory={() => router.push('/history')}
      onOpenFarms={() => router.push('/farms')}
      onOpenScanDetail={(id) => router.push({ pathname: '/scan-detail', params: { id } })}
      onOpenPlot={(id) => router.push({ pathname: '/plot-detail', params: { id } })}
    />
  );
}
