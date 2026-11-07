import React from 'react';
import { useRouter } from 'expo-router';

import { SignInScreen } from '@/screens';

export default function SignInRoute(): React.JSX.Element {
  const router = useRouter();

  return (
    <SignInScreen
      onSuccess={() => router.back()}
      onSkip={() => router.back()}
      onSwitchMode={() => router.replace('/sign-up')}
    />
  );
}
