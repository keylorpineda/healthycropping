import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useWeatherAlerts, type UseWeatherAlertsOptions } from '@/services/weatherRisk';
import { useTheme } from '@/theme';

import { WeatherAttributionLink } from './WeatherAttributionLink';

export interface WeatherAlertBannerProps extends UseWeatherAlertsOptions {
  onOpenPlot?: ((plotId: string) => void) | undefined;
  testID?: string;
}

/** Home banner for the highest moderate or high weather risk across located plots. */
export function WeatherAlertBanner({
  onOpenPlot,
  testID = 'weather-alert-banner',
  ...options
}: WeatherAlertBannerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const theme = useTheme();
  const query = useWeatherAlerts(options);

  const alerts = query.data ?? [];
  const top = alerts[0];
  if (!top) {
    return null;
  }

  const status = top.level === 'high' ? theme.colors.status.actNow : theme.colors.status.watch;
  const message = t('weather.banner', {
    level: t(`weather.bannerLevels.${top.level}`),
    disease: t(`diseases.${top.disease.crop}.${top.disease.disease_class}`),
    plot: top.plot.name,
  });

  return (
    <View
      style={[styles.root, { backgroundColor: status.background, borderColor: status.border }]}
      testID={testID}
    >
      <Pressable
        onPress={onOpenPlot ? () => onOpenPlot(top.plot.id) : undefined}
        disabled={!onOpenPlot}
        accessibilityRole={onOpenPlot ? 'button' : 'text'}
        accessibilityLabel={message}
        accessibilityHint={onOpenPlot ? t('weather.bannerHint') : undefined}
        style={styles.target}
        testID={`${testID}-open`}
      >
        <Text style={[theme.typography.bodyBold, { color: status.text }]}>{message}</Text>
        {alerts.length > 1 && (
          <Text style={[theme.typography.caption, { color: status.text, marginTop: 2 }]}>
            {t('weather.bannerMore', { count: alerts.length - 1 })}
          </Text>
        )}
        <Text style={[theme.typography.caption, { color: status.text, marginTop: 2 }]}>
          {t('weather.bannerNote')}
        </Text>
      </Pressable>
      <WeatherAttributionLink
        attribution={top.result.risk.attribution}
        testID={`${testID}-attribution`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 16,
  },
  target: {
    minHeight: 48,
  },
});
