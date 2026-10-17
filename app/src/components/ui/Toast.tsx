import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion, useTheme } from '@/theme';

export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastProps {
  visible: boolean;
  message: string;
  title?: string;
  variant?: ToastVariant;
  durationMs?: number;
  onDismiss?: () => void;
  action?: ToastAction;
  testID?: string;
}

export function Toast({
  visible,
  message,
  title,
  variant = 'info',
  durationMs = 4000,
  onDismiss,
  action,
  testID,
}: ToastProps): React.JSX.Element | null {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-20);

  // Trigger haptics and animations on visibility change
  useEffect(() => {
    if (visible) {
      if (variant === 'error') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (variant === 'warning') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (variant === 'success') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (reduceMotion) {
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withTiming(1, { duration: theme.motion.duration.fast });
        translateY.value = withSpring(0, theme.motion.spring.snappy);
      }

      // Auto-dismiss timer
      if (durationMs > 0 && onDismiss) {
        const timer = setTimeout(() => {
          onDismiss();
        }, durationMs);
        return () => clearTimeout(timer);
      }
    } else {
      if (reduceMotion) {
        opacity.value = 0;
        translateY.value = -20;
      } else {
        opacity.value = withTiming(0, { duration: theme.motion.duration.fast });
        translateY.value = withTiming(-20, { duration: theme.motion.duration.fast });
      }
    }
  }, [visible, variant, durationMs, onDismiss, reduceMotion, theme]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  // Resolve Variant Colors
  let accentColor: string = theme.colors.primary;
  switch (variant) {
    case 'success':
      accentColor = theme.colors.status.healthy.main;
      break;
    case 'warning':
      accentColor = theme.colors.status.watch.main;
      break;
    case 'error':
      accentColor = theme.colors.status.actNow.main;
      break;
    case 'info':
      accentColor = theme.colors.primary;
      break;
  }

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion={variant === 'error' ? 'assertive' : 'polite'}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.borderSubtle,
          borderWidth: 1,
          borderLeftColor: accentColor,
          borderLeftWidth: 5,
          borderRadius: theme.radii.md,
          paddingLeft: theme.spacing.md,
          paddingRight: theme.spacing.xs,
          paddingVertical: theme.spacing.sm,
        },
        theme.elevation.md,
        animatedStyle,
      ]}
    >
      <View style={styles.textContainer}>
        {title ? (
          <Text
            style={[
              theme.typography.headline,
              { color: theme.colors.textPrimary, marginBottom: 2 },
            ]}
          >
            {title}
          </Text>
        ) : null}
        <Text style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}>
          {message}
        </Text>
      </View>

      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={styles.actionButton}
        >
          <Text style={[theme.typography.callout, { color: accentColor, fontWeight: '700' }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}

      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          testID={testID ? `${testID}-dismiss` : 'toast-dismiss'}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.dismissButton}
        >
          <Text
            style={[theme.typography.bodyBold, { color: theme.colors.textTertiary, fontSize: 16 }]}
          >
            ✕
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  textContainer: {
    flex: 1,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  actionButton: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  dismissButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
