import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion, useTheme } from '@/theme';

export type ProgressSeverityVariant = 'auto' | 'healthy' | 'watch' | 'actNow' | 'primary';

export type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressMeterProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  severityVariant?: ProgressSeverityVariant;
  size?: ProgressSize;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressMeter({
  value,
  max,
  label,
  showPercentage = true,
  severityVariant = 'auto',
  size = 'md',
  testID,
  style,
}: ProgressMeterProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  // Normalize ratio to [0.0, 1.0]
  const maxValue = max ?? (value > 1 ? 100 : 1.0);
  const ratio = Math.min(Math.max(value / maxValue, 0), 1);
  const percentage = Math.round(ratio * 100);

  const animatedRatio = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      animatedRatio.value = ratio;
    } else {
      animatedRatio.value = withTiming(ratio, {
        duration: theme.motion.duration.normal,
      });
    }
  }, [ratio, reduceMotion, theme, animatedRatio]);

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${Math.round(animatedRatio.value * 100)}%`,
  }));

  // Resolve fill bar color
  let barColor: string = theme.colors.primary;
  if (severityVariant === 'auto') {
    if (ratio >= 0.75) {
      barColor = theme.colors.status.healthy.main;
    } else if (ratio >= 0.45) {
      barColor = theme.colors.status.watch.main;
    } else {
      barColor = theme.colors.status.actNow.main;
    }
  } else if (severityVariant === 'healthy') {
    barColor = theme.colors.status.healthy.main;
  } else if (severityVariant === 'watch') {
    barColor = theme.colors.status.watch.main;
  } else if (severityVariant === 'actNow') {
    barColor = theme.colors.status.actNow.main;
  } else {
    barColor = theme.colors.primary;
  }

  // Bar height
  let barHeight = 10;
  if (size === 'sm') barHeight = 6;
  if (size === 'lg') barHeight = 16;

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: percentage,
      }}
      accessibilityLabel={label ? `${label}: ${percentage}%` : `${percentage}%`}
      style={[styles.container, style]}
    >
      {label || showPercentage ? (
        <View style={styles.labelRow}>
          {label ? (
            <Text
              style={[theme.typography.subhead, { color: theme.colors.textSecondary }]}
              testID={testID ? `${testID}-label` : 'progress-label'}
            >
              {label}
            </Text>
          ) : (
            <View />
          )}
          {showPercentage ? (
            <Text
              style={[
                theme.typography.subhead,
                { color: theme.colors.textPrimary, fontWeight: '700' },
              ]}
              testID={testID ? `${testID}-percentage` : 'progress-percentage'}
            >
              {`${percentage}%`}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.track,
          {
            height: barHeight,
            borderRadius: theme.radii.full,
            backgroundColor: theme.colors.borderSubtle,
          },
        ]}
      >
        <Animated.View
          testID={testID ? `${testID}-bar` : 'progress-bar'}
          style={[
            styles.fill,
            {
              backgroundColor: barColor,
              borderRadius: theme.radii.full,
            },
            animatedBarStyle,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
