import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, Button } from '@/components/ui';
import { type ExplanationCitation } from '@/services/explanations';
import { useTheme } from '@/theme';

export interface CitationBadgeProps {
  citation: ExplanationCitation;
  testID?: string;
}

function pages(citation: ExplanationCitation): string {
  return citation.first_page === citation.last_page
    ? `${citation.first_page}`
    : `${citation.first_page}-${citation.last_page}`;
}

/** Short `publisher · section` badge; tapping it shows the full reference and a link. */
export function CitationBadge({
  citation,
  testID = 'citation-badge',
}: CitationBadgeProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const reference = t('explanation.citation', {
    source: citation.source_title,
    section: citation.section,
    publisher: citation.publisher,
    year: citation.year,
    pages: pages(citation),
  });

  const openSource = () => {
    Linking.openURL(citation.url).catch((error: unknown) => {
      console.error('Failed to open source', error);
    });
  };

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={reference}
        accessibilityHint={t('explanation.citationHint')}
        accessibilityState={{ expanded }}
        style={styles.target}
        testID={testID}
      >
        <Badge label={`${citation.publisher} · ${citation.section}`} variant="neutral" size="sm" />
      </Pressable>
      {expanded && (
        <View
          style={[
            styles.details,
            { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.borderSubtle },
          ]}
          testID={`${testID}-details`}
        >
          <Text
            style={[
              theme.typography.caption,
              styles.reference,
              { color: theme.colors.textSecondary },
            ]}
          >
            {reference}
          </Text>
          <View style={styles.open}>
            <Button
              title={t('explanation.openSource')}
              onPress={openSource}
              variant="ghost"
              size="sm"
              testID={`${testID}-open-btn`}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginRight: 8,
    marginBottom: 8,
  },
  // The small badge is the visual; the touch area meets the 48 dp minimum.
  target: {
    minHeight: 48,
    justifyContent: 'center',
  },
  details: {
    marginTop: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  reference: {
    lineHeight: 16,
  },
  open: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
});
