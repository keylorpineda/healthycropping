import React from 'react';
import { StyleSheet, type Insets, type ViewStyle } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as SQLite from 'expo-sqlite';

import { AnalyzingOverlay } from '@/components/camera';
import { farmsRepository, initDatabase, plotsRepository, scansRepository } from '@/db';
import i18n from '@/i18n';
import { type InferencePrediction } from '@/ml/types';
import {
  AccountScreen,
  CameraScreen,
  FarmsScreen,
  HistoryScreen,
  HomeScreen,
  OnboardingScreen,
  ResultScreen,
  ScanDetailScreen,
  SettingsScreen,
  SignInScreen,
} from '@/screens';
import { useAuthStore } from '@/stores/auth';
import { usePreferencesStore } from '@/stores/preferences';
import { useSyncStore } from '@/stores/sync';
import { ThemeProvider, useReducedMotion } from '@/theme';

jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    withSpring: jest.fn(actual.withSpring),
    withRepeat: jest.fn(actual.withRepeat),
  };
});

jest.mock('@/theme', () => ({
  ...jest.requireActual('@/theme'),
  useReducedMotion: jest.fn(() => false),
}));

const mockedUseReducedMotion = useReducedMotion as jest.MockedFunction<typeof useReducedMotion>;

export interface ReactTestInstance {
  type: string | React.ComponentType<unknown>;
  props: Record<string, unknown>;
  children: Array<ReactTestInstance | string>;
  findAll: (predicate: (node: ReactTestInstance) => boolean) => ReactTestInstance[];
}

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;
const INTERACTIVE_ROLES = new Set(['button', 'link', 'radio', 'checkbox', 'switch']);
const TEXT_FALLBACK_ROLES = new Set(['button', 'link', 'radio']);
const SYMBOL_ONLY_REGEX = /^[\p{Extended_Pictographic}\p{S}\s←✕]+$/u;
const MIN_TOUCH_SIZE = 48;

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function getDescendantText(node: ReactTestInstance): string {
  const texts: string[] = [];
  const walk = (current: ReactTestInstance) => {
    for (const child of current.children) {
      if (typeof child === 'string') {
        if (current.type === 'Text') texts.push(child);
      } else {
        walk(child);
      }
    }
  };
  walk(node);
  return texts.join(' ').trim();
}

function resolveHitSlopAxis(
  hitSlop: number | Insets | undefined,
  axis: 'horizontal' | 'vertical',
): number {
  if (typeof hitSlop === 'number') return hitSlop * 2;
  if (hitSlop && typeof hitSlop === 'object') {
    return axis === 'horizontal'
      ? (hitSlop.left ?? 0) + (hitSlop.right ?? 0)
      : (hitSlop.top ?? 0) + (hitSlop.bottom ?? 0);
  }
  return 0;
}

export function auditInteractive(root: ReactTestInstance, expectControls = true): void {
  const interactiveNodes = root.findAll((node: ReactTestInstance) => {
    if (typeof node.type !== 'string') return false;
    const role = node.props.accessibilityRole;
    return (
      typeof node.props.onPress === 'function' ||
      (typeof role === 'string' && INTERACTIVE_ROLES.has(role)) ||
      node.type === 'TextInput'
    );
  });

  // Guard against a vacuous audit if the tree shape changes.
  if (expectControls) {
    expect(interactiveNodes.length).toBeGreaterThan(0);
  }

  const failures: string[] = [];

  for (const node of interactiveNodes) {
    const id = typeof node.props.testID === 'string' ? node.props.testID : `<${String(node.type)}>`;
    const isTextInput = node.type === 'TextInput';
    const role =
      typeof node.props.accessibilityRole === 'string' ? node.props.accessibilityRole : '';

    if (!isTextInput && (!role || !INTERACTIVE_ROLES.has(role))) {
      failures.push(`${id}: missing or invalid accessibilityRole (${role})`);
    }

    const explicitLabel =
      typeof node.props.accessibilityLabel === 'string' ? node.props.accessibilityLabel.trim() : '';
    const fallbackText = role && TEXT_FALLBACK_ROLES.has(role) ? getDescendantText(node) : '';
    const accessibleName = explicitLabel || fallbackText;

    if (!accessibleName) {
      failures.push(`${id}: missing accessible name`);
    } else if (SYMBOL_ONLY_REGEX.test(accessibleName)) {
      failures.push(`${id}: accessible name contains only symbols/emoji ("${accessibleName}")`);
    }

    const flatStyle = (StyleSheet.flatten(node.props.style as ViewStyle) ?? {}) as ViewStyle;
    const hitSlop = node.props.hitSlop as number | Insets | undefined;
    const hSlop = resolveHitSlopAxis(hitSlop, 'horizontal');
    const vSlop = resolveHitSlopAxis(hitSlop, 'vertical');

    for (const v of [flatStyle.minHeight, flatStyle.height]) {
      if (typeof v === 'number' && v + vSlop < MIN_TOUCH_SIZE) {
        failures.push(`${id}: vertical touch target ${v + vSlop}dp < ${MIN_TOUCH_SIZE}dp`);
      }
    }
    for (const h of [flatStyle.minWidth, flatStyle.width]) {
      if (typeof h === 'number' && h + hSlop < MIN_TOUCH_SIZE) {
        failures.push(`${id}: horizontal touch target ${h + hSlop}dp < ${MIN_TOUCH_SIZE}dp`);
      }
    }
  }

  expect(failures).toEqual([]);
}

