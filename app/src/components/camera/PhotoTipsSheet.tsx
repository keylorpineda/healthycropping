import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Sheet } from '@/components/ui';
import { useTheme } from '@/theme';
import { type SupportedCrop } from '@/version';

export interface PhotoTipsSheetProps {
  visible: boolean;
  crop: SupportedCrop;
  onClose: () => void;
  testID?: string;
}

export function PhotoTipsSheet({
  visible,
  crop,
  onClose,
  testID = 'photo-tips-sheet',
}: PhotoTipsSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const title = t(`photoTips.${crop}.title`);
  const tip1 = t(`photoTips.${crop}.tip1`);
  const tip2 = t(`photoTips.${crop}.tip2`);
  const tip3 = t(`photoTips.${crop}.tip3`);

  const tips = [
    { num: '1', text: tip1 },
    { num: '2', text: tip2 },
    { num: '3', text: tip3 },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <View style={styles.container}>
        {tips.map((item) => (
          <View key={item.num} style={styles.tipRow}>
            <View
              style={[
                styles.numberCircle,
                {
                  backgroundColor: theme.colors.crops[crop].accentSubtle,
                  borderColor: theme.colors.crops[crop].accent,
                },
              ]}
            >
              <Text
                style={[
                  theme.typography.callout,
                  { color: theme.colors.crops[crop].badgeText, fontWeight: '700' },
                ]}
              >
                {item.num}
              </Text>
            </View>
            <Text
              style={[
                theme.typography.subhead,
                { color: theme.colors.textPrimary, flex: 1, lineHeight: 20 },
              ]}
              testID={`${testID}-tip-${item.num}`}
            >
              {item.text}
            </Text>
          </View>
        ))}

        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            title={t('camera.tipsUnderstood')}
            onPress={onClose}
            variant="primary"
            size="lg"
            fullWidth
            testID={`${testID}-confirm-btn`}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  numberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
});
