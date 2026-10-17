import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type BadgeVariant =
  'healthy' | 'watch' | 'actNow' | 'lowConfidence' | 'coffee' | 'cacao' | 'banana' | 'neutral';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Badge({
  label,
  variant = 'neutral',
  size = 'md',
  icon,
  testID,
  style,
  textStyle,
}: BadgeProps): React.JSX.Element {
  const theme = useTheme();

  // Variant color mapping from theme tokens
  let backgroundColor: string = theme.colors.surfaceSubtle;
  let borderColor: string = theme.colors.border;
  let textColor: string = theme.colors.textSecondary;

  switch (variant) {
    case 'healthy':
      backgroundColor = theme.colors.status.healthy.background;
      borderColor = theme.colors.status.healthy.border;
      textColor = theme.colors.status.healthy.text;
      break;
    case 'watch':
      backgroundColor = theme.colors.status.watch.background;
      borderColor = theme.colors.status.watch.border;
      textColor = theme.colors.status.watch.text;
      break;
    case 'actNow':
      backgroundColor = theme.colors.status.actNow.background;
      borderColor = theme.colors.status.actNow.border;
      textColor = theme.colors.status.actNow.text;
      break;
    case 'lowConfidence':
      backgroundColor = theme.colors.status.lowConfidence.background;
      borderColor = theme.colors.status.lowConfidence.border;
      textColor = theme.colors.status.lowConfidence.text;
      break;
    case 'coffee':
      backgroundColor = theme.colors.crops.coffee.accentSubtle;
      borderColor = theme.colors.crops.coffee.accent;
      textColor = theme.colors.crops.coffee.badgeText;
      break;
    case 'cacao':
      backgroundColor = theme.colors.crops.cacao.accentSubtle;
      borderColor = theme.colors.crops.cacao.accent;
      textColor = theme.colors.crops.cacao.badgeText;
      break;
    case 'banana':
      backgroundColor = theme.colors.crops.banana.accentSubtle;
      borderColor = theme.colors.crops.banana.accent;
      textColor = theme.colors.crops.banana.badgeText;
      break;
    case 'neutral':
      backgroundColor = theme.colors.surfaceSubtle;
      borderColor = theme.colors.border;
      textColor = theme.colors.textSecondary;
      break;
  }

  const isSmall = size === 'sm';
  const paddingHorizontal = isSmall ? theme.spacing.sm : theme.spacing.md;
  const paddingVertical = isSmall ? 2 : theme.spacing.xxs;
  const fontStyle = isSmall ? theme.typography.caption : theme.typography.subhead;

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          backgroundColor,
          borderColor,
          borderWidth: 1,
          borderRadius: theme.radii.full,
          paddingHorizontal,
          paddingVertical,
        },
        style,
      ]}
    >
      <View style={styles.contentRow}>
        {icon ? <View style={{ marginRight: theme.spacing.xxs }}>{icon}</View> : null}
        <Text style={[fontStyle, { color: textColor, fontWeight: '600' }, textStyle]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
