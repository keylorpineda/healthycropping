import React, { useEffect } from 'react';
import { DimensionValue, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion, useTheme } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius,
  style,
  testID,
}: SkeletonProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.5;
    } else {
      opacity.value = withRepeat(
        withSequence(withTiming(0.85, { duration: 750 }), withTiming(0.35, { duration: 750 })),
        -1,
        true,
      );
    }
  }, [reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      testID={testID ?? 'skeleton-placeholder'}
      accessibilityElementsHidden
      importantForAccessibility="no"
      accessibilityRole="none"
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: borderRadius ?? theme.radii.sm,
          backgroundColor: theme.colors.borderStrong,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
