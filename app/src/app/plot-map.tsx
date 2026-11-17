import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PlotMapScreen } from '@/screens';

export default function PlotMapRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  return <PlotMapScreen plotId={params.id || ''} onDone={() => router.back()} />;
}
