import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PlotDetailScreen } from '@/screens';

export default function PlotDetailRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  return <PlotDetailScreen plotId={params.id || ''} onBack={() => router.back()} />;
}
