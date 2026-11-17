import React from 'react';
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { barFraction, NdviCard, summarizeVigor, vigorLevel } from '@/components/ndvi';
import { type Plot } from '@/db';
import i18n from '@/i18n';
import { NdviError, type NdviMonth, type PlotNdviResult } from '@/services/ndvi';
import { ThemeProvider } from '@/theme';

const MONTH_KEYS = [
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
] as const;

const ATTRIBUTION =
  'Contains modified Copernicus Sentinel data, processed with Google Earth Engine.';

const PLOT: Plot = {
  id: 'plot-1',
  farm_id: 'farm-1',
  name: 'Lote Alto',
  crop: 'coffee',
  area_ha: null,
  latitude: 9.66,
  longitude: -84.02,
  boundary_geojson: null,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  deleted_at: null,
  sync_status: 'synced',
};

function months(values: (number | 'cloudy' | 'no_data')[]): NdviMonth[] {
  return MONTH_KEYS.map((month, index) => {
    const value = values[index] ?? 'no_data';
    if (typeof value === 'number') {
      return {
        month,
        ndvi: value,
        clear_fraction: 0.8,
        images: 3,
        status: 'ok',
        cached: false,
      };
    }
    return {
      month,
      ndvi: null,
      clear_fraction: value === 'cloudy' ? 0.05 : 0,
      images: value === 'cloudy' ? 3 : 0,
      status: value,
      cached: false,
    };
  });
}

function makeResult(
  monthSeries: NdviMonth[],
  source: 'network' | 'cache' = 'network',
): PlotNdviResult {
  return {
    ndvi: {
      plot_id: PLOT.id,
      source: 'boundary',
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      months: monthSeries,
      attribution: ATTRIBUTION,
    },
    source,
    fetchedAt: '2026-11-15T12:00:00.000Z',
  };
}

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function freshClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

