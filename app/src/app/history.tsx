import React from 'react';
import { useRouter } from 'expo-router';

import { HistoryScreen } from '@/screens';

export default function HistoryRoute(): React.JSX.Element {
  const router = useRouter();

  return (
    <HistoryScreen
      onBack={() => router.back()}
      onOpenScanDetail={(id) => router.push({ pathname: '/scan-detail', params: { id } })}
      onScanNew={(crop) => router.push({ pathname: '/scan', params: { crop } })}
    />
  );
}
