import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as SQLite from 'expo-sqlite';

import { farmsRepository, initDatabase, plotsRepository, scansRepository } from '@/db';
import i18n from '@/i18n';
import { FarmsScreen, HistoryScreen, ScanDetailScreen } from '@/screens';
import { ThemeProvider } from '@/theme';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('History, ScanDetail, and Farms Screens', () => {
  beforeEach(async () => {
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
    await i18n.changeLanguage('es');
  });

  describe('HistoryScreen', () => {
    it('renders empty state when no scans exist', () => {
      const onScanNew = jest.fn();
      renderWithTheme(<HistoryScreen onScanNew={onScanNew} />);

      expect(screen.getByTestId('history-title')).toHaveTextContent('Historial de diagnósticos');
      expect(screen.getByTestId('history-empty-state')).toBeTruthy();
      expect(screen.getByTestId('history-count-badge')).toHaveTextContent('0');

      const scanBtn = screen.getByText('Escanear cultivo');
      fireEvent.press(scanBtn);
      expect(onScanNew).toHaveBeenCalledWith('coffee');
    });

    it('renders list of scans, filters by crop and severity, and supports delete with undo', async () => {
      // Seed a coffee scan and a cacao scan
      const scanCoffee = scansRepository.create({
        crop: 'coffee',
        predicted_class: 'leaf_rust',
        severity: 'actNow',
        confidence: 0.92,
        threshold: 0.79,
        is_low_confidence: false,
        model_version: 'v0.1.0-coffee-mobilenetv3large-float16',
        local_photo_uri: 'file:///mock/coffee_rust.jpg',
      });

      const scanCacao = scansRepository.create({
        crop: 'cacao',
        predicted_class: 'monilia',
        severity: 'watch',
        confidence: 0.85,
        threshold: 0.75,
        is_low_confidence: false,
        model_version: 'v0.1.0-cacao',
        local_photo_uri: 'file:///mock/cacao_monilia.jpg',
      });

      const onOpenScanDetail = jest.fn();
      renderWithTheme(<HistoryScreen onOpenScanDetail={onOpenScanDetail} />);

      expect(screen.getByTestId('history-count-badge')).toHaveTextContent('2');
      expect(screen.getByTestId(`scan-item-${scanCoffee.id}`)).toBeTruthy();
      expect(screen.getByTestId(`scan-item-${scanCacao.id}`)).toBeTruthy();

      // Tap on coffee item -> opens scan detail
      fireEvent.press(screen.getByTestId(`scan-item-${scanCoffee.id}`));
      expect(onOpenScanDetail).toHaveBeenCalledWith(scanCoffee.id);

      // Filter by Cacao
      const cacaoFilter = screen.getByTestId('filter-crop-cacao');
      fireEvent.press(cacaoFilter);

      expect(screen.getByTestId(`scan-item-${scanCacao.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`scan-item-${scanCoffee.id}`)).toBeNull();

      // Reset to All crops
      fireEvent.press(screen.getByTestId('filter-crop-all'));
      expect(screen.getByTestId(`scan-item-${scanCoffee.id}`)).toBeTruthy();

      // Delete coffee scan
      const deleteBtn = screen.getByTestId(`delete-scan-btn-${scanCoffee.id}`);
      fireEvent.press(deleteBtn);

      // Undo Toast should appear
      expect(screen.getByTestId('history-undo-toast')).toBeTruthy();
      expect(scansRepository.getAll().length).toBe(1);

      // Tap Undo in Toast
      const undoBtn = screen.getByText('Deshacer');
      fireEvent.press(undoBtn);

      // Scan should be restored
      expect(scansRepository.getAll().length).toBe(2);
      expect(screen.getByTestId(`scan-item-${scanCoffee.id}`)).toBeTruthy();
    });
  });

  describe('ScanDetailScreen', () => {
    it('renders scan details, assigns farm and plot, and allows deletion', () => {
      const farm = farmsRepository.create({
        name: 'Finca Aquiares',
        region: 'Turrialba',
      });
      const plot = plotsRepository.create({
        farm_id: farm.id,
        name: 'Lote Esperanza',
        crop: 'coffee',
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
        explanation_json: JSON.stringify({
          probabilities: { leaf_rust: 0.94, healthy: 0.06 },
        }),
      });

      const onBack = jest.fn();
      renderWithTheme(<ScanDetailScreen scanId={scan.id} onBack={onBack} />);

      expect(screen.getByTestId('scan-detail-title')).toHaveTextContent('Detalle del diagnóstico');
      expect(screen.getByTestId('scan-detail-disease-name')).toHaveTextContent(
        'Roya del café (Hemileia vastatrix)',
      );
      expect(screen.getByTestId('scan-detail-location-text')).toHaveTextContent(
        'Sin finca asignada',
      );

      // Open assign sheet
      const assignBtn = screen.getByTestId('scan-detail-assign-btn');
      fireEvent.press(assignBtn);

      expect(screen.getByTestId('assign-location-sheet')).toBeTruthy();

      // Select farm and plot
      fireEvent.press(screen.getByTestId(`select-farm-${farm.id}`));
      fireEvent.press(screen.getByTestId(`select-plot-${plot.id}`));

      // Confirm assignment
      const confirmBtn = screen.getByTestId('confirm-location-btn');
      fireEvent.press(confirmBtn);

      // Location card should now display assigned farm and plot
      expect(screen.getByTestId('scan-detail-location-text')).toHaveTextContent(
        'Finca Aquiares • Lote Esperanza',
      );

      // Delete scan
      const deleteBtn = screen.getByTestId('scan-detail-delete-btn');
      fireEvent.press(deleteBtn);

      expect(scansRepository.getById(scan.id)?.deleted_at).not.toBeNull();
      expect(onBack).toHaveBeenCalled();
    });
  });

  describe('FarmsScreen', () => {
    it('creates farm, adds plots, and manages them', () => {
      const onBack = jest.fn();
      renderWithTheme(<FarmsScreen onBack={onBack} />);

      expect(screen.getByTestId('farms-title')).toHaveTextContent('Fincas y Lotes');
      expect(screen.getByTestId('farms-empty-state')).toBeTruthy();

      // Tap Add Farm
      const addFarmHeaderBtn = screen.getByTestId('header-add-farm-btn');
      fireEvent.press(addFarmHeaderBtn);

      // Fill in farm details
      fireEvent.changeText(screen.getByTestId('new-farm-name-input'), 'Hacienda Sonora');
      fireEvent.changeText(screen.getByTestId('new-farm-region-input'), 'Alajuela, Poás');
      fireEvent.changeText(screen.getByTestId('new-farm-altitude-input'), '1300');

      // Submit farm
      fireEvent.press(screen.getByTestId('submit-new-farm-btn'));

      const farms = farmsRepository.getAll();
      expect(farms.length).toBe(1);
      const firstFarm = farms[0];
      expect(firstFarm).toBeDefined();
      if (!firstFarm) return;
      const farmId = firstFarm.id;

      expect(screen.getByTestId(`farm-name-${farmId}`)).toHaveTextContent('Hacienda Sonora');

      // Add a plot to this farm
      const addPlotBtn = screen.getByTestId(`add-plot-btn-${farmId}`);
      fireEvent.press(addPlotBtn);

      fireEvent.changeText(screen.getByTestId('new-plot-name-input'), 'Lote Geisha');
      fireEvent.press(screen.getByTestId('plot-crop-coffee'));
      fireEvent.changeText(screen.getByTestId('new-plot-area-input'), '4.2');

      fireEvent.press(screen.getByTestId('submit-new-plot-btn'));

      const plots = plotsRepository.getByFarm(farmId);
      expect(plots.length).toBe(1);
      const firstPlot = plots[0];
      expect(firstPlot).toBeDefined();
      if (!firstPlot) return;
      expect(screen.getByTestId(`plot-name-${firstPlot.id}`)).toHaveTextContent('Lote Geisha');
      expect(screen.getByTestId(`plot-area-${firstPlot.id}`)).toHaveTextContent('4.2 ha');

      // Delete the plot
      const deletePlotBtn = screen.getByTestId(`delete-plot-${firstPlot.id}`);
      fireEvent.press(deletePlotBtn);
      expect(plotsRepository.getByFarm(farmId).length).toBe(0);
    });
  });
});
