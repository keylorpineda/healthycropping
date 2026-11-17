import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Card, Skeleton, type BadgeVariant } from '@/components/ui';
import { type Plot } from '@/db';
import {
  plotGeometryKey,
  usePlotNdvi,
  type NdviMonth,
  type UsePlotNdviOptions,
} from '@/services/ndvi';
import { useTheme } from '@/theme';

import { barFraction, summarizeVigor, type VigorLevel, type VigorTrend } from './vigor';

const LEVEL_BADGE: Record<VigorLevel, BadgeVariant> = {
  low: 'actNow',
  moderate: 'watch',
  high: 'healthy',
};

const TREND_BADGE: Record<VigorTrend, BadgeVariant> = {
  below: 'actNow',
  normal: 'neutral',
  above: 'healthy',
};

const CHART_HEIGHT = 120;

export interface NdviCardProps extends UsePlotNdviOptions {
  plot: Plot;
  testID?: string;
}

function monthLabel(month: string, locale: string, style: 'short' | 'long'): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (number ?? 1) - 1, 15));
  return date.toLocaleDateString(locale, {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** 12-month Sentinel-2 NDVI bars with a canopy vigor badge for Plot Detail (#82). */
export function NdviCard({
  plot,
  testID = 'ndvi-card',
  ...options
}: NdviCardProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const located = plotGeometryKey(plot) !== null;
  const { query, refresh } = usePlotNdvi(located ? plot : null, options);
  const locale = i18n.language === 'en' ? 'en-US' : 'es-CR';

  const muted = [theme.typography.subhead, { color: theme.colors.textSecondary, lineHeight: 20 }];
  const caption = [theme.typography.caption, { color: theme.colors.textTertiary, lineHeight: 16 }];

  const describeMonth = (month: NdviMonth): string => {
    const name = monthLabel(month.month, locale, 'long');
    if (month.status === 'ok' && month.ndvi !== null) {
      return t('ndvi.monthValue', { month: name, value: month.ndvi.toFixed(2) });
    }
    return t(`ndvi.monthStatus.${month.status === 'no_data' ? 'noData' : 'cloudy'}`, {
      month: name,
    });
  };

  let body: React.ReactNode;
  if (!located) {
    body = (
      <Text style={muted} testID={`${testID}-no-location`}>
        {t('ndvi.errors.noLocation')}
      </Text>
    );
  } else if (query.isPending) {
    body = (
      <View testID={`${testID}-loading`} accessibilityLabel={t('ndvi.loading')}>
        <Skeleton height={CHART_HEIGHT} />
      </View>
    );
  } else if (query.isError) {
    const reason = query.error.reason;
    const canRetry = reason === 'offline' || reason === 'unavailable' || reason === 'rateLimited';
    body = (
      <View testID={`${testID}-error-${reason}`}>
        <Text style={muted}>{t(`ndvi.errors.${reason}`)}</Text>
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
    const { ndvi, source, fetchedAt } = query.data;
    const summary = summarizeVigor(ndvi.months);
    const chartLabel = t('ndvi.chartLabel', {
      months: ndvi.months.map(describeMonth).join('. '),
    });
    body = (
      <View testID={`${testID}-content`}>
        {summary ? (
          <View style={styles.summary} testID={`${testID}-summary`}>
            <Text style={[theme.typography.bodyBold, { color: theme.colors.textPrimary }]}>
              {t('ndvi.latest', {
                month: monthLabel(summary.latest.month, locale, 'long'),
                value: summary.latest.ndvi.toFixed(2),
              })}
            </Text>
            <View style={styles.badges}>
              <Badge
                label={t(`ndvi.levels.${summary.level}`)}
                variant={LEVEL_BADGE[summary.level]}
                size="sm"
                testID={`${testID}-level`}
              />
              {summary.trend && (
                <Badge
                  label={t(`ndvi.trends.${summary.trend}`)}
                  variant={TREND_BADGE[summary.trend]}
                  size="sm"
                  testID={`${testID}-trend`}
                />
              )}
            </View>
          </View>
        ) : (
          <Text style={muted} testID={`${testID}-no-clear-month`}>
            {t('ndvi.noClearMonth')}
          </Text>
        )}

        {/* Static bars (no animation), so reduced-motion settings need no special case. */}
        <View
          style={[styles.chart, { borderBottomColor: theme.colors.border }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={chartLabel}
          testID={`${testID}-chart`}
        >
          {ndvi.months.map((month) => {
            const clear = month.status === 'ok' && month.ndvi !== null;
            return (
              <View key={month.month} style={styles.column} testID={`${testID}-bar-${month.month}`}>
                <View style={styles.barArea}>
                  {clear ? (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${barFraction(month.ndvi ?? 0) * 100}%`,
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.bar,
                        styles.emptyBar,
                        { borderColor: theme.colors.borderStrong },
                      ]}
                    />
                  )}
                </View>
                <Text
                  style={[caption, styles.monthText]}
                  importantForAccessibility="no"
                  accessible={false}
                >
                  {monthLabel(month.month, locale, 'short').slice(0, 1).toUpperCase()}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[caption, styles.note]}>{t('ndvi.legend')}</Text>
        <Text style={[caption, styles.note]} testID={`${testID}-disclaimer`}>
          {t('ndvi.disclaimer')}
        </Text>
        <Text style={caption} testID={`${testID}-fetched-at`}>
          {t(source === 'cache' ? 'weather.savedAt' : 'weather.updatedAt', {
            date: new Date(fetchedAt).toLocaleString(locale),
          })}
        </Text>
        <Text style={caption} testID={`${testID}-attribution`}>
          {ndvi.attribution}
        </Text>
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
        {t('ndvi.title')}
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
  action: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  summary: {
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    paddingBottom: 4,
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  barArea: {
    height: CHART_HEIGHT,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '70%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  emptyBar: {
    height: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  monthText: {
    marginTop: 4,
  },
  note: {
    marginTop: 8,
  },
});
