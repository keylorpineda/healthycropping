import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  testID,
  style,
}: EmptyStateProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={[
        styles.container,
        {
          paddingVertical: theme.spacing.xxxl,
          paddingHorizontal: theme.spacing.xl,
        },
        style,
      ]}
    >
      {icon ? (
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: theme.colors.surfaceSubtle,
              marginBottom: theme.spacing.lg,
            },
          ]}
          testID={testID ? `${testID}-icon` : 'empty-state-icon'}
        >
          {icon}
        </View>
      ) : null}

      <Text
        style={[
          theme.typography.title3,
          {
            color: theme.colors.textPrimary,
            textAlign: 'center',
            marginBottom: theme.spacing.xs,
          },
        ]}
        testID={testID ? `${testID}-title` : 'empty-state-title'}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={[
            theme.typography.body,
            {
              color: theme.colors.textSecondary,
              textAlign: 'center',
              marginBottom: theme.spacing.xl,
            },
          ]}
          testID={testID ? `${testID}-description` : 'empty-state-description'}
        >
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <View style={styles.actionWrapper}>
          <Button
            title={actionLabel}
            onPress={onAction}
            variant="primary"
            size="md"
            testID={testID ? `${testID}-action` : 'empty-state-action'}
          />
        </View>
      ) : null}

      {secondaryActionLabel && onSecondaryAction ? (
        <View style={[styles.actionWrapper, { marginTop: theme.spacing.sm }]}>
          <Button
            title={secondaryActionLabel}
            onPress={onSecondaryAction}
            variant="ghost"
            size="md"
            testID={testID ? `${testID}-secondary-action` : 'empty-state-secondary-action'}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionWrapper: {
    minWidth: 160,
  },
});
