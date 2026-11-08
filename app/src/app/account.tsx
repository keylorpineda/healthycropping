import React from 'react';
import { useRouter } from 'expo-router';

import { AccountScreen } from '@/screens';

export default function AccountRoute(): React.JSX.Element {
  const router = useRouter();

  return <AccountScreen onBack={() => router.back()} onSignedOut={() => router.back()} />;
}