const mockConfidentPrediction: InferencePrediction = {
  crop: 'coffee',
  predictedClass: 'leaf_rust',
  confidence: 0.94,
  threshold: 0.79,
  isLowConfidence: false,
  severity: 'actNow',
  probabilities: {
    healthy: 0.01,
    leaf_rust: 0.94,
    leaf_miner: 0.02,
    cercospora: 0.01,
    brown_leaf_spot: 0.01,
    red_spider_mite: 0.01,
  },
  rawProbabilities: [0.01, 0.94, 0.02, 0.01, 0.01, 0.01],
  inferenceTimeMs: 45,
};

const mockLowConfidencePrediction: InferencePrediction = {
  ...mockConfidentPrediction,
  confidence: 0.62,
  isLowConfidence: true,
  severity: 'watch',
};

describe('Accessibility Suite', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockedUseReducedMotion.mockReturnValue(false);
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
    usePreferencesStore.getState().resetPreferences();
    useAuthStore.setState({ status: 'signedOut', user: null });
    useSyncStore.setState({
      phase: 'idle',
      pendingCount: 0,
      lastSyncedAt: null,
      refreshPending: jest.fn(),
    });
    await i18n.changeLanguage('es');
  });

  it('audits OnboardingScreen and verifies progressbar dots and slide 3 checkbox', () => {
    renderWithTheme(<OnboardingScreen onComplete={jest.fn()} />);

    const dots = screen.getByTestId('onboarding-dots');
    expect(dots.props.accessibilityRole).toBe('progressbar');
    expect(dots.props.accessibilityLabel).toBe('Paso 1 de 3');
    auditInteractive(screen.UNSAFE_root);

    fireEvent.press(screen.getByTestId('onboarding-skip-btn'));
    expect(screen.getByTestId('onboarding-dots').props.accessibilityLabel).toBe('Paso 3 de 3');
    auditInteractive(screen.UNSAFE_root);
  });

  it('audits HomeScreen interactive elements and crop radio chips', () => {
    renderWithTheme(
      <HomeScreen
        onOpenSettings={jest.fn()}
        onScan={jest.fn()}
        onOpenHistory={jest.fn()}
        onOpenFarms={jest.fn()}
        onOpenScanDetail={jest.fn()}
      />,
    );

    auditInteractive(screen.UNSAFE_root);

    for (const crop of ['coffee', 'cacao', 'banana'] as const) {
      const chip = screen.getByTestId(`crop-chip-${crop}`);
      expect(chip.props.accessibilityRole).toBe('radio');
      expect(chip.props.accessibilityState.checked).toBe(chip.props.accessibilityState.selected);
    }
  });

  it('audits CameraScreen controls and AnalyzingOverlay', () => {
    const { unmount } = renderWithTheme(
      <CameraScreen crop="coffee" onPhotoCaptured={jest.fn()} onClose={jest.fn()} />,
    );
    auditInteractive(screen.UNSAFE_root);
    unmount();

    renderWithTheme(<AnalyzingOverlay imageUri="file:///test/leaf.jpg" />);
    expect(screen.getByTestId('analyzing-overlay').props.accessibilityRole).toBe('alert');
    // The overlay has no controls; it only must not expose unlabeled ones.
    auditInteractive(screen.UNSAFE_root, false);
  });

  it('audits ResultScreen (confident and low-confidence), hero image label, and disclaimer', () => {
    for (const prediction of [mockConfidentPrediction, mockLowConfidencePrediction]) {
      const { unmount } = renderWithTheme(
        <ResultScreen
          imageUri="file:///mock/captured_photo.jpg"
          prediction={prediction}
          onRetake={jest.fn()}
          onDone={jest.fn()}
        />,
      );

      const heroImage = screen.getByTestId('result-hero-image');
      expect(heroImage.props.accessibilityRole).toBe('image');
      expect(heroImage.props.accessibilityLabel).toContain('Roya del café (Hemileia vastatrix)');
      expect(screen.getByTestId('result-disclaimer-box')).toBeTruthy();
      auditInteractive(screen.UNSAFE_root);
      unmount();
    }
  });

  it('audits HistoryScreen, ensures delete button is not nested inside scan item, and checks confidence label', () => {
    const scan = scansRepository.create({
      crop: 'coffee',
      predicted_class: 'leaf_rust',
      severity: 'actNow',
      confidence: 0.92,
      threshold: 0.79,
      is_low_confidence: false,
      model_version: 'v0.1.0-coffee-mobilenetv3large-float16',
      local_photo_uri: 'file:///mock/coffee_rust.jpg',
    });

    renderWithTheme(
      <HistoryScreen onBack={jest.fn()} onOpenScanDetail={jest.fn()} onScanNew={jest.fn()} />,
    );

    auditInteractive(screen.UNSAFE_root);

    const scanItem = screen.getByTestId(`scan-item-${scan.id}`) as unknown as ReactTestInstance;
    expect(scanItem.props.accessibilityLabel).toMatch(/92\s*%/);

    const nestedDeleteButtons = scanItem.findAll(
      (node: ReactTestInstance) => node.props.testID === `delete-scan-btn-${scan.id}`,
    );
    expect(nestedDeleteButtons).toHaveLength(0);
  });

  it('audits FarmsScreen with the add-farm sheet open and ScanDetailScreen', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    plotsRepository.create({
      farm_id: farm.id,
      name: 'Lote Esperanza',
      crop: 'coffee',
      area_ha: 2.5,
    });
    const scan = scansRepository.create({
      crop: 'coffee',
      predicted_class: 'leaf_rust',
      severity: 'actNow',
      confidence: 0.94,
      threshold: 0.79,
      is_low_confidence: false,
      model_version: 'v0.1.0-coffee-mobilenetv3large-float16',
      local_photo_uri: 'file:///mock/coffee_rust.jpg',
    });

    const { unmount } = renderWithTheme(<FarmsScreen onBack={jest.fn()} />);
    fireEvent.press(screen.getByTestId('header-add-farm-btn'));
    expect(screen.getByTestId('new-farm-name-input')).toBeTruthy();
    auditInteractive(screen.UNSAFE_root);
    unmount();

    renderWithTheme(<ScanDetailScreen scanId={scan.id} onBack={jest.fn()} onDelete={jest.fn()} />);
    auditInteractive(screen.UNSAFE_root);
  });

  it('audits SettingsScreen, SignInScreen, and AccountScreen including language and theme chips', () => {
    const { unmount: unmountSettings } = renderWithTheme(
      <SettingsScreen
        onBack={jest.fn()}
        onReplayOnboarding={jest.fn()}
        onSignIn={jest.fn()}
        onManageAccount={jest.fn()}
      />,
    );

    auditInteractive(screen.UNSAFE_root);

    for (const chipId of [
      'theme-chip-system',
      'theme-chip-light',
      'theme-chip-dark',
      'lang-chip-es',
      'lang-chip-en',
    ]) {
      const chip = screen.getByTestId(chipId);
      expect(chip.props.accessibilityRole).toBe('radio');
      expect(chip.props.accessibilityState.checked).toBe(chip.props.accessibilityState.selected);
    }
    unmountSettings();

    const { unmount: unmountSignIn } = renderWithTheme(
      <SignInScreen onSuccess={jest.fn()} onSkip={jest.fn()} onSwitchMode={jest.fn()} />,
    );
    auditInteractive(screen.UNSAFE_root);
    unmountSignIn();

    useAuthStore.setState({ status: 'signedIn', user: { uid: 'u1', email: 'ana@finca.cr' } });
    renderWithTheme(<AccountScreen onBack={jest.fn()} onSignedOut={jest.fn()} />);
    auditInteractive(screen.UNSAFE_root);
  });

  it('respects reduced motion on ResultScreen and AnalyzingOverlay without calling withSpring or withRepeat', () => {
    // Reanimated exports non-configurable getters; wrapped via jest.mock above to spy on calls.
    mockedUseReducedMotion.mockReturnValue(true);
    (Reanimated.withSpring as jest.Mock).mockClear();
    (Reanimated.withRepeat as jest.Mock).mockClear();

    const { unmount } = renderWithTheme(
      <ResultScreen
        imageUri="file:///mock/captured_photo.jpg"
        prediction={mockConfidentPrediction}
        onRetake={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByTestId('result-disease-name')).toBeTruthy();
    unmount();

    renderWithTheme(<AnalyzingOverlay imageUri="file:///test/leaf.jpg" />);
    expect(screen.getByTestId('analyzing-overlay')).toBeTruthy();

    expect(Reanimated.withSpring).not.toHaveBeenCalled();
    expect(Reanimated.withRepeat).not.toHaveBeenCalled();
  });
});
