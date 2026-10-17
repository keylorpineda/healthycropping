import React from 'react';
import { useRouter } from 'expo-router';

import { OnboardingScreen } from '@/screens';

export default function OnboardingRoute(): React.JSX.Element {
  const router = useRouter();

  return <OnboardingScreen onComplete={() => router.replace('/')} />;
}
