import * as SQLite from 'expo-sqlite';

import { closeDatabase, getDatabase } from '../database';
import { farmsRepository, plotsRepository, scansRepository } from '../repositories';
import {
  attachCloudinaryPublicId,
  countPending,
  getPendingFarms,
  getPendingPlots,
  getPendingScans,
  markSyncResult,
} from '../syncQueue';

const mockDb = (SQLite as unknown as { __mockDb: { reset: () => void } }).__mockDb;

function createScan() {
  return scansRepository.create({
    crop: 'coffee',
    predicted_class: 'leaf_rust',
    severity: 'watch',
    confidence: 0.9,
    threshold: 0.5,
    is_low_confidence: false,
    model_version: 'coffee-v0.1.0',
    local_photo_uri: 'file:///mock/documents/scans/a.jpg',
  });
}

describe('sync queue', () => {
  beforeEach(() => {
    closeDatabase();
    mockDb.reset();
    getDatabase();
  });

  it('lists pending farms, plots and scans', () => {
    const farm = farmsRepository.create({ name: 'Finca', region: 'Tarrazú' });
    plotsRepository.create({ farm_id: farm.id, name: 'Lote 1', crop: 'coffee' });
    createScan();

    expect(getPendingFarms()).toHaveLength(1);
    expect(getPendingPlots()).toHaveLength(1);
    expect(getPendingScans()).toHaveLength(1);
    expect(countPending()).toBe(3);
  });

  it('marks a row synced without changing updated_at', () => {
    const farm = farmsRepository.create({ name: 'Finca', region: 'Tarrazú' });

    expect(markSyncResult('farms', farm.id, 'synced', farm.updated_at)).toBe(true);
    const stored = farmsRepository.getById(farm.id);
    expect(stored?.sync_status).toBe('synced');
    expect(stored?.updated_at).toBe(farm.updated_at);
    expect(countPending()).toBe(0);
  });

  it('keeps a row pending when it was edited during the sync', () => {
    const farm = farmsRepository.create({ name: 'Finca', region: 'Tarrazú' });
    const sentUpdatedAt = farm.updated_at;
    getDatabase().runSync(
      'UPDATE farms SET updated_at = ? WHERE id = ?',
      '2999-01-01T00:00:00.000Z',
      farm.id,
    );

    expect(markSyncResult('farms', farm.id, 'synced', sentUpdatedAt)).toBe(false);
    expect(farmsRepository.getById(farm.id)?.sync_status).toBe('pending');
  });

  it('attaches the Cloudinary public id and keeps the scan pending', () => {
    const scan = createScan();
    const updated = attachCloudinaryPublicId(scan.id, 'users/u1/scans/abc');

    expect(updated?.cloudinary_public_id).toBe('users/u1/scans/abc');
    expect(updated?.sync_status).toBe('pending');
  });
});
