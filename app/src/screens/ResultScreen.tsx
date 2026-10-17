import React, { useEffect } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, ProgressMeter } from '@/components/ui';
import { type InferencePrediction } from '@/ml/types';
import { useReducedMotion, useTheme } from '@/theme';

export interface ResultScreenProps {
  imageUri: string;
  prediction: InferencePrediction;
  onRetake: () => void;
  onDone: () => void;
  testID?: string;
}

export function ResultScreen({
  imageUri,
  prediction,
  onRetake,
  onDone,
  testID = 'result-screen',
}: ResultScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const badgeScale = useSharedValue(reduceMotion ? 1 : 0.7);

  const { crop, predictedClass, confidence, isLowConfidence, severity, probabilities } = prediction;

  useEffect(() => {
    // Trigger tactile haptics matching diagnosis
    if (isLowConfidence) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (severity === 'healthy') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (severity === 'actNow') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    if (!reduceMotion) {
      badgeScale.value = withSpring(1.0, theme.motion.spring.bouncy);
    }
  }, [isLowConfidence, severity, reduceMotion, badgeScale, theme]);

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  // Disease name translation key
  const diseaseKey = `diseases.${crop}.${predictedClass}`;
  const translatedDiseaseName = t(diseaseKey);
  const displayTitle =
    translatedDiseaseName !== diseaseKey ? translatedDiseaseName : predictedClass;

  // Resolve status label
  let statusLabel = t('result.statusWatch');
  if (severity === 'healthy') statusLabel = t('result.statusHealthy');
  if (severity === 'actNow') statusLabel = t('result.statusActNow');

  // Resolve advice text
  let adviceText = t('result.adviceWatch');
  if (severity === 'healthy') adviceText = t('result.adviceHealthy');
  if (severity === 'actNow') adviceText = t('result.adviceActNow');

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          <Text
            style={[theme.typography.title2, { color: theme.colors.textPrimary }]}
            testID="result-header-title"
          >
            {t('result.title')}
          </Text>
          <View style={styles.headerBadges}>
            <Badge label={t(`crops.${crop}`)} variant={crop} size="sm" />
            <View style={{ width: 8 }} />
            <Badge label={t('home.offlinePill')} variant="neutral" size="sm" />
          </View>
        </View>

        {/* Hero Photo Container */}
        <View style={[styles.heroCard, theme.elevation.md]}>
          <Image
            source={{ uri: imageUri }}
            style={styles.heroImage}
            resizeMode="cover"
            testID="result-hero-image"
          />
        </View>

        {/* Low Confidence State */}
        {isLowConfidence ? (
          <Card
            variant="elevated"
            style={[
              styles.lowConfidenceCard,
              { borderColor: theme.colors.status.watch.main, borderLeftWidth: 5 },
            ]}
            testID="result-low-confidence-card"
          >
            <View style={styles.badgeWrapper}>
              <Animated.View style={animatedBadgeStyle}>
                <Badge
                  label={t('status.watch')}
                  variant="watch"
                  size="md"
                  testID="result-low-conf-badge"
                />
              </Animated.View>
            </View>

            <Text
              style={[
                theme.typography.title2,
                { color: theme.colors.textPrimary, marginTop: 8, marginBottom: 8 },
              ]}
              testID="result-low-confidence-title"
            >
              {t('result.lowConfidenceTitle')}
            </Text>

            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.textSecondary, marginBottom: 20, lineHeight: 22 },
              ]}
            >
              {t('result.lowConfidenceAdvice')}
            </Text>

            <Button
              title={t('result.retake')}
              onPress={onRetake}
              variant="primary"
              size="lg"
              fullWidth
              testID="result-low-confidence-retake-btn"
            />
          </Card>
        ) : (
          /* Accepted Confident Prediction */
          <Card
            variant="elevated"
            style={[
              styles.predictionCard,
              {
                borderColor:
                  severity === 'healthy'
                    ? theme.colors.status.healthy.border
                    : severity === 'actNow'
                      ? theme.colors.status.actNow.border
                      : theme.colors.status.watch.border,
                borderLeftWidth: 5,
                borderLeftColor:
                  severity === 'healthy'
                    ? theme.colors.status.healthy.main
                    : severity === 'actNow'
                      ? theme.colors.status.actNow.main
                      : theme.colors.status.watch.main,
              },
            ]}
            testID="result-prediction-card"
          >
            <View style={styles.badgeWrapper}>
              <Animated.View style={animatedBadgeStyle}>
                <Badge
                  label={statusLabel}
                  variant={severity}
                  size="md"
                  testID="result-status-badge"
                />
              </Animated.View>
            </View>

            <Text
              style={[
                theme.typography.title1,
                { color: theme.colors.textPrimary, marginTop: 8, marginBottom: 16 },
              ]}
              testID="result-disease-name"
            >
              {displayTitle}
            </Text>

            {/* Confidence Progress Meter */}
            <View style={{ marginBottom: 20 }}>
              <ProgressMeter
                value={confidence}
                label={t('result.confidence')}
                severityVariant={severity}
                size="md"
                testID="result-confidence-meter"
              />
            </View>

            {/* Next Steps Card */}
            <View
              style={[
                styles.adviceBox,
                {
                  backgroundColor: theme.colors.surfaceSubtle,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.headline,
                  { color: theme.colors.textPrimary, marginBottom: 6 },
                ]}
              >
                {t('result.nextSteps')}
              </Text>
              <Text
                style={[
                  theme.typography.subhead,
                  { color: theme.colors.textSecondary, lineHeight: 20 },
                ]}
                testID="result-advice-text"
              >
                {adviceText}
              </Text>
            </View>

            {/* Probabilities Breakdown */}
            <View style={styles.probabilitiesSection}>
              <Text
                style={[
                  theme.typography.bodyBold,
                  { color: theme.colors.textPrimary, marginBottom: 8 },
                ]}
              >
                {t('result.probabilities')}
              </Text>
              {Object.entries(probabilities).map(([key, prob]) => {
                const classKey = `diseases.${crop}.${key}`;
                const classLabel = t(classKey);
                return (
                  <View key={key} style={styles.probRow}>
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.textSecondary, flex: 1 },
                      ]}
                      numberOfLines={1}
                    >
                      {classLabel !== classKey ? classLabel : key}
                    </Text>
                    <Text
                      style={[
                        theme.typography.caption,
                        {
                          color:
                            key === predictedClass
                              ? theme.colors.primary
                              : theme.colors.textTertiary,
                          fontWeight: key === predictedClass ? '700' : '400',
                          marginLeft: 8,
                        },
                      ]}
                    >
                      {`${Math.round(prob * 100)}%`}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Button
                  title={t('result.retake')}
                  onPress={onRetake}
                  variant="outline"
                  size="md"
                  fullWidth
                  testID="result-retake-btn"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Button
                  title={t('result.done')}
                  onPress={onDone}
                  variant="primary"
                  size="md"
                  fullWidth
                  testID="result-done-btn"
                />
              </View>
            </View>
          </Card>
        )}

        {/* Mandatory Agronomic Disclaimer */}
        <View
          style={[
            styles.disclaimerContainer,
            {
              backgroundColor: theme.colors.surfaceSubtle,
              borderColor: theme.colors.borderSubtle,
            },
          ]}
          testID="result-disclaimer-box"
        >
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textTertiary, textAlign: 'center', lineHeight: 18 },
            ]}
          >
            {t('common.disclaimer')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroCard: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#000000',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  lowConfidenceCard: {
    padding: 20,
    marginBottom: 20,
  },
  predictionCard: {
    padding: 20,
    marginBottom: 20,
  },
  badgeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adviceBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  probabilitiesSection: {
    marginBottom: 20,
  },
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  disclaimerContainer: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
});
