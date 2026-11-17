import React from 'react';
import { render, screen } from '@testing-library/react-native';
import * as SQLite from 'expo-sqlite';

import { farmsRepository, initDatabase, plotsRepository, scansRepository } from '@/db';
import i18n from '@/i18n';
import { PlotDetailScreen } from '@/screens';
import { weatherRiskQueryClient } from '@/services/weatherRisk';
import { ThemeProvider } from '@/theme';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('PlotDetailScreen hotspots', () => {
  beforeEach(async () => {
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    weatherRiskQueryClient.clear();
  });

  it('shows plot-detail-hotspots with mappable scan counts and ignores low-confidence or unlocated scans', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({
      farm_id: farm.id,
      name: 'Lote Norte',
      crop: 'coffee',
      latitude: 9.66,
      longitude: -84.023,
    });

    scansRepository.create({
      farm_id: farm.id,
      plot_id: plot.id,
      crop: 'coffee',
      predicted_class: 'leaf_rust',
      severity: 'actNow',
      confidence: 0.91,
      threshold: 0.7,
      is_low_confidence: false,
      model_version: '0.1.0',
      local_photo_uri: 'file:///mock/actnow.jpg',
      latitude: 9.66,
      longitude: -84.023,
    });

    scansRepository.create({
      farm_id: farm.id,
      plot_id: plot.id,
      crop: 'coffee',
      predicted_class: 'cercospora',
      severity: 'watch',
      confidence: 0.85,
      threshold: 0.7,
      is_low_confidence: false,
      model_version: '0.1.0',
      local_photo_uri: 'file:///mock/watch.jpg',
      latitude: 9.6605,
      longitude: -84.0225,
    });

    scansRepository.create({
      farm_id: farm.id,
      plot_id: plot.id,
      crop: 'coffee',
      predicted_class: 'leaf_rust',
      severity: 'actNow',
      confidence: 0.45,
      threshold: 0.7,
      is_low_confidence: true,
      model_version: '0.1.0',
      local_photo_uri: 'file:///mock/lowconf.jpg',
      latitude: 9.6602,
      longitude: -84.0228,
    });

    scansRepository.create({
      farm_id: farm.id,
      plot_id: plot.id,
      crop: 'coffee',
      predicted_class: 'leaf_rust',
      severity: 'actNow',
      confidence: 0.93,
      threshold: 0.7,
      is_low_confidence: false,
      model_version: '0.1.0',
      local_photo_uri: 'file:///mock/noloc.jpg',
      latitude: null,
      longitude: null,
    });

    renderWithTheme(<PlotDetailScreen plotId={plot.id} />);

    expect(screen.getByTestId('plot-detail-hotspots')).toBeTruthy();
    expect(screen.getByTestId('plot-detail-hotspots-count-actNow')).toHaveTextContent('Act Now: 1');
    expect(screen.getByTestId('plot-detail-hotspots-count-watch')).toHaveTextContent('Watch: 1');
  });

  it('does not render plot-detail-hotspots for a plot without scans', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({
      farm_id: farm.id,
      name: 'Lote Vacio',
      crop: 'coffee',
      latitude: 9.66,
      longitude: -84.023,
    });

    renderWithTheme(<PlotDetailScreen plotId={plot.id} />);

    expect(screen.queryByTestId('plot-detail-hotspots')).toBeNull();
  });
});
