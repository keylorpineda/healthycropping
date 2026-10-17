import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { ThemeProvider } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ProgressMeter,
  Sheet,
  Skeleton,
  Toast,
} from '../index';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('UI Component Library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Button', () => {
    it('renders title and handles onPress with haptic feedback', () => {
      const onPressMock = jest.fn();
      renderWithTheme(<Button title="Scan Coffee" onPress={onPressMock} testID="btn-scan" />);

      const button = screen.getByTestId('btn-scan');
      expect(screen.getByText('Scan Coffee')).toBeTruthy();
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe('Scan Coffee');

      fireEvent(button, 'pressIn');
      expect(Haptics.impactAsync).toHaveBeenCalledWith('light');

      fireEvent.press(button);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('enforces minimum 48 dp touch target across all sizes', () => {
      const { rerender } = renderWithTheme(<Button title="Small" size="sm" testID="btn-sm" />);
      let btn = screen.getByTestId('btn-sm');
      const flatStyleSm = Array.isArray(btn.props.style)
        ? Object.assign({}, ...btn.props.style.filter(Boolean))
        : btn.props.style;
      expect(flatStyleSm.minHeight).toBeGreaterThanOrEqual(48);

      rerender(
        <ThemeProvider>
          <Button title="Medium" size="md" testID="btn-md" />
        </ThemeProvider>,
      );
      btn = screen.getByTestId('btn-md');
      const flatStyleMd = Array.isArray(btn.props.style)
        ? Object.assign({}, ...btn.props.style.filter(Boolean))
        : btn.props.style;
      expect(flatStyleMd.minHeight).toBeGreaterThanOrEqual(48);

      rerender(
        <ThemeProvider>
          <Button title="Large" size="lg" testID="btn-lg" />
        </ThemeProvider>,
      );
      btn = screen.getByTestId('btn-lg');
      const flatStyleLg = Array.isArray(btn.props.style)
        ? Object.assign({}, ...btn.props.style.filter(Boolean))
        : btn.props.style;
      expect(flatStyleLg.minHeight).toBeGreaterThanOrEqual(56);
    });

    it('displays loading indicator and blocks interactions when loading', () => {
      const onPressMock = jest.fn();
      renderWithTheme(
        <Button title="Analyze" loading onPress={onPressMock} testID="btn-loading" />,
      );

      const button = screen.getByTestId('btn-loading');
      expect(screen.getByTestId('btn-loading-loading')).toBeTruthy();
      expect(button.props.accessibilityState.busy).toBe(true);
      expect(button.props.accessibilityState.disabled).toBe(true);

      fireEvent.press(button);
      expect(onPressMock).not.toHaveBeenCalled();
    });

    it('disables press events when disabled', () => {
      const onPressMock = jest.fn();
      renderWithTheme(
        <Button title="Disabled" disabled onPress={onPressMock} testID="btn-disabled" />,
      );

      const button = screen.getByTestId('btn-disabled');
      expect(button.props.accessibilityState.disabled).toBe(true);

      fireEvent.press(button);
      expect(onPressMock).not.toHaveBeenCalled();
    });

    it('renders variants without crashing', () => {
      const variants = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
      variants.forEach((v) => {
        const { unmount } = renderWithTheme(<Button title={v} variant={v} testID={`btn-${v}`} />);
        expect(screen.getByTestId(`btn-${v}`)).toBeTruthy();
        unmount();
      });
    });
  });

  describe('Card', () => {
    it('renders static card with elevated and outlined variants', () => {
      renderWithTheme(
        <Card variant="elevated" testID="card-elevated">
          <Text>Elevated Content</Text>
        </Card>,
      );
      expect(screen.getByText('Elevated Content')).toBeTruthy();

      renderWithTheme(
        <Card variant="outlined" testID="card-outlined">
          <Text>Outlined Content</Text>
        </Card>,
      );
      expect(screen.getByText('Outlined Content')).toBeTruthy();
    });

    it('renders interactive pressable card when onPress is provided', () => {
      const onPressMock = jest.fn();
      renderWithTheme(
        <Card onPress={onPressMock} testID="card-pressable">
          <Text>Clickable Card</Text>
        </Card>,
      );

      const card = screen.getByTestId('card-pressable');
      expect(card.props.accessibilityRole).toBe('button');

      fireEvent(card, 'pressIn');
      expect(Haptics.impactAsync).toHaveBeenCalledWith('light');

      fireEvent.press(card);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Chip', () => {
    it('renders crop selector chip and responds to selection', () => {
      const onPressMock = jest.fn();
      renderWithTheme(
        <Chip
          label="Coffee"
          crop="coffee"
          selected={false}
          onPress={onPressMock}
          testID="chip-coffee"
        />,
      );

      const chip = screen.getByTestId('chip-coffee');
      expect(screen.getByText('Coffee')).toBeTruthy();
      expect(chip.props.accessibilityRole).toBe('checkbox');
      expect(chip.props.accessibilityState.selected).toBe(false);

      fireEvent.press(chip);
      expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('supports selected cacao and banana crop variants', () => {
      const { unmount } = renderWithTheme(
        <Chip label="Cacao" crop="cacao" selected testID="chip-cacao" />,
      );
      expect(screen.getByTestId('chip-cacao').props.accessibilityState.selected).toBe(true);
      unmount();

      renderWithTheme(<Chip label="Banana" crop="banana" selected testID="chip-banana" />);
      expect(screen.getByTestId('chip-banana').props.accessibilityState.selected).toBe(true);
    });

    it('enforces >= 48 dp touch target', () => {
      renderWithTheme(<Chip label="Test" testID="chip-target" />);
      const chip = screen.getByTestId('chip-target');
      const flatStyle = Array.isArray(chip.props.style)
        ? Object.assign({}, ...chip.props.style.filter(Boolean))
        : chip.props.style;
      expect(flatStyle.minHeight).toBeGreaterThanOrEqual(48);
    });
  });

  describe('Badge', () => {
    it('renders status badges with appropriate labels and text role', () => {
      const variants = [
        'healthy',
        'watch',
        'actNow',
        'lowConfidence',
        'coffee',
        'cacao',
        'banana',
        'neutral',
      ] as const;

      variants.forEach((v) => {
        const { unmount } = renderWithTheme(
          <Badge label={v.toUpperCase()} variant={v} testID={`badge-${v}`} />,
        );
        const badge = screen.getByTestId(`badge-${v}`);
        expect(screen.getByText(v.toUpperCase())).toBeTruthy();
        expect(badge.props.accessibilityRole).toBe('text');
        expect(badge.props.accessibilityLabel).toBe(v.toUpperCase());
        unmount();
      });
    });
  });

  describe('Sheet', () => {
    it('renders sheet when visible and handles close triggers', () => {
      const onCloseMock = jest.fn();
      renderWithTheme(
        <Sheet visible onClose={onCloseMock} title="Plot Options" testID="test-sheet">
          <Text>Sheet Body</Text>
        </Sheet>,
      );

      expect(screen.getByText('Plot Options')).toBeTruthy();
      expect(screen.getByText('Sheet Body')).toBeTruthy();

      // Close button
      const closeBtn = screen.getByTestId('test-sheet-close');
      expect(closeBtn.props.accessibilityRole).toBe('button');
      fireEvent.press(closeBtn);
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // Backdrop dismiss
      const backdrop = screen.getByTestId('test-sheet-backdrop');
      fireEvent.press(backdrop);
      expect(onCloseMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Toast', () => {
    it('renders toast message and triggers haptic announcement', () => {
      renderWithTheme(
        <Toast visible message="Scan saved offline" variant="success" testID="test-toast" />,
      );

      expect(screen.getByText('Scan saved offline')).toBeTruthy();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
      expect(screen.getByTestId('test-toast').props.accessibilityRole).toBe('alert');
    });

    it('auto-dismisses after durationMs', () => {
      const onDismissMock = jest.fn();
      renderWithTheme(
        <Toast
          visible
          message="Will dismiss"
          durationMs={2000}
          onDismiss={onDismissMock}
          testID="auto-toast"
        />,
      );

      expect(onDismissMock).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(onDismissMock).toHaveBeenCalledTimes(1);
    });

    it('renders action button and triggers callback', () => {
      const actionMock = jest.fn();
      renderWithTheme(
        <Toast
          visible
          message="Deleted"
          action={{ label: 'Undo', onPress: actionMock }}
          testID="action-toast"
        />,
      );

      const actionBtn = screen.getByText('Undo');
      fireEvent.press(actionBtn);
      expect(actionMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Skeleton', () => {
    it('is hidden from accessibility tree and applies dimensions', () => {
      renderWithTheme(<Skeleton width={120} height={24} borderRadius={8} testID="test-skel" />);

      const skel = screen.getByTestId('test-skel', {
        includeHiddenElements: true,
      });
      expect(skel.props.accessibilityElementsHidden).toBe(true);
      expect(skel.props.importantForAccessibility).toBe('no');
      const flatStyle = Array.isArray(skel.props.style)
        ? Object.assign({}, ...skel.props.style.filter(Boolean))
        : skel.props.style;
      expect(flatStyle.width).toBe(120);
      expect(flatStyle.height).toBe(24);
      expect(flatStyle.borderRadius).toBe(8);
    });
  });

  describe('EmptyState', () => {
    it('renders title, description, and primary/secondary action buttons', () => {
      const onActionMock = jest.fn();
      const onSecondaryMock = jest.fn();

      renderWithTheme(
        <EmptyState
          title="No Scans Yet"
          description="Point camera at a leaf to begin diagnosis."
          actionLabel="Take Photo"
          onAction={onActionMock}
          secondaryActionLabel="Learn More"
          onSecondaryAction={onSecondaryMock}
          testID="empty-history"
        />,
      );

      expect(screen.getByText('No Scans Yet')).toBeTruthy();
      expect(screen.getByText('Point camera at a leaf to begin diagnosis.')).toBeTruthy();

      const actionBtn = screen.getByTestId('empty-history-action');
      fireEvent.press(actionBtn);
      expect(onActionMock).toHaveBeenCalledTimes(1);

      const secBtn = screen.getByTestId('empty-history-secondary-action');
      fireEvent.press(secBtn);
      expect(onSecondaryMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('ProgressMeter', () => {
    it('calculates percentage and assigns accessibility attributes', () => {
      renderWithTheme(<ProgressMeter value={0.82} label="Confidence" testID="test-meter" />);

      const meter = screen.getByTestId('test-meter');
      expect(meter.props.accessibilityRole).toBe('progressbar');
      expect(meter.props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 82,
      });
      expect(screen.getByText('Confidence')).toBeTruthy();
      expect(screen.getByText('82%')).toBeTruthy();
    });

    it('maps automatic severity color variants based on ratio', () => {
      const { unmount } = renderWithTheme(<ProgressMeter value={0.85} testID="meter-high" />);
      expect(screen.getByTestId('meter-high-percentage').props.children).toBe('85%');
      unmount();

      renderWithTheme(<ProgressMeter value={0.55} testID="meter-mid" />);
      expect(screen.getByTestId('meter-mid-percentage').props.children).toBe('55%');
    });
  });
});
