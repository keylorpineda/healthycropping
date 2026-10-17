import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion, useTheme } from '@/theme';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
  testID,
  accessibilityLabel,
}: SheetProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const backdropOpacity = useSharedValue(0);
  const translateY = useSharedValue(400);

  useEffect(() => {
    if (visible) {
      if (reduceMotion) {
        backdropOpacity.value = 1;
        translateY.value = 0;
      } else {
        backdropOpacity.value = withTiming(1, {
          duration: theme.motion.duration.fast,
        });
        translateY.value = withSpring(0, theme.motion.spring.gentle);
      }
    } else {
      if (reduceMotion) {
        backdropOpacity.value = 0;
        translateY.value = 400;
      } else {
        backdropOpacity.value = withTiming(0, {
          duration: theme.motion.duration.fast,
        });
        translateY.value = withTiming(400, {
          duration: theme.motion.duration.fast,
        });
      }
    }
  }, [visible, reduceMotion, theme]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
      testID={testID}
      accessibilityViewIsModal
    >
      <View
        style={styles.modalRoot}
        accessibilityRole="none"
        accessibilityLabel={accessibilityLabel || title || 'Modal sheet'}
      >
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            testID={testID ? `${testID}-backdrop` : 'sheet-backdrop'}
            accessibilityRole="button"
            accessibilityLabel="Dismiss sheet"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.xl,
              borderTopRightRadius: theme.radii.xl,
              borderColor: theme.colors.borderSubtle,
              borderTopWidth: 1,
            },
            theme.elevation.lg,
            animatedContentStyle,
          ]}
        >
          {/* Grab handle */}
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />

          {/* Header */}
          <View style={[styles.header, { paddingHorizontal: theme.spacing.lg }]}>
            {title ? (
              <Text
                style={[theme.typography.title3, { color: theme.colors.textPrimary, flex: 1 }]}
                testID={testID ? `${testID}-title` : 'sheet-title'}
              >
                {title}
              </Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <Pressable
              onPress={onClose}
              testID={testID ? `${testID}-close` : 'sheet-close-button'}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.closeButton}
            >
              <Text
                style={[
                  theme.typography.headline,
                  { color: theme.colors.textSecondary, fontSize: 18 },
                ]}
              >
                ✕
              </Text>
            </Pressable>
          </View>

          {/* Body */}
          <View
            style={[
              styles.body,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingBottom: theme.spacing.xxxl,
              },
            ]}
          >
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetContainer: {
    width: '100%',
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 4,
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingTop: 8,
  },
});
