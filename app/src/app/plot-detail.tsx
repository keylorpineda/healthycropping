import React, { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { PlotDetailScreen } from '@/screens';

export default function PlotDetailRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const plotId = params.id || '';
  // Remount on focus so a boundary saved in the map editor shows up on return.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((count) => count + 1), []));

  return (
    <PlotDetailScreen
      key={visit}
      plotId={plotId}
      onBack={() => router.back()}
      onOpenMap={() => router.push({ pathname: '/plot-map', params: { id: plotId } })}
    />
  );
}
