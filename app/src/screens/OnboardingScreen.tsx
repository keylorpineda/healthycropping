import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, Card, Chip, ProgressMeter } from '@/components/ui';
import { usePreferencesStore } from '@/stores/preferences';
import { useTheme } from '@/theme';

export interface OnboardingScreenProps {
  onComplete?: () => void;
  testID?: string;
}

export function OnboardingScreen({
  onComplete,
  testID = 'onboarding-screen',
}: OnboardingScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const setHasCompletedOnboarding = usePreferencesStore((state) => state.setHasCompletedOnboarding);

  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean>(false);

  const handleFinish = () => {
    setHasCompletedOnboarding(true);
    onComplete?.();
  };

  const handleNext = () => {
    if (activeSlide < 2) {
      setActiveSlide((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    setActiveSlide(2);
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      testID={testID}
    >
      {/* Top Header / Skip */}
      <View style={styles.topBar}>
        <Text style={[theme.typography.title3, { color: theme.colors.primary }]}>HealthyCrop</Text>
        {activeSlide < 2 ? (
          <Pressable
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.skip')}
            style={styles.skipButton}
            testID="onboarding-skip-btn"
          >
            <Text style={[theme.typography.callout, { color: theme.colors.textSecondary }]}>
              {t('onboarding.skip')}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.skipButton} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Slide 1: Offline Diagnostics */}
        {activeSlide === 0 ? (
          <View style={styles.slideContent} testID="onboarding-slide-0">
            <Badge
              label="100% Offline"
              variant="healthy"
              style={{ marginBottom: theme.spacing.md }}
            />
            <Text
              style={[
                theme.typography.title1,
                {
                  color: theme.colors.textPrimary,
                  textAlign: 'center',
                  marginBottom: theme.spacing.sm,
                },
              ]}
              testID="slide-1-title"
            >
              {t('onboarding.slide1Title')}
            </Text>
            <Text
              style={[
                theme.typography.body,
                {
                  color: theme.colors.textSecondary,
                  textAlign: 'center',
                  marginBottom: theme.spacing.xl,
                  lineHeight: 22,
                },
              ]}
            >
              {t('onboarding.slide1Description')}
            </Text>

            <View style={styles.cropRow}>
              <Chip label={t('crops.coffee')} crop="coffee" selected />
              <View style={{ width: theme.spacing.sm }} />
              <Chip label={t('crops.cacao')} crop="cacao" selected />
              <View style={{ width: theme.spacing.sm }} />
              <Chip label={t('crops.banana')} crop="banana" selected />
            </View>
          </View>
        ) : null}

        {/* Slide 2: Calibrated AI */}
        {activeSlide === 1 ? (
          <View style={styles.slideContent} testID="onboarding-slide-1">
            <Badge
              label="MobileNetV3 TFLite"
              variant="coffee"
              style={{ marginBottom: theme.spacing.md }}
            />
            <Text
              style={[
                theme.typography.title1,
                {
                  color: theme.colors.textPrimary,
                  textAlign: 'center',
                  marginBottom: theme.spacing.sm,
                },
              ]}
              testID="slide-2-title"
            >
              {t('onboarding.slide2Title')}
            </Text>
            <Text
              style={[
                theme.typography.body,
                {
                  color: theme.colors.textSecondary,
                  textAlign: 'center',
                  marginBottom: theme.spacing.xl,
                  lineHeight: 22,
                },
              ]}
            >
              {t('onboarding.slide2Description')}
            </Text>

            <Card variant="outlined" style={styles.demoCard}>
              <ProgressMeter value={0.88} label="Confianza calibrada" severityVariant="healthy" />
            </Card>
          </View>
        ) : null}

        {/* Slide 3: Agronomic Decision Support & Disclaimer */}
        {activeSlide === 2 ? (
          <View style={styles.slideContent} testID="onboarding-slide-2">
            <Badge
              label="Aviso Fitosanitario"
              variant="watch"
              style={{ marginBottom: theme.spacing.md }}
            />
            <Text
              style={[
                theme.typography.title1,
                {
                  color: theme.colors.textPrimary,
                  textAlign: 'center',
                  marginBottom: theme.spacing.sm,
                },
              ]}
              testID="slide-3-title"
            >
              {t('onboarding.slide3Title')}
            </Text>
            <Text
              style={[
                theme.typography.body,
                {
                  color: theme.colors.textSecondary,
                  textAlign: 'center',
                  marginBottom: theme.spacing.lg,
                  lineHeight: 22,
                },
              ]}
            >
              {t('onboarding.slide3Description')}
            </Text>

            <Card
              variant="elevated"
              style={[styles.disclaimerCard, { borderColor: theme.colors.status.watch.border }]}
              testID="onboarding-disclaimer-box"
            >
              <Text
                style={[
                  theme.typography.subhead,
                  {
                    color: theme.colors.textSecondary,
                    lineHeight: 20,
                  },
                ]}
              >
                {t('common.disclaimer')}
              </Text>
            </Card>

            <Pressable
              onPress={() => setDisclaimerAccepted((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: disclaimerAccepted }}
              accessibilityLabel={t('onboarding.acceptDisclaimer')}
              style={styles.checkboxRow}
              testID="onboarding-disclaimer-checkbox"
            >
              <View
                style={[
                  styles.checkboxSquare,
                  {
                    borderColor: disclaimerAccepted
                      ? theme.colors.primary
                      : theme.colors.borderStrong,
                    backgroundColor: disclaimerAccepted ? theme.colors.primary : 'transparent',
                  },
                ]}
              >
                {disclaimerAccepted ? (
                  <Text style={{ color: theme.colors.onPrimary, fontSize: 13, fontWeight: '700' }}>
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  theme.typography.callout,
                  { color: theme.colors.textPrimary, flex: 1, fontWeight: '600' },
                ]}
              >
                {t('onboarding.acceptDisclaimer')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Footer Controls */}
      <View
        style={[
          styles.footer,
          {
            borderTopColor: theme.colors.borderSubtle,
            borderTopWidth: 1,
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.lg,
          },
        ]}
      >
        {/* Indicators */}
        <View style={styles.indicatorRow} testID="onboarding-dots">
          {[0, 1, 2].map((idx) => (
            <View
              key={idx}
              testID={`dot-${idx}`}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    idx === activeSlide ? theme.colors.primary : theme.colors.borderStrong,
                  width: idx === activeSlide ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        {activeSlide < 2 ? (
          <Button
            title={t('onboarding.next')}
            onPress={handleNext}
            variant="primary"
            size="lg"
            fullWidth
            testID="onboarding-next-btn"
          />
        ) : (
          <Button
            title={t('onboarding.getStarted')}
            onPress={handleFinish}
            variant="primary"
            size="lg"
            fullWidth
            disabled={!disclaimerAccepted}
            testID="onboarding-start-btn"
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 56,
  },
  skipButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  slideContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  demoCard: {
    width: '100%',
    padding: 16,
  },
  disclaimerCard: {
    width: '100%',
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 6,
    width: '100%',
  },
  checkboxSquare: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  footer: {
    alignItems: 'center',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
});
