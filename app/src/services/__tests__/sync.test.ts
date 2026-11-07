import * as SQLite from 'expo-sqlite';

import {
  closeDatabase,
  farmsRepository,
  getDatabase,
  plotsRepository,
  scansRepository,
} from '@/db';
import { ApiError, type ApiClient, type RequestOptions } from '../api';
import { UploadError } from '../cloudinary';
import {
  type ScanPayload,
  type ScanSyncResult,
  SyncInterruptedError,
  syncAll,
  toScanPayload,
} from '../sync';

jest.mock('../auth', () => ({ getIdToken: jest.fn().mockResolvedValue(null) }));

const mockDb = (SQLite as unknown as { __mockDb: { reset: () => void } }).__mockDb;

type Doc = Record<string, unknown>;

/** In-memory stand-in for the FastAPI contract used by the sync engine. */
class FakeApi {
  farms = new Map<string, Doc>();
  plots = new Map<string, Doc>();
  scans = new Map<string, ScanPayload>();
  calls: string[] = [];
  offline = false;
  rejectScanIds = new Set<string>();

  client: ApiClient = {
    isConfigured: true,
    request: <T>(path: string, options: RequestOptions = {}) =>
      this.handle(path, options) as Promise<T>,
  };

  private async handle(path: string, { method = 'GET', body }: RequestOptions): Promise<unknown> {
    this.calls.push(`${method} ${path}`);
    if (this.offline) {
      throw new ApiError(0, 'network');
    }
    const [, collection, id] = path.split('/');
    const payload = body as Doc;

    if (collection === 'scans') {
      const results: ScanSyncResult[] = (payload.scans as ScanPayload[]).map((scan) => {
        if (this.rejectScanIds.has(scan.id)) {
          return { id: scan.id, status: 'rejected', code: 'farm_not_found' };
        }
        const existing = this.scans.get(scan.id);
        if (existing && existing.updated_at >= scan.updated_at) {
          return { id: scan.id, status: 'unchanged' };
        }
        this.scans.set(scan.id, scan);
        return { id: scan.id, status: existing ? 'updated' : 'created' };
      });
      return { results };
    }

    const store = collection === 'farms' ? this.farms : this.plots;
    if (method === 'POST') {
      if (collection === 'plots' && !this.farms.has(payload.farm_id as string)) {
        throw new ApiError(404, 'farm_not_found');
      }
      if (store.has(payload.id as string)) {
        throw new ApiError(409, 'already_exists');
      }
      store.set(payload.id as string, payload);
      return payload;
    }
    if (!id || !store.has(id)) {
      throw new ApiError(404, 'not_found');
    }
    if (method === 'PATCH') {
      store.set(id, { ...store.get(id), ...payload });
      return store.get(id);
    }
    store.delete(id);
    return undefined;
  }
}

function createScan(farmId: string | null = null) {
  return scansRepository.create({
    farm_id: farmId,
    crop: 'coffee',
    predicted_class: 'leaf_rust',
    severity: 'watch',
    confidence: 0.91,
    threshold: 0.5,
    is_low_confidence: false,
    model_version: 'coffee-v0.1.0',
    local_photo_uri: 'file:///mock/documents/scans/a.jpg',
  });
}

