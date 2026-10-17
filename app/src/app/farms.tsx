import React from 'react';
import { useRouter } from 'expo-router';

import { FarmsScreen } from '@/screens';

export default function FarmsRoute(): React.JSX.Element {
  const router = useRouter();

  return <FarmsScreen onBack={() => router.back()} />;
}
