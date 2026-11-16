import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Card, Skeleton, type BadgeVariant } from '@/components/ui';
import { type Plot } from '@/db';
import {
  useWeatherRisk,
  type DiseaseRisk,
  type RiskLevel,
  type UseWeatherRiskOptions,
} from '@/services/weatherRisk';
import { useTheme } from '@/theme';

import { WeatherAttributionLink } from './WeatherAttributionLink';

export const LEVEL_BADGE: Record<RiskLevel, BadgeVariant> = {
  low: 'healthy',
  moderate: 'watch',
  high: 'actNow',
};

export interface WeatherRiskCardProps extends UseWeatherRiskOptions {
  plot: Plot;
  testID?: string;
}

function uniqueSources(risk: DiseaseRisk): string[] {
  const citations = risk.thresholds
    .map((threshold) => threshold.source?.citation)
    .filter((citation): citation is string => Boolean(citation));
  return [...new Set(citations)];
}

/** Disease risk estimated from the plot's weather, with its sources and Open-Meteo credit. */
export function WeatherRiskCard({
  plot,
  testID = 'weather-risk-card',
  ...options
}: WeatherRiskCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const located = plot.latitude !== null && plot.longitude !== null;
  const { query, refresh } = useWeatherRisk(located ? plot : null, options);

  const muted = [theme.typography.subhead, { color: theme.colors.textSecondary, lineHeight: 20 }];
  const caption = [theme.typography.caption, { color: theme.colors.textTertiary, lineHeight: 16 }];

  let body: React.ReactNode;
  if (!located) {
    body = (
      <Text style={muted} testID={`${testID}-no-location`}>
        {t('weather.errors.noLocation')}
      </Text>
    );
  } else if (query.isPending) {
    body = (
      <View testID={`${testID}-loading`} accessibilityLabel={t('weather.loading')}>
        <Skeleton height={14} style={styles.skeletonLine} />
        <Skeleton height={14} width="80%" style={styles.skeletonLine} />
      </View>
    );
  } else if (query.isError) {
    const reason = query.error.reason;
    const canRetry = reason === 'offline' || reason === 'unavailable' || reason === 'rateLimited';
    body = (
      <View testID={`${testID}-error-${reason}`}>
        <Text style={muted}>{t(`weather.errors.${reason}`)}</Text>
        {canRetry && (
          <View style={styles.action}>
            <Button
              title={t('common.retry')}
              onPress={refresh}
              variant="outline"
              size="sm"
              testID={`${testID}-retry-btn`}
            />
          </View>
        )}
      </View>
    );
  } else {
    const { risk, source, fetchedAt } = query.data;
    const provisional = risk.risks.some((disease) =>
      disease.thresholds.some((threshold) => threshold.basis === 'provisional'),
    );
    body = (
      <View testID={`${testID}-content`}>
        {risk.risks.map((disease) => {
          const name = t(`diseases.${disease.crop}.${disease.disease_class}`);
          const sources = uniqueSources(disease);
          return (
            <View
              key={disease.disease_class}
              style={[styles.disease, { borderBottomColor: theme.colors.borderSubtle }]}
              testID={`${testID}-${disease.disease_class}`}
            >
              <View style={styles.diseaseHeader}>
                <Text
                  style={[
                    theme.typography.bodyBold,
                    styles.diseaseName,
                    { color: theme.colors.textPrimary },
                  ]}
                >
                  {name}
                </Text>
                {disease.level ? (
                  <Badge
                    label={t(`weather.levels.${disease.level}`)}
                    variant={LEVEL_BADGE[disease.level]}
                    size="sm"
                    testID={`${testID}-${disease.disease_class}-level`}
                  />
                ) : (
                  <Badge label={t('weather.notEvaluated')} variant="neutral" size="sm" />
                )}
              </View>
              {disease.recent && disease.upcoming ? (
                <>
                  <Text style={muted}>
                    {t('weather.recentDays', {
                      count: disease.recent.favourable_days,
                      days: disease.recent.days,
                    })}
                  </Text>
                  <Text style={muted}>
                    {t('weather.upcomingDays', {
                      count: disease.upcoming.favourable_days,
                      days: disease.upcoming.days,
                    })}
                  </Text>
                </>
              ) : (
                <Text style={muted}>{t('weather.insufficientEvidence')}</Text>
              )}
              {sources.length > 0 && (
                <Text style={[caption, styles.sources]}>
                  {`${t('weather.sources')}: ${sources.join('; ')}`}
                </Text>
              )}
            </View>
          );
        })}

        {provisional && <Text style={[caption, styles.note]}>{t('weather.provisional')}</Text>}
        <Text style={[caption, styles.note]} testID={`${testID}-disclaimer`}>
          {t('weather.disclaimer')}
        </Text>
        {risk.stale && (
          <Text style={caption} testID={`${testID}-stale`}>
            {t('weather.stale')}
          </Text>
        )}
        <Text style={caption} testID={`${testID}-fetched-at`}>
          {t(source === 'cache' ? 'weather.savedAt' : 'weather.updatedAt', {
            date: new Date(fetchedAt).toLocaleString(),
          })}
        </Text>
        <WeatherAttributionLink attribution={risk.attribution} testID={`${testID}-attribution`} />
        <View style={styles.action}>
          <Button
            title={t('weather.refresh')}
            onPress={refresh}
            variant="outline"
            size="sm"
            testID={`${testID}-refresh-btn`}
          />
        </View>
      </View>
    );
  }

  return (
    <Card variant="outlined" style={styles.card} testID={testID}>
      <Text
        style={[theme.typography.headline, { color: theme.colors.textPrimary, marginBottom: 10 }]}
      >
        {t('weather.title')}
      </Text>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    marginBottom: 20,
  },
  skeletonLine: {
    marginBottom: 8,
  },
  action: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  disease: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  diseaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  diseaseName: {
    flex: 1,
    marginRight: 8,
  },
  sources: {
    marginTop: 4,
  },
  note: {
    marginTop: 12,
  },
});
