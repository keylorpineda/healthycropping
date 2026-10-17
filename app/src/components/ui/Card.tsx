import React from 'react';
import {
  AccessibilityRole,
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useReducedMotion, useTheme } from '@/theme';

export type CardVariant = 'elevated' | 'outlined' | 'flat';
export type CardPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface CardProps {
  variant?: CardVariant;
  padding?: CardPadding;
  onPress?: (event: GestureResponderEvent) => void;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({
  variant = 'elevated',
  padding = 'md',
  onPress,
  children,
  accessibilityLabel,
  accessibilityRole,
  accessibilityHint,
  testID,
  style,
}: CardProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const paddingValue = padding === 'none' ? 0 : theme.spacing[padding];

  const handlePressIn = () => {
    if (!onPress) return;
    if (!reduceMotion) {
      scale.value = withSpring(0.98, theme.motion.spring.snappy);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    if (!onPress) return;
    if (!reduceMotion) {
      scale.value = withSpring(1, theme.motion.spring.snappy);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Resolve Variant Styles
  let variantStyle: ViewStyle = {};
  switch (variant) {
    case 'elevated':
      variantStyle = {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.borderSubtle,
        borderWidth: 1,
        ...theme.elevation.sm,
      };
      break;
    case 'outlined':
      variantStyle = {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: 1,
      };
      break;
    case 'flat':
      variantStyle = {
        backgroundColor: theme.colors.surfaceSubtle,
        borderWidth: 0,
      };
      break;
  }

  const baseStyle: ViewStyle = {
    borderRadius: theme.radii.lg,
    padding: paddingValue,
    overflow: 'hidden',
    ...variantStyle,
  };

  if (onPress) {
    return (
      <AnimatedPressable
        testID={testID}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.pressableBase, baseStyle, animatedStyle, style]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[baseStyle, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pressableBase: {
    minHeight: 48,
  },
});
