import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Card, Skeleton } from '@/components/ui';
import { type ExplanationKey } from '@/db';
import {
  useExplanation,
  type ExplanationCitation,
  type UseExplanationOptions,
} from '@/services/explanations';
import { useTheme } from '@/theme';

export interface ExplanationCardProps extends UseExplanationOptions {
  /** Diagnosis to explain; nothing is rendered when null (healthy or low confidence). */
  explanationKey: ExplanationKey | null;
  testID?: string;
}

function pages(citation: ExplanationCitation): string {
  return citation.first_page === citation.last_page
    ? `${citation.first_page}`
    : `${citation.first_page}-${citation.last_page}`;
}

/** Grounded AI explanation with next steps and cited sources, loaded online or from SQLite. */
export function ExplanationCard({
  explanationKey,
  testID = 'explanation-card',
  ...options
}: ExplanationCardProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const theme = useTheme();
  const query = useExplanation(explanationKey, options);

  if (!explanationKey) {
    return null;
  }

  const muted = [theme.typography.subhead, { color: theme.colors.textSecondary, lineHeight: 20 }];

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <View testID={`${testID}-loading`} accessibilityLabel={t('explanation.loading')}>
        <Skeleton height={14} style={styles.skeletonLine} />
        <Skeleton height={14} width="92%" style={styles.skeletonLine} />
        <Skeleton height={14} width="70%" style={styles.skeletonLine} />
      </View>
    );
  } else if (query.isError) {
    const reason = query.error.reason;
    const canRetry = reason === 'offline' || reason === 'unavailable' || reason === 'rateLimited';
    body = (
      <View testID={`${testID}-error-${reason}`}>
        <Text style={muted}>{t(`explanation.errors.${reason}`)}</Text>
        {canRetry && (
          <View style={styles.retry}>
            <Button
              title={t('common.retry')}
              onPress={() => void query.refetch()}
              variant="outline"
              size="sm"
              testID={`${testID}-retry-btn`}
            />
          </View>
        )}
      </View>
    );
  } else {
    const { explanation, source } = query.data;
    if (!explanation.covered) {
      body = (
        <Text style={muted} testID={`${testID}-declined`}>
          {t(`explanation.declined.${explanation.declined_reason ?? 'not_covered'}`)}
        </Text>
      );
    } else {
      body = (
        <View testID={`${testID}-content`}>
          <Text
            style={[theme.typography.body, { color: theme.colors.textPrimary, lineHeight: 22 }]}
            testID={`${testID}-summary`}
          >
            {explanation.summary}
          </Text>

          {explanation.next_steps.length > 0 && (
            <View style={styles.section}>
              <Text
                style={[
                  theme.typography.headline,
                  { color: theme.colors.textPrimary, marginBottom: 6 },
                ]}
              >
                {t('explanation.nextSteps')}
              </Text>
              {explanation.next_steps.map((step, index) => (
                <Text
                  key={`${index}-${step}`}
                  style={[muted, styles.step]}
                  testID={`${testID}-step-${index}`}
                >
                  {`${index + 1}. ${step}`}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text
              style={[
                theme.typography.headline,
                { color: theme.colors.textPrimary, marginBottom: 6 },
              ]}
            >
              {t('explanation.sources')}
            </Text>
            {explanation.citations.map((citation, index) => (
              <Text
                key={`${citation.url}-${citation.section}`}
                style={[
                  theme.typography.caption,
                  styles.citation,
                  { color: theme.colors.textSecondary },
                ]}
                testID={`${testID}-citation-${index}`}
              >
                {t('explanation.citation', {
                  source: citation.source_title,
                  section: citation.section,
                  publisher: citation.publisher,
                  year: citation.year,
                  pages: pages(citation),
                })}
              </Text>
            ))}
          </View>

          <Text
            style={[theme.typography.caption, styles.note, { color: theme.colors.textTertiary }]}
            testID={`${testID}-disclaimer`}
          >
            {t('explanation.disclaimer')}
          </Text>
          {source === 'cache' && (
            <Text
              style={[theme.typography.caption, { color: theme.colors.textTertiary }]}
              testID={`${testID}-offline-copy`}
            >
              {t('explanation.savedOffline')}
            </Text>
          )}
        </View>
      );
    }
  }

  return (
    <Card variant="outlined" style={styles.card} testID={testID}>
      <Text
        style={[theme.typography.headline, { color: theme.colors.textPrimary, marginBottom: 10 }]}
      >
        {t('explanation.title')}
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
  retry: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  section: {
    marginTop: 16,
  },
  step: {
    marginBottom: 4,
  },
  citation: {
    marginBottom: 4,
    lineHeight: 16,
  },
  note: {
    marginTop: 16,
    marginBottom: 4,
    lineHeight: 16,
  },
});
