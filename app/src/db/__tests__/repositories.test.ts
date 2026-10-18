import * as SQLite from 'expo-sqlite';

import { farmsRepository, initDatabase, plotsRepository, scansRepository } from '../index';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

describe('SQLite Repositories (Farms, Plots, Scans)', () => {
  beforeEach(() => {
    // Reset DB mock between tests
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
  });

  describe('initDatabase', () => {
    it('enables foreign key enforcement before creating the schema', () => {
      const execSpy = jest.spyOn(mockSQLite.__mockDb, 'execSync');
      initDatabase(mockSQLite.__mockDb);

      expect(execSpy.mock.calls[0]?.[0]).toMatch(/PRAGMA foreign_keys = ON/);
      expect(execSpy.mock.calls[1]?.[0]).toMatch(/CREATE TABLE IF NOT EXISTS scans/);
      execSpy.mockRestore();
    });
  });

  describe('FarmsRepository', () => {
    it('creates, retrieves, updates, soft-deletes, and restores a farm', () => {
      // 1. Create farm
      const farm = farmsRepository.create({
        name: 'Finca Los Santos',
        region: 'Tarrazú',
        altitude_m: 1650,
      });

      expect(farm.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(farm.name).toBe('Finca Los Santos');
      expect(farm.region).toBe('Tarrazú');
      expect(farm.altitude_m).toBe(1650);
      expect(farm.sync_status).toBe('pending');
      expect(farm.deleted_at).toBeNull();

      // 2. Retrieve
      const retrieved = farmsRepository.getById(farm.id);
      expect(retrieved?.name).toBe('Finca Los Santos');

      // 3. Update
      const updated = farmsRepository.update(farm.id, {
        altitude_m: 1700,
      });
      expect(updated?.altitude_m).toBe(1700);

      // 4. Soft Delete
      const deleted = farmsRepository.delete(farm.id);
      expect(deleted).toBe(true);

      const activeFarms = farmsRepository.getAll();
      expect(activeFarms.some((f) => f.id === farm.id)).toBe(false);

      const allFarms = farmsRepository.getAll(true);
      expect(allFarms.some((f) => f.id === farm.id)).toBe(true);

      // 5. Restore
      const restored = farmsRepository.restore(farm.id);
      expect(restored).toBe(true);
      expect(farmsRepository.getAll().some((f) => f.id === farm.id)).toBe(true);
    });
  });

  describe('PlotsRepository', () => {
    it('creates plot associated with a farm and filters by farm', () => {
      const farm = farmsRepository.create({
        name: 'Finca El Diamante',
        region: 'Valle Central',
      });

      const plot1 = plotsRepository.create({
        farm_id: farm.id,
        name: 'Lote Las Nubes',
        crop: 'coffee',
        area_ha: 3.5,
      });

      const plot2 = plotsRepository.create({
        farm_id: farm.id,
        name: 'Lote El Mirador',
        crop: 'coffee',
        area_ha: 2.0,
      });

      expect(plot2.name).toBe('Lote El Mirador');
      const farmPlots = plotsRepository.getByFarm(farm.id);
      expect(farmPlots.length).toBe(2);
      expect(farmPlots.map((p) => p.name)).toEqual(
        expect.arrayContaining(['Lote Las Nubes', 'Lote El Mirador']),
      );

      // Soft delete a plot
      plotsRepository.delete(plot1.id);
      expect(plotsRepository.getByFarm(farm.id).length).toBe(1);
      expect(plotsRepository.getByFarm(farm.id, true).length).toBe(2);
    });
  });

  describe('ScansRepository', () => {
    it('creates scan, queries with filters, updates location, and supports soft-delete + undo', () => {
      const farm = farmsRepository.create({
        name: 'Finca La Pastora',
        region: 'Tarrazú',
      });
      const plot = plotsRepository.create({
        farm_id: farm.id,
        name: 'Lote 1',
        crop: 'coffee',
      });

      // 1. Create coffee scan
      const scan = scansRepository.create({
        farm_id: farm.id,
        plot_id: plot.id,
        crop: 'coffee',
        predicted_class: 'leaf_rust',
        severity: 'actNow',
        confidence: 0.94,
        threshold: 0.79,
        is_low_confidence: false,
        model_version: 'v0.1.0-coffee-mobilenetv3large-float16',
        local_photo_uri: 'file:///mock/coffee_rust.jpg',
      });

      expect(scan.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(scan.predicted_class).toBe('leaf_rust');
      expect(scan.severity).toBe('actNow');
      expect(scan.is_low_confidence).toBe(0);
      expect(scan.sync_status).toBe('pending');

      // 2. Query with filters
      const coffeeScans = scansRepository.getAll({ crop: 'coffee' });
      expect(coffeeScans.length).toBe(1);

      const cacaoScans = scansRepository.getAll({ crop: 'cacao' });
      expect(cacaoScans.length).toBe(0);

      const actNowScans = scansRepository.getAll({ severity: 'actNow' });
      expect(actNowScans.length).toBe(1);

      // 3. Update location
      const updatedScan = scansRepository.updateLocation(scan.id, null, null);
      expect(updatedScan?.farm_id).toBeNull();
      expect(updatedScan?.plot_id).toBeNull();

      // 4. Update sync status
      const syncedScan = scansRepository.updateSyncStatus(scan.id, 'synced', 'cld_coffee_123');
      expect(syncedScan?.sync_status).toBe('synced');
      expect(syncedScan?.cloudinary_public_id).toBe('cld_coffee_123');

      // 5. Soft-delete and Restore (for swipe-to-delete with undo)
      const deleted = scansRepository.delete(scan.id);
      expect(deleted).toBe(true);
      expect(scansRepository.getAll().length).toBe(0);
      expect(scansRepository.getAll({ includeDeleted: true }).length).toBe(1);

      const restored = scansRepository.restore(scan.id);
      expect(restored).toBe(true);
      expect(scansRepository.getAll().length).toBe(1);
    });
  });
});
