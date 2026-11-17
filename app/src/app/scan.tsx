import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AnalyzingOverlay } from '@/components/camera';
import { Toast } from '@/components/ui';
import { persistScanPhoto, plotsRepository, scansRepository } from '@/db';
import { getModelVersion, runInference } from '@/ml';
import { type InferencePrediction } from '@/ml/types';
import { CameraScreen, ResultScreen } from '@/screens';
import { captureScanLocation, plotContaining } from '@/services/scanLocation';
import { type SupportedCrop } from '@/version';

export default function ScanScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ crop?: SupportedCrop }>();
  const crop: SupportedCrop = params.crop || 'coffee';

  const [status, setStatus] = useState<'camera' | 'analyzing' | 'result'>('camera');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<InferencePrediction | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [errorVisible, setErrorVisible] = useState<boolean>(false);

  const handlePhotoCaptured = async (uri: string) => {
    setImageUri(uri);
    setStatus('analyzing');
    // Started alongside inference so a GPS fix does not delay the result (#77).
    const locating = captureScanLocation();

    try {
      const result = await runInference(uri, crop);
      setPrediction(result);
      setStatus('result');

      // Copy the photo out of the volatile camera cache before persisting the scan
      let persistentUri = uri;
      try {
        persistentUri = await persistScanPhoto(uri);
      } catch (error) {
        console.error('Failed to persist scan photo', error);
      }

      // Opt-in point; a scan inside exactly one boundary of this crop is filed under that plot.
      const location = await locating;
      const plot = location ? plotContaining(location, crop, plotsRepository.getAll()) : null;

      // Persist scan to SQLite offline database
      const scan = scansRepository.create({
        farm_id: plot?.farm_id ?? null,
        plot_id: plot?.id ?? null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        crop,
        predicted_class: result.predictedClass,
        severity: result.severity,
        confidence: result.confidence,
        threshold: result.threshold,
        is_low_confidence: result.isLowConfidence,
        model_version: getModelVersion(crop),
        local_photo_uri: persistentUri,
        explanation_json: JSON.stringify({
          probabilities: result.probabilities,
          inferenceTimeMs: result.inferenceTimeMs,
        }),
      });
      setScanId(scan.id);
    } catch (error) {
      console.error('On-device inference failed', error);
      setErrorVisible(true);
      setStatus('camera');
    }
  };

  const handleRetake = () => {
    setImageUri(null);
    setPrediction(null);
    setScanId(null);
    setStatus('camera');
  };

  const handleDone = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <Toast
        visible={errorVisible}
        message={t('camera.analysisFailed')}
        variant="error"
        durationMs={4000}
        onDismiss={() => setErrorVisible(false)}
        testID="scan-error-toast"
      />

      {status === 'camera' && (
        <CameraScreen
          crop={crop}
          onPhotoCaptured={handlePhotoCaptured}
          onClose={() => router.back()}
          testID="scan-camera-screen"
        />
      )}

      {status === 'analyzing' && (
        <AnalyzingOverlay imageUri={imageUri ?? undefined} testID="scan-analyzing-overlay" />
      )}

      {status === 'result' && prediction && imageUri && (
        <ResultScreen
          imageUri={imageUri}
          prediction={prediction}
          scanId={scanId}
          onRetake={handleRetake}
          onDone={handleDone}
          testID="scan-result-screen"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
