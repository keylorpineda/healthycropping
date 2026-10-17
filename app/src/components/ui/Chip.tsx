import React from 'react';
import {
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

export type CropType = 'coffee' | 'cacao' | 'banana';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  crop?: CropType;
  icon?: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Chip({
  label,
  selected = false,
  onPress,
  crop,
  icon,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
  textStyle,
}: ChipProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (disabled) return;
    if (!reduceMotion) {
      scale.value = withSpring(0.95, theme.motion.spring.snappy);
    }
  };

  const handlePressOut = () => {
    if (disabled) return;
    if (!reduceMotion) {
      scale.value = withSpring(1, theme.motion.spring.snappy);
    }
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (disabled) return;
    void Haptics.selectionAsync();
    onPress?.(e);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Resolve Colors based on crop and selection
  let backgroundColor: string = theme.colors.surface;
  let borderColor: string = theme.colors.border;
  let textColor: string = theme.colors.textSecondary;

  if (selected) {
    if (crop === 'coffee') {
      backgroundColor = theme.colors.crops.coffee.accent;
      borderColor = theme.colors.crops.coffee.accent;
      textColor = theme.colors.textInverse;
    } else if (crop === 'cacao') {
      backgroundColor = theme.colors.crops.cacao.accent;
      borderColor = theme.colors.crops.cacao.accent;
      textColor = theme.colors.textInverse;
    } else if (crop === 'banana') {
      backgroundColor = theme.colors.crops.banana.accent;
      borderColor = theme.colors.crops.banana.accent;
      textColor = theme.colors.textInverse;
    } else {
      backgroundColor = theme.colors.primary;
      borderColor = theme.colors.primary;
      textColor = theme.colors.onPrimary;
    }
  } else {
    backgroundColor = theme.colors.surface;
    borderColor = theme.colors.border;
    textColor = theme.colors.textSecondary;
  }

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{
        selected,
        disabled,
      }}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={[
        styles.base,
        {
          minHeight: 48,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radii.full,
          backgroundColor,
          borderColor,
          borderWidth: 1.5,
          opacity: disabled ? 0.5 : 1,
        },
        animatedStyle,
        style,
      ]}
    >
      <View style={styles.contentRow}>
        {icon ? <View style={{ marginRight: theme.spacing.xs }}>{icon}</View> : null}
        <Text
          style={[
            theme.typography.callout,
            { color: textColor, fontWeight: selected ? '700' : '500' },
            textStyle,
          ]}
        >
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
