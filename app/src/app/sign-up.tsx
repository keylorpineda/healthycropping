import React from 'react';
import { useRouter } from 'expo-router';

import { SignUpScreen } from '@/screens';

export default function SignUpRoute(): React.JSX.Element {
  const router = useRouter();

  return (
    <SignUpScreen
      onSuccess={() => router.back()}
      onSkip={() => router.back()}
      onSwitchMode={() => router.replace('/sign-in')}
    />
  );
}
