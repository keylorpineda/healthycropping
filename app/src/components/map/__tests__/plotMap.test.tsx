import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as SQLite from 'expo-sqlite';

import {
  type BoundaryPoint,
  farmsRepository,
  initDatabase,
  parseBoundaryGeoJson,
  plotsRepository,
} from '@/db';
import i18n from '@/i18n';
import { PlotDetailScreen, PlotMapScreen } from '@/screens';
import { weatherRiskQueryClient } from '@/services/weatherRisk';
import { ThemeProvider } from '@/theme';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

const SQUARE: BoundaryPoint[] = [
  { latitude: 9.66, longitude: -84.023 },
  { latitude: 9.66, longitude: -84.022 },
  { latitude: 9.661, longitude: -84.022 },
  { latitude: 9.661, longitude: -84.023 },
];

function tapFeature(point: BoundaryPoint): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Point',
      coordinates: [point.longitude, point.latitude],
    },
  };
}

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('plot map UI', () => {
  beforeEach(async () => {
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    weatherRiskQueryClient.clear();
  });

  it('requires at least 3 distinct points before saving a boundary', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({ farm_id: farm.id, name: 'Lote Norte', crop: 'coffee' });

    renderWithTheme(<PlotMapScreen plotId={plot.id} />);

    expect(screen.getByTestId('plot-map-hint')).toHaveTextContent(
      'Tap the map to mark each corner of the plot.',
    );
    expect(screen.getByTestId('plot-map-count')).toHaveTextContent('0 points');

    fireEvent.press(screen.getByTestId('plot-map-save-btn'));

    expect(screen.getByTestId('plot-map-hint')).toHaveTextContent(
      'Mark at least 3 distinct points.',
    );
    expect(plotsRepository.getById(plot.id)?.boundary_geojson).toBeNull();
  });

  it('draws vertices, computes area, undoes a vertex, saves the boundary and sets a center', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({ farm_id: farm.id, name: 'Lote Norte', crop: 'coffee' });
    const onDone = jest.fn();

    renderWithTheme(<PlotMapScreen plotId={plot.id} onDone={onDone} />);

    const mapView = screen.getByTestId('plot-map-view');
    for (const point of SQUARE) {
      fireEvent(mapView, 'press', tapFeature(point));
    }

    expect(screen.getByTestId('plot-map-count')).toHaveTextContent('4 points');
    expect(screen.getByTestId('plot-map-hint')).toHaveTextContent('Drawn area: 1.22 ha');

    fireEvent.press(screen.getByTestId('plot-map-undo-btn'));
    expect(screen.getByTestId('plot-map-count')).toHaveTextContent('3 points');

    fireEvent.press(screen.getByTestId('plot-map-save-btn'));
    expect(onDone).toHaveBeenCalledTimes(1);

    const saved = plotsRepository.getById(plot.id);
    expect(saved?.boundary_geojson).not.toBeNull();
    const expectedPoints = SQUARE.slice(0, 3);
    expect(parseBoundaryGeoJson(saved?.boundary_geojson)).toEqual(expectedPoints);

    const avgLat = expectedPoints.reduce((acc, p) => acc + p.latitude, 0) / expectedPoints.length;
    const avgLon = expectedPoints.reduce((acc, p) => acc + p.longitude, 0) / expectedPoints.length;
    expect(saved?.latitude).toBeCloseTo(avgLat, 6);
    expect(saved?.longitude).toBeCloseTo(avgLon, 6);
  });

  it('keeps existing plot coordinates unchanged when saving a boundary', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({
      farm_id: farm.id,
      name: 'Lote Con Punto',
      crop: 'coffee',
      latitude: 9.7,
      longitude: -84.1,
    });

    renderWithTheme(<PlotMapScreen plotId={plot.id} />);

    const mapView = screen.getByTestId('plot-map-view');
    for (const point of SQUARE.slice(0, 3)) {
      fireEvent(mapView, 'press', tapFeature(point));
    }

    fireEvent.press(screen.getByTestId('plot-map-save-btn'));

    const saved = plotsRepository.getById(plot.id);
    expect(saved?.latitude).toBe(9.7);
    expect(saved?.longitude).toBe(-84.1);
    expect(parseBoundaryGeoJson(saved?.boundary_geojson)).toEqual(SQUARE.slice(0, 3));
  });

  it('disables undo and clear when empty and clears drawn points', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({ farm_id: farm.id, name: 'Lote Norte', crop: 'coffee' });

    renderWithTheme(<PlotMapScreen plotId={plot.id} />);

    const undoBtn = screen.getByTestId('plot-map-undo-btn');
    const clearBtn = screen.getByTestId('plot-map-clear-btn');
    expect(undoBtn).toBeDisabled();
    expect(clearBtn).toBeDisabled();

    const mapView = screen.getByTestId('plot-map-view');
    for (const point of SQUARE.slice(0, 2)) {
      fireEvent(mapView, 'press', tapFeature(point));
    }
    expect(screen.getByTestId('plot-map-count')).toHaveTextContent('2 points');
    expect(undoBtn).not.toBeDisabled();
    expect(clearBtn).not.toBeDisabled();

    fireEvent.press(clearBtn);
    expect(screen.getByTestId('plot-map-count')).toHaveTextContent('0 points');
    expect(undoBtn).toBeDisabled();
    expect(clearBtn).toBeDisabled();
  });

  it('loads a saved boundary and removes it on request', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({
      farm_id: farm.id,
      name: 'Lote Demarcado',
      crop: 'coffee',
      boundary: SQUARE,
    });
    const onDone = jest.fn();

    renderWithTheme(<PlotMapScreen plotId={plot.id} onDone={onDone} />);

    expect(screen.getByTestId('plot-map-count')).toHaveTextContent('4 points');
    const removeBtn = screen.getByTestId('plot-map-remove-btn');
    expect(removeBtn).toBeTruthy();

    fireEvent.press(removeBtn);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(plotsRepository.getById(plot.id)?.boundary_geojson).toBeNull();
  });

  it('shows not found for a missing plot id', () => {
    renderWithTheme(<PlotMapScreen plotId="missing-plot-id" />);
    expect(screen.getByTestId('plot-map-not-found')).toBeTruthy();
  });

  it('renders map preview, draw/edit button and OSM attribution on PlotDetailScreen', () => {
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const emptyPlot = plotsRepository.create({
      farm_id: farm.id,
      name: 'Lote Sin Mapa',
      crop: 'coffee',
    });
    const onOpenMap = jest.fn();

    const first = renderWithTheme(<PlotDetailScreen plotId={emptyPlot.id} onOpenMap={onOpenMap} />);

    expect(screen.getByTestId('plot-detail-no-boundary')).toBeTruthy();
    const openBtn = screen.getByTestId('plot-detail-open-map-btn');
    expect(openBtn).toHaveTextContent('Draw boundary');
    fireEvent.press(openBtn);
    expect(onOpenMap).toHaveBeenCalledTimes(1);
    first.unmount();

    const mappedPlot = plotsRepository.create({
      farm_id: farm.id,
      name: 'Lote Con Mapa',
      crop: 'coffee',
      boundary: SQUARE,
    });

    renderWithTheme(<PlotDetailScreen plotId={mappedPlot.id} onOpenMap={onOpenMap} />);

    expect(screen.getByTestId('plot-detail-map')).toBeTruthy();
    expect(screen.getByTestId('plot-detail-open-map-btn')).toHaveTextContent('Edit boundary');
    expect(screen.getByText('© OpenStreetMap contributors')).toBeTruthy();
  });

  it('shows the Spanish hint on PlotMapScreen when language is es', async () => {
    await i18n.changeLanguage('es');
    const farm = farmsRepository.create({ name: 'Finca Aquiares', region: 'Turrialba' });
    const plot = plotsRepository.create({ farm_id: farm.id, name: 'Lote Norte', crop: 'coffee' });

    renderWithTheme(<PlotMapScreen plotId={plot.id} />);

    expect(screen.getByTestId('plot-map-hint')).toHaveTextContent(
      'Toque el mapa para marcar cada esquina del lote.',
    );
  });
});