describe('sync engine', () => {
  let api: FakeApi;
  let uploadPhoto: jest.Mock;

  beforeEach(() => {
    closeDatabase();
    mockDb.reset();
    getDatabase();
    api = new FakeApi();
    uploadPhoto = jest.fn((scanId: string) => Promise.resolve(`users/u1/scans/${scanId}`));
  });

  const run = () => syncAll({ api: api.client, uploadPhoto });

  it('pushes farms, plots and scans in order and marks them synced', async () => {
    const farm = farmsRepository.create({ name: 'Finca', region: 'Tarrazú' });
    const plot = plotsRepository.create({ farm_id: farm.id, name: 'Lote 1', crop: 'coffee' });
    const scan = createScan(farm.id);

    await expect(run()).resolves.toEqual({ synced: 3, failed: 0, photosUploaded: 1 });

    expect(api.calls).toEqual(['POST /farms', 'POST /plots', 'POST /scans/sync']);
    expect(api.plots.get(plot.id)).toMatchObject({ farm_id: farm.id });
    expect(api.scans.get(scan.id)).toMatchObject({
      is_low_confidence: false,
      cloudinary_public_id: `users/u1/scans/${scan.id}`,
    });
    expect(farmsRepository.getById(farm.id)?.sync_status).toBe('synced');
    expect(plotsRepository.getById(plot.id)?.sync_status).toBe('synced');
    expect(scansRepository.getById(scan.id)?.sync_status).toBe('synced');
  });

  it('never sends device-only columns', () => {
    const payload = toScanPayload(createScan());
    expect(payload).not.toHaveProperty('local_photo_uri');
    expect(payload).not.toHaveProperty('sync_status');
    expect(payload).not.toHaveProperty('explanation_json');
  });

  it('is idempotent: a second run sends nothing and an edit falls back to PATCH', async () => {
    const farm = farmsRepository.create({ name: 'Finca', region: 'Tarrazú' });
    await run();
    api.calls = [];

    await expect(run()).resolves.toEqual({ synced: 0, failed: 0, photosUploaded: 0 });
    expect(api.calls).toEqual([]);

    farmsRepository.update(farm.id, { name: 'Finca Nueva' });
    await run();
    expect(api.calls).toEqual(['POST /farms', 'PATCH /farms/' + farm.id]);
    expect(api.farms.get(farm.id)).toMatchObject({ name: 'Finca Nueva' });
  });

  it('stops when offline, keeps everything pending, and resumes later', async () => {
    const farm = farmsRepository.create({ name: 'Finca', region: 'Tarrazú' });
    createScan(farm.id);
    api.offline = true;

    await expect(run()).rejects.toEqual(new SyncInterruptedError('offline'));
    expect(farmsRepository.getById(farm.id)?.sync_status).toBe('pending');

    api.offline = false;
    await expect(run()).resolves.toMatchObject({ synced: 2, failed: 0 });
  });

  it('stops when the photo upload loses the connection', async () => {
    const scan = createScan();
    uploadPhoto.mockRejectedValueOnce(new UploadError('network'));

    await expect(run()).rejects.toEqual(new SyncInterruptedError('offline'));
    expect(scansRepository.getById(scan.id)?.sync_status).toBe('pending');
  });

  it('syncs the diagnosis without a photo when uploads are unavailable', async () => {
    const scan = createScan();
    uploadPhoto.mockRejectedValueOnce(new UploadError('unavailable'));

    await expect(run()).resolves.toMatchObject({ synced: 1, photosUploaded: 0 });
    expect(api.scans.get(scan.id)?.cloudinary_public_id).toBeNull();
  });

  it('marks rejected records as failed', async () => {
    const orphan = plotsRepository.create({
      farm_id: '00000000-0000-4000-8000-00000000ffff',
      name: 'Huérfano',
      crop: 'cacao',
    });
    const scan = createScan();
    api.rejectScanIds.add(scan.id);

    await expect(run()).resolves.toMatchObject({ synced: 0, failed: 2 });
    expect(plotsRepository.getById(orphan.id)?.sync_status).toBe('failed');
    expect(scansRepository.getById(scan.id)?.sync_status).toBe('failed');
  });

  it('sends deletions after upserts and treats unknown records as already deleted', async () => {
    const synced = farmsRepository.create({ name: 'Vieja', region: 'Naranjo' });
    await run();
    farmsRepository.delete(synced.id);
    const neverSynced = farmsRepository.create({ name: 'Temporal', region: 'Naranjo' });
    farmsRepository.delete(neverSynced.id);
    api.calls = [];

    await expect(run()).resolves.toMatchObject({ synced: 2, failed: 0 });
    expect(api.calls).toEqual([`DELETE /farms/${synced.id}`, `DELETE /farms/${neverSynced.id}`]);
    expect(api.farms.has(synced.id)).toBe(false);
  });

  it('splits scans into batches of 100', async () => {
    for (let i = 0; i < 150; i += 1) {
      createScan();
    }

    await expect(run()).resolves.toMatchObject({ synced: 150 });
    expect(api.calls.filter((call) => call === 'POST /scans/sync')).toHaveLength(2);
  });
});
