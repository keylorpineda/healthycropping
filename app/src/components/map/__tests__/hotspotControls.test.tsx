import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  DEFAULT_HOTSPOT_FILTERS,
  HotspotControls,
  type HotspotFilters,
  type LocatedScan,
} from '@/components/map';
import i18n from '@/i18n';
import { ThemeProvider } from '@/theme';

function makeLocatedScan(overrides: Partial<LocatedScan> = {}): LocatedScan {
  return {
    id: 'scan-1',
    farm_id: 'farm-1',
    plot_id: 'plot-1',
    crop: 'coffee',
    predicted_class: 'leaf_rust',
    severity: 'actNow',
    confidence: 0.9,
    threshold: 0.7,
    is_low_confidence: 0,
    model_version: '0.1.0',
    local_photo_uri: 'file:///mock/scan.jpg',
    cloudinary_public_id: null,
    latitude: 9.662,
    longitude: -84.022,
    explanation_json: null,
    scanned_at: '2026-11-10T12:00:00.000Z',
    updated_at: '2026-11-10T12:00:00.000Z',
    deleted_at: null,
    sync_status: 'pending',
    ...overrides,
  };
}

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('HotspotControls', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders severity counts in the legend for visible scans', () => {
    const visible: LocatedScan[] = [
      makeLocatedScan({ id: '1', severity: 'actNow' }),
      makeLocatedScan({ id: '2', severity: 'watch' }),
      makeLocatedScan({ id: '3', severity: 'watch' }),
    ];

    renderWithTheme(
      <HotspotControls
        scans={visible}
        visible={visible}
        filters={DEFAULT_HOTSPOT_FILTERS}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByTestId('hotspot-controls-count-actNow')).toHaveTextContent('Act Now: 1');
    expect(screen.getByTestId('hotspot-controls-count-watch')).toHaveTextContent('Watch: 2');
    expect(screen.getByTestId('hotspot-controls-count-healthy')).toHaveTextContent('Healthy: 0');
  });

  it('hides crop chips when all scans share one crop and shows them when there are two crops', () => {
    const singleCropScans: LocatedScan[] = [
      makeLocatedScan({ id: '1', crop: 'coffee' }),
      makeLocatedScan({ id: '2', crop: 'coffee' }),
    ];

    const first = renderWithTheme(
      <HotspotControls
        scans={singleCropScans}
        visible={singleCropScans}
        filters={DEFAULT_HOTSPOT_FILTERS}
        onChange={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('hotspot-controls-crops')).toBeNull();
    first.unmount();

    const twoCropScans: LocatedScan[] = [
      makeLocatedScan({ id: '1', crop: 'coffee' }),
      makeLocatedScan({ id: '2', crop: 'cacao', predicted_class: 'monilia' }),
    ];
    const onChange = jest.fn();
    const initialFilters: HotspotFilters = {
      crop: null,
      predictedClass: 'leaf_rust',
      range: '90d',
    };

    renderWithTheme(
      <HotspotControls
        scans={twoCropScans}
        visible={twoCropScans}
        filters={initialFilters}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('hotspot-controls-crops')).toBeTruthy();
    fireEvent.press(screen.getByTestId('hotspot-controls-crop-coffee'));
    expect(onChange).toHaveBeenCalledWith({
      ...initialFilters,
      crop: 'coffee',
      predictedClass: null,
    });
  });

  it('renders disease chips with localized labels and calls onChange on range chip press', () => {
    const scans: LocatedScan[] = [
      makeLocatedScan({ id: '1', crop: 'coffee', predicted_class: 'leaf_rust' }),
      makeLocatedScan({ id: '2', crop: 'coffee', predicted_class: 'cercospora' }),
    ];
    const onChange = jest.fn();

    renderWithTheme(
      <HotspotControls
        scans={scans}
        visible={scans}
        filters={DEFAULT_HOTSPOT_FILTERS}
        onChange={onChange}
      />,
    );

    const rustChip = screen.getByTestId('hotspot-controls-class-leaf_rust');
    const cercosporaChip = screen.getByTestId('hotspot-controls-class-cercospora');

    expect(rustChip).toHaveTextContent('Coffee leaf rust (Hemileia vastatrix)');
    expect(cercosporaChip).toHaveTextContent('Brown eye spot / Cercospora (Cercospora coffeicola)');

    fireEvent.press(rustChip);
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_HOTSPOT_FILTERS,
      predictedClass: 'leaf_rust',
    });

    fireEvent.press(screen.getByTestId('hotspot-controls-range-30d'));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_HOTSPOT_FILTERS,
      range: '30d',
    });
  });
});
