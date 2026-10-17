import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useReducedMotion, useTheme } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  title,
  children,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  textStyle,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const isInteractive = !disabled && !loading;

  const handlePressIn = () => {
    if (!isInteractive) return;
    if (!reduceMotion) {
      scale.value = withSpring(0.97, theme.motion.spring.snappy);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    if (!reduceMotion) {
      scale.value = withSpring(1, theme.motion.spring.snappy);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Resolve Variant Colors
  let backgroundColor: string = theme.colors.primary;
  let textColor: string = theme.colors.onPrimary;
  let borderColor: string = 'transparent';
  let borderWidth = 0;

  switch (variant) {
    case 'primary':
      backgroundColor = theme.colors.primary;
      textColor = theme.colors.onPrimary;
      break;
    case 'secondary':
      backgroundColor = theme.colors.surfaceSubtle;
      textColor = theme.colors.primary;
      borderColor = theme.colors.borderSubtle;
      borderWidth = 1;
      break;
    case 'outline':
      backgroundColor = 'transparent';
      textColor = theme.colors.primary;
      borderColor = theme.colors.primary;
      borderWidth = 1.5;
      break;
    case 'ghost':
      backgroundColor = 'transparent';
      textColor = theme.colors.primary;
      break;
    case 'danger':
      backgroundColor = theme.colors.status.actNow.main;
      textColor = theme.colors.textInverse;
      break;
  }

  // Resolve Size Styles (all enforce >= 48 dp touch target)
  let minHeight = 48;
  let paddingHorizontal: number = theme.spacing.lg;
  let paddingVertical: number = theme.spacing.sm;
  let typographyStyle: TextStyle = theme.typography.bodyMedium;

  switch (size) {
    case 'sm':
      minHeight = 48;
      paddingHorizontal = theme.spacing.md;
      paddingVertical = theme.spacing.xs;
      typographyStyle = theme.typography.callout;
      break;
    case 'md':
      minHeight = 48;
      paddingHorizontal = theme.spacing.xl;
      paddingVertical = theme.spacing.sm;
      typographyStyle = theme.typography.bodyMedium;
      break;
    case 'lg':
      minHeight = 56;
      paddingHorizontal = theme.spacing.xxl;
      paddingVertical = theme.spacing.md;
      typographyStyle = theme.typography.bodyBold;
      break;
  }

  const computedAccessibilityLabel =
    accessibilityLabel ||
    (typeof title === 'string' ? title : typeof children === 'string' ? children : undefined);

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={computedAccessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: !isInteractive,
        busy: loading,
      }}
      disabled={!isInteractive}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.base,
        {
          minHeight,
          paddingHorizontal,
          paddingVertical,
          backgroundColor,
          borderColor,
          borderWidth,
          borderRadius: theme.radii.md,
          opacity: disabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={textColor}
          testID={testID ? `${testID}-loading` : 'button-loading'}
        />
      ) : (
        <View style={styles.contentRow}>
          {icon && iconPosition === 'left' ? (
            <View style={{ marginRight: theme.spacing.xs }}>{icon}</View>
          ) : null}
          {title ? (
            <Text style={[typographyStyle, { color: textColor, textAlign: 'center' }, textStyle]}>
              {title}
            </Text>
          ) : (
            children
          )}
          {icon && iconPosition === 'right' ? (
            <View style={{ marginLeft: theme.spacing.xs }}>{icon}</View>
          ) : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
