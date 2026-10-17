import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Badge } from '@/components/ui';
import { useReducedMotion, useTheme } from '@/theme';

export interface AnalyzingOverlayProps {
  imageUri?: string | undefined;
  testID?: string | undefined;
}

export function AnalyzingOverlay({
  imageUri,
  testID = 'analyzing-overlay',
}: AnalyzingOverlayProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const scanTranslateY = useSharedValue(-100);

  useEffect(() => {
    if (reduceMotion) {
      scanTranslateY.value = 0;
    } else {
      scanTranslateY.value = withRepeat(withTiming(100, { duration: 1200 }), -1, true);
    }
  }, [reduceMotion, scanTranslateY]);

  const animatedScanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanTranslateY.value }],
  }));

  return (
    <View
      style={styles.overlay}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <View style={styles.card}>
        {/* Photo Box with Scan Line */}
        <View style={[styles.photoBox, { borderColor: theme.colors.primary }]}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="cover"
              testID={`${testID}-image`}
            />
          ) : (
            <View
              style={[styles.imagePlaceholder, { backgroundColor: theme.colors.surfaceSubtle }]}
            />
          )}

          {/* Animated Sweep Line */}
          <Animated.View
            style={[
              styles.scanLine,
              { backgroundColor: theme.colors.primaryLight },
              animatedScanLineStyle,
            ]}
            testID={`${testID}-scan-line`}
          />
        </View>

        {/* Text and Badges */}
        <Text
          style={[
            theme.typography.title2,
            { color: theme.colors.textPrimary, marginTop: 24, textAlign: 'center' },
          ]}
          testID={`${testID}-title`}
        >
          {t('analyzing.title')}
        </Text>
        <Text
          style={[
            theme.typography.subhead,
            { color: theme.colors.textSecondary, marginTop: 6, textAlign: 'center' },
          ]}
        >
          {t('analyzing.subtitle')}
        </Text>

        <View style={{ marginTop: 16 }}>
          <Badge label={t('analyzing.offline')} variant="healthy" size="md" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  photoBox: {
    width: 200,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  scanLine: {
    position: 'absolute',
    width: '100%',
    height: 3,
    shadowColor: '#2D7A4F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
});
