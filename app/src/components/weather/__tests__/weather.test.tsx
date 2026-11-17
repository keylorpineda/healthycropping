import React from 'react';
import { Linking } from 'react-native';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SQLite from 'expo-sqlite';

import RISK_PAYLOAD from '../../../services/fixtures/weather_risk.json';
import { WeatherAlertBanner, WeatherRiskCard } from '@/components/weather';
import { farmsRepository, initDatabase, plotsRepository, type Plot } from '@/db';
import i18n from '@/i18n';
import { PlotDetailScreen } from '@/screens';
import {
  parseWeatherRisk,
  WeatherRiskError,
  type WeatherRisk,
  type WeatherRiskResult,
} from '@/services/weatherRisk';
import { ThemeProvider } from '@/theme';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

const RISK = parseWeatherRisk(RISK_PAYLOAD) as WeatherRisk;

const PLOT: Plot = {
  id: 'plot-1',
  farm_id: 'farm-1',
  name: 'Lote Alto',
  crop: 'coffee',
  area_ha: null,
  latitude: 9.6611,
  longitude: -84.0225,
  boundary_geojson: null,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  deleted_at: null,
  sync_status: 'synced',
};

function result(source: 'network' | 'cache', risk: WeatherRisk = RISK): WeatherRiskResult {
  return { risk, source, fetchedAt: '2026-11-15T12:00:00.000Z' };
}

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function freshClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

describe('weather risk UI', () => {
  beforeEach(async () => {
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
    await i18n.changeLanguage('es');
  });

  it('shows levels, favourable days, sources, disclaimer and the CC BY attribution', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const load = jest.fn().mockResolvedValue(result('cache'));

    renderWithTheme(<WeatherRiskCard plot={PLOT} queryClient={freshClient()} load={load} />);

    expect(await screen.findByTestId('weather-risk-card-content')).toBeTruthy();
    expect(screen.getByTestId('weather-risk-card-leaf_rust-level')).toHaveTextContent('Alto');
    expect(screen.getByText('Últimos 7 días: 4 con clima favorable a la enfermedad.')).toBeTruthy();
    expect(screen.getByText(/Capucho, A. S. et al. \(2013\)/)).toBeTruthy();
    expect(screen.getByText(/umbrales son provisionales/)).toBeTruthy();
    expect(screen.getByTestId('weather-risk-card-disclaimer')).toHaveTextContent(
      /no es un diagnóstico/,
    );
    expect(screen.getByTestId('weather-risk-card-fetched-at')).toHaveTextContent(
      /Guardado en este teléfono/,
    );
    const attribution = screen.getByTestId('weather-risk-card-attribution');
    expect(attribution).toHaveTextContent('Datos del clima de Open-Meteo.com (CC BY 4.0)');
    fireEvent.press(attribution);
    expect(openSpy).toHaveBeenCalledWith('https://open-meteo.com/');

    fireEvent.press(screen.getByTestId('weather-risk-card-refresh-btn'));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(PLOT, true));
  });

  it('asks for a location and explains failures in the current language', async () => {
    const first = renderWithTheme(
      <WeatherRiskCard
        plot={{ ...PLOT, latitude: null, longitude: null }}
        queryClient={freshClient()}
        load={jest.fn()}
      />,
    );
    expect(screen.getByTestId('weather-risk-card-no-location')).toBeTruthy();
    first.unmount();

    await i18n.changeLanguage('en');
    const load = jest.fn().mockRejectedValue(new WeatherRiskError('notSynced'));
    renderWithTheme(
      <WeatherRiskCard plot={PLOT} queryClient={freshClient()} load={load} testID="other" />,
    );
    expect(await screen.findByTestId('other-error-notSynced')).toHaveTextContent(
      'The plot has not synced yet. Connect and try again.',
    );
  });

  it('shows the top alert on Home and opens its plot', async () => {
    const onOpenPlot = jest.fn();
    const moderate: WeatherRisk = {
      ...RISK,
      risks: RISK.risks.map((risk) => ({ ...risk, level: 'moderate' as const })),
    };
    const other: Plot = { ...PLOT, id: 'plot-2', name: 'Lote Bajo' };
    const load = jest.fn(async (plot: { id: string }) =>
      result('cache', plot.id === 'plot-2' ? RISK : moderate),
    );

    renderWithTheme(
      <WeatherAlertBanner
        onOpenPlot={onOpenPlot}
        queryClient={freshClient()}
        loadPlots={() => [PLOT, other]}
        load={load}
      />,
    );

    const open = await screen.findByTestId('weather-alert-banner-open');
    expect(open).toHaveTextContent(
      /Riesgo alto de Roya del café \(Hemileia vastatrix\) en Lote Bajo/,
    );
    expect(open).toHaveTextContent(/1 alerta\(s\) más/);
    expect(screen.getByTestId('weather-alert-banner-attribution')).toHaveTextContent(
      /Open-Meteo.com \(CC BY 4.0\)/,
    );
    fireEvent.press(open);
    expect(onOpenPlot).toHaveBeenCalledWith('plot-2');
  });

  it('renders nothing on Home when no plot has a moderate or high risk', async () => {
    const load = jest.fn().mockResolvedValue(
      result('cache', {
        ...RISK,
        risks: RISK.risks.map((r) => ({ ...r, level: 'low' as const })),
      }),
    );
    renderWithTheme(
      <WeatherAlertBanner queryClient={freshClient()} loadPlots={() => [PLOT]} load={load} />,
    );
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(screen.queryByTestId('weather-alert-banner')).toBeNull();
  });

  it('sets a location on Plot Detail and rejects half a location', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({ farm_id: farm.id, name: 'Lote Viejo', crop: 'coffee' });

    renderWithTheme(<PlotDetailScreen plotId={plot.id} />);

    expect(screen.getByTestId('plot-detail-title')).toHaveTextContent('Lote Viejo');
    expect(screen.getByTestId('plot-detail-location')).toHaveTextContent(
      'Sin ubicación registrada.',
    );
    expect(screen.getByTestId('weather-risk-card-no-location')).toBeTruthy();

    fireEvent.press(screen.getByTestId('plot-detail-edit-location-btn'));
    fireEvent.changeText(screen.getByTestId('plot-detail-latitude-input'), '9.6611');
    fireEvent.press(screen.getByTestId('plot-detail-save-location-btn'));
    expect(screen.getByTestId('plot-detail-location-hint')).toHaveTextContent(
      'Ingrese latitud y longitud, o deje ambas vacías.',
    );

    fireEvent.changeText(screen.getByTestId('plot-detail-longitude-input'), '-84.0225');
    fireEvent.press(screen.getByTestId('plot-detail-save-location-btn'));

    const saved = plotsRepository.getById(plot.id);
    expect([saved?.latitude, saved?.longitude, saved?.sync_status]).toEqual([
      9.6611,
      -84.0225,
      'pending',
    ]);
    expect(screen.getByTestId('plot-detail-location')).toHaveTextContent(
      'Ubicación: 9.6611, -84.0225',
    );
  });

  it('shows not found for a missing plot', () => {
    renderWithTheme(<PlotDetailScreen plotId="missing" />);
    expect(screen.getByTestId('plot-detail-not-found')).toBeTruthy();
  });
});
