import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScanDetailScreen } from '@/screens';

export default function ScanDetailRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const scanId = params.id || '';

  return (
    <ScanDetailScreen scanId={scanId} onBack={() => router.back()} onDelete={() => router.back()} />
  );
}