describe('NDVI vigor helpers and NdviCard', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('es');
    });
  });

  it('classifies vigorLevel thresholds', () => {
    expect(vigorLevel(0.29)).toBe('low');
    expect(vigorLevel(0.3)).toBe('moderate');
    expect(vigorLevel(0.6)).toBe('moderate');
    expect(vigorLevel(0.61)).toBe('high');
  });

  it('computes summarizeVigor baseline, latest clear month and trend', () => {
    expect(
      summarizeVigor(
        months([
          'cloudy',
          'no_data',
          'cloudy',
          'cloudy',
          'no_data',
          'cloudy',
          'cloudy',
          'no_data',
          'cloudy',
          'cloudy',
          'no_data',
          'cloudy',
        ]),
      ),
    ).toBeNull();

    const sparse = summarizeVigor(
      months([
        0.65,
        0.7,
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        0.72,
        'cloudy',
      ]),
    );
    expect(sparse).not.toBeNull();
    expect(sparse?.latest.month).toBe('2026-09');
    expect(sparse?.latest.ndvi).toBe(0.72);
    expect(sparse?.trend).toBeNull();
    expect(sparse?.baseline).toBeNull();

    const below = summarizeVigor(
      months([
        0.7,
        0.7,
        0.7,
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        0.55,
        'cloudy',
        'no_data',
      ]),
    );
    expect(below?.latest.month).toBe('2026-08');
    expect(below?.baseline).toBeCloseTo(0.7, 5);
    expect(below?.trend).toBe('below');

    const normal = summarizeVigor(
      months([
        0.7,
        0.7,
        0.7,
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        0.75,
        'cloudy',
        'cloudy',
      ]),
    );
    expect(normal?.baseline).toBeCloseTo(0.7, 5);
    expect(normal?.trend).toBe('normal');

    const above = summarizeVigor(
      months([
        0.7,
        0.7,
        0.7,
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        'cloudy',
        0.85,
        'cloudy',
        'cloudy',
      ]),
    );
    expect(above?.baseline).toBeCloseTo(0.7, 5);
    expect(above?.trend).toBe('above');
  });

  it('clamps barFraction to [0.04, 1]', () => {
    expect(barFraction(-0.2)).toBe(0.04);
    expect(barFraction(0.5)).toBe(0.5);
    expect(barFraction(1.4)).toBe(1);
  });

  it('renders no-location state without calling load when plot lacks coordinates and boundary', async () => {
    await i18n.changeLanguage('en');
    const load = jest.fn();

    renderWithTheme(
      <NdviCard
        plot={{ ...PLOT, latitude: null, longitude: null, boundary_geojson: null }}
        queryClient={freshClient()}
        load={load}
      />,
    );

    expect(screen.getByTestId('ndvi-card-no-location')).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });

  it('renders English vigor badges, 12 bars, accessible chart label, attribution, cache wording and all-cloudy state', async () => {
    await i18n.changeLanguage('en');
    const series = months([
      0.68,
      0.7,
      0.72,
      0.69,
      'cloudy',
      0.71,
      0.7,
      0.69,
      0.71,
      0.7,
      'no_data',
      0.72,
    ]);
    const load = jest.fn().mockResolvedValue(makeResult(series, 'cache'));

    const first = renderWithTheme(<NdviCard plot={PLOT} queryClient={freshClient()} load={load} />);

    expect(await screen.findByTestId('ndvi-card-content')).toBeTruthy();
    expect(screen.getByTestId('ndvi-card-level')).toHaveTextContent('High vigor');
    expect(screen.getByTestId('ndvi-card-trend')).toHaveTextContent('As usual');

    for (const key of MONTH_KEYS) {
      expect(screen.getByTestId(`ndvi-card-bar-${key}`)).toBeTruthy();
    }

    const chart = screen.getByTestId('ndvi-card-chart');
    expect(chart.props.accessibilityLabel).toEqual(
      expect.stringMatching(/^NDVI for the last 12 months\./),
    );
    expect(chart.props.accessibilityLabel).toContain('NDVI 0.72');
    expect(chart.props.accessibilityLabel).toContain('cloudy, no value');

    expect(screen.getByTestId('ndvi-card-attribution')).toHaveTextContent(ATTRIBUTION);
    expect(screen.getByTestId('ndvi-card-fetched-at')).toHaveTextContent(/Saved on this phone:/);
    first.unmount();

    const allCloudyLoad = jest
      .fn()
      .mockResolvedValue(
        makeResult(
          months([
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
            'cloudy',
          ]),
        ),
      );
    renderWithTheme(<NdviCard plot={PLOT} queryClient={freshClient()} load={allCloudyLoad} />);

    expect(await screen.findByTestId('ndvi-card-no-clear-month')).toHaveTextContent(
      'No recent month had clear images over this plot.',
    );
  });

  it('renders non-retryable quotaExceeded error and retryable offline error', async () => {
    await i18n.changeLanguage('en');
    const quotaLoad = jest.fn().mockRejectedValue(new NdviError('quotaExceeded'));

    const first = renderWithTheme(
      <NdviCard plot={PLOT} queryClient={freshClient()} load={quotaLoad} />,
    );

    expect(await screen.findByTestId('ndvi-card-error-quotaExceeded')).toHaveTextContent(
      'The daily satellite quota is used up. Try tomorrow.',
    );
    expect(screen.queryByTestId('ndvi-card-retry-btn')).toBeNull();
    first.unmount();

    const offlineLoad = jest.fn().mockRejectedValue(new NdviError('offline'));
    renderWithTheme(<NdviCard plot={PLOT} queryClient={freshClient()} load={offlineLoad} />);

    expect(await screen.findByTestId('ndvi-card-error-offline')).toBeTruthy();
    const retryBtn = screen.getByTestId('ndvi-card-retry-btn');
    fireEvent.press(retryBtn);
    await waitFor(() => expect(offlineLoad).toHaveBeenLastCalledWith(PLOT, true));
  });

  it('renders Spanish vigor level badge when language is es', async () => {
    await i18n.changeLanguage('es');
    const load = jest
      .fn()
      .mockResolvedValue(
        makeResult(months([0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.72])),
      );

    renderWithTheme(<NdviCard plot={PLOT} queryClient={freshClient()} load={load} />);

    expect(await screen.findByTestId('ndvi-card-level')).toHaveTextContent('Vigor alto');
  });
});
