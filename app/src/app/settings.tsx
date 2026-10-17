import React from 'react';
import { useRouter } from 'expo-router';

import { SettingsScreen } from '@/screens';

export default function SettingsRoute(): React.JSX.Element {
  const router = useRouter();

  return (
    <SettingsScreen
      onBack={() => router.back()}
      onReplayOnboarding={() => router.push('/onboarding')}
    />
  );
}
