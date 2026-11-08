import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Badge } from '@/components/ui';
import { useAuthStore } from '@/stores/auth';
import { type SyncPhase, useSyncStore } from '@/stores/sync';
import { useReducedMotion, useTheme } from '@/theme';

export interface SyncStatusPillProps {
  testID?: string;
}

type PillTone = 'progress' | 'done' | 'waiting' | 'problem';

function describe(phase: SyncPhase, pendingCount: number): { key: string; tone: PillTone } {
  if (phase === 'syncing') return { key: 'sync.syncing', tone: 'progress' };
  if (phase === 'offline') return { key: 'sync.offline', tone: 'waiting' };
  if (phase === 'error') return { key: 'sync.error', tone: 'problem' };
  if (pendingCount > 0) return { key: 'sync.pending', tone: 'waiting' };
  if (phase === 'synced') return { key: 'sync.synced', tone: 'done' };
  return { key: 'sync.ready', tone: 'waiting' };
}

/**
 * Account sync indicator. Signed out, it keeps the "100% offline" badge. Signed
 * in, a dot pulses while syncing and morphs into a checkmark when the run ends;
 * with reduce-motion enabled the states switch without animation. Tapping it
 * retries a sync.
 */
export function SyncStatusPill({
  testID = 'sync-status-pill',
}: SyncStatusPillProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const signedIn = useAuthStore((state) => state.status === 'signedIn');
  const phase = useSyncStore((state) => state.phase);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const requestSync = useSyncStore((state) => state.requestSync);

  const { key, tone } = describe(phase, pendingCount);
  const showCheck = tone === 'done';

  const pulse = useSharedValue(1);
  const morph = useSharedValue(showCheck ? 1 : 0);

  useEffect(() => {
    cancelAnimation(pulse);
    if (phase === 'syncing' && !reduceMotion) {
      pulse.value = withRepeat(
        withSequence(withTiming(0.35, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1,
      );
    } else {
      pulse.value = 1;
    }
  }, [phase, reduceMotion, pulse]);

  useEffect(() => {
    const target = showCheck ? 1 : 0;
    morph.value = reduceMotion ? target : withSpring(target, theme.motion.spring.bouncy);
  }, [showCheck, reduceMotion, morph, theme.motion.spring.bouncy]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * (1 - morph.value),
    transform: [{ scale: 1 - morph.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: morph.value,
    transform: [{ scale: morph.value }],
  }));

  if (!signedIn) {
    return (
      <Badge
        label={t('home.offlinePill')}
        variant="healthy"
        size="sm"
        testID="home-offline-badge"
      />
    );
  }

  const palette = {
    progress: theme.colors.primary,
    done: theme.colors.status.healthy.main,
    waiting: theme.colors.status.watch.main,
    problem: theme.colors.status.actNow.main,
  } as const;
  const color = palette[tone];
  const label = t(key, { count: pendingCount });

  return (
    <Pressable
      onPress={() => void requestSync()}
      disabled={phase === 'syncing'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('sync.retryHint')}
      accessibilityState={{ busy: phase === 'syncing', disabled: phase === 'syncing' }}
      accessibilityLiveRegion="polite"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.pill,
        {
          borderColor: color,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.full,
          paddingHorizontal: theme.spacing.md,
        },
      ]}
      testID={testID}
    >
      <View style={styles.iconBox}>
        <Animated.View
          style={[styles.dot, { backgroundColor: color }, dotStyle]}
          testID={`${testID}-dot`}
        />
        <Animated.Text
          style={[theme.typography.caption, styles.check, { color }, checkStyle]}
          testID={`${testID}-check`}
        >
          ✓
        </Animated.Text>
      </View>
      <Text
        style={[theme.typography.caption, { color: theme.colors.textPrimary, fontWeight: '600' }]}
        testID={`${testID}-label`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    minWidth: 48,
    borderWidth: 1.5,
  },
  iconBox: {
    width: 14,
    height: 14,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  check: {
    position: 'absolute',
    fontWeight: '800',
  },
});
