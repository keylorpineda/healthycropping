import React from 'react';
import { useRouter } from 'expo-router';

import { HomeScreen, OnboardingScreen } from '@/screens';
import { usePreferencesStore } from '@/stores/preferences';

export default function IndexScreen(): React.JSX.Element {
  const router = useRouter();
  const hasCompletedOnboarding = usePreferencesStore((state) => state.hasCompletedOnboarding);

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
    />
  );
}
