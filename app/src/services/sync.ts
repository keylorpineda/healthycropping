import {
  attachCloudinaryPublicId,
  type Farm,
  getPendingFarms,
  getPendingPlots,
  getPendingScans,
  markSyncResult,
  type Plot,
  type Scan,
  type SyncTable,
} from '@/db';

import { type ApiClient, ApiError, apiClient } from './api';
import { uploadScanPhoto, UploadError } from './cloudinary';

/**
 * SQLite-to-API sync worker.
 *
 * Every record carries a client UUID, so each step is idempotent: re-sending a
 * farm or plot that already exists falls back from `POST` to `PATCH`, deleting
 * an already-deleted record is a no-op, and `POST /scans/sync` is last write
 * wins on `updated_at`. A run that stops halfway (dropped connection, expired
 * session) can simply be repeated.
 *
 * Order: farms, then plots, then scans, then plot and farm deletions, so the API
 * always knows a farm before its plots and a plot before the scans that point at
 * it, and scans are stored before their farm is removed.
 */

export const SCAN_BATCH_SIZE = 100; // MAX_SYNC_BATCH in api/src/healthycropping_api/schemas.py

/** `POST /farms` body; mirrors `FarmCreate`. `PATCH` sends the same fields without `id`. */
export interface FarmPayload {
  id: string;
  name: string;
  region: string;
  altitude_m: number | null;
}

/** `POST /plots` body; mirrors `PlotCreate`. */
export interface PlotPayload {
  id: string;
  farm_id: string;
  name: string;
  crop: string;
  area_ha: number | null;
}

/** One item of `POST /scans/sync`; mirrors `ScanIn` (no device-only columns). */
export interface ScanPayload {
  id: string;
  farm_id: string | null;
  plot_id: string | null;
  crop: string;
  predicted_class: string;
  severity: string;
  confidence: number;
  threshold: number;
  is_low_confidence: boolean;
  model_version: string;
  cloudinary_public_id: string | null;
  scanned_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Mirrors `ScanSyncResult`. */
/** Mirrors `SyncStatus` in the API schemas. */
export const SCAN_SYNC_STATUSES = ['created', 'updated', 'unchanged', 'rejected'] as const;

export interface ScanSyncResult {
  id: string;
  status: (typeof SCAN_SYNC_STATUSES)[number];
  code?: string | null;
}

export function toFarmPayload(farm: Farm): FarmPayload {
  return { id: farm.id, name: farm.name, region: farm.region, altitude_m: farm.altitude_m };
}

export function toPlotPayload(plot: Plot): PlotPayload {
  return {
    id: plot.id,
    farm_id: plot.farm_id,
    name: plot.name,
    crop: plot.crop,
    area_ha: plot.area_ha,
  };
}

/** `PATCH` body for a farm or plot: the create payload without its `id`. */
export function toPatchBody<T extends { id: string }>(payload: T): Omit<T, 'id'> {
  const changes: Partial<T> = { ...payload };
  delete changes.id;
  return changes as Omit<T, 'id'>;
}

export function toScanPayload(scan: Scan): ScanPayload {
  return {
    id: scan.id,
    farm_id: scan.farm_id,
    plot_id: scan.plot_id,
    crop: scan.crop,
    predicted_class: scan.predicted_class,
    severity: scan.severity,
    confidence: scan.confidence,
    threshold: scan.threshold,
    is_low_confidence: scan.is_low_confidence === 1,
    model_version: scan.model_version,
    cloudinary_public_id: scan.cloudinary_public_id,
    scanned_at: scan.scanned_at,
    updated_at: scan.updated_at,
    deleted_at: scan.deleted_at,
  };
}

export type SyncStopReason = 'offline' | 'unauthorized' | 'server';

/** Thrown when a run has to stop early; untouched records stay `pending`. */
export class SyncInterruptedError extends Error {
  readonly reason: SyncStopReason;

  constructor(reason: SyncStopReason) {
    super(reason);
    this.name = 'SyncInterruptedError';
    this.reason = reason;
  }
}

export interface SyncReport {
  synced: number;
  failed: number;
  photosUploaded: number;
}

export interface SyncDeps {
  api?: ApiClient;
  uploadPhoto?: typeof uploadScanPhoto;
}

type Outcome = 'synced' | 'failed';

/**
 * Decide what an API error means for the whole run. Transport errors, `401`, rate
 * limits and server errors stop the run (retry later); any other `4xx` means the
 * API refuses this record, which is marked `failed` until it is edited again.
 */
function classify(error: unknown): 'recordRejected' {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      throw new SyncInterruptedError('offline');
    }
    if (error.status === 401) {
      throw new SyncInterruptedError('unauthorized');
    }
    if (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
      return 'recordRejected';
    }
  }
  throw new SyncInterruptedError('server');
}

function isStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

async function deleteRemote(api: ApiClient, path: string): Promise<Outcome> {
  try {
    await api.request<undefined>(path, { method: 'DELETE' });
    return 'synced';
  } catch (error) {
    // Already gone, or never created because it was deleted before its first sync.
    if (isStatus(error, 404)) {
      return 'synced';
    }
    classify(error);
    return 'failed';
  }
}

async function upsertRemote(
  api: ApiClient,
  collection: '/farms' | '/plots',
  payload: FarmPayload | PlotPayload,
): Promise<Outcome> {
  try {
    await api.request(collection, { method: 'POST', body: payload });
    return 'synced';
  } catch (error) {
    if (!isStatus(error, 409)) {
      classify(error);
      return 'failed';
    }
  }
  // 409: the record already exists (an earlier run or an edit after sync).
  try {
    await api.request(`${collection}/${payload.id}`, {
      method: 'PATCH',
      body: toPatchBody(payload),
    });
    return 'synced';
  } catch (error) {
    // 404 here means the ID belongs to another account or was deleted remotely.
    classify(error);
    return 'failed';
  }
}

async function ensurePhotoUploaded(
  scan: Scan,
  uploadPhoto: typeof uploadScanPhoto,
  api: ApiClient,
): Promise<{ scan: Scan; uploaded: boolean }> {
  if (scan.deleted_at || scan.cloudinary_public_id || !scan.local_photo_uri) {
    return { scan, uploaded: false };
  }
  try {
    const publicId = await uploadPhoto(scan.id, scan.local_photo_uri, { api });
    return { scan: attachCloudinaryPublicId(scan.id, publicId) ?? scan, uploaded: true };
  } catch (error) {
    if (error instanceof UploadError && error.code === 'network') {
      throw new SyncInterruptedError('offline');
    }
    // Uploads disabled or refused: sync the diagnosis anyway; the photo stays on
    // the device and is uploaded on the next edit of this scan.
    return { scan, uploaded: false };
  }
}

export async function syncAll({
  api = apiClient,
  uploadPhoto = uploadScanPhoto,
}: SyncDeps = {}): Promise<SyncReport> {
  const report: SyncReport = { synced: 0, failed: 0, photosUploaded: 0 };

  const record = (table: SyncTable, id: string, outcome: Outcome, updatedAt: string) => {
    if (markSyncResult(table, id, outcome, updatedAt)) {
      report[outcome] += 1;
    }
  };

  const farms = getPendingFarms();
  for (const farm of farms.filter((f) => !f.deleted_at)) {
    record(
      'farms',
      farm.id,
      await upsertRemote(api, '/farms', toFarmPayload(farm)),
      farm.updated_at,
    );
  }

  const plots = getPendingPlots();
  for (const plot of plots.filter((p) => !p.deleted_at)) {
    record(
      'plots',
      plot.id,
      await upsertRemote(api, '/plots', toPlotPayload(plot)),
      plot.updated_at,
    );
  }

  const pendingScans = getPendingScans();
  for (let start = 0; start < pendingScans.length; start += SCAN_BATCH_SIZE) {
    const batch: Scan[] = [];
    for (const pending of pendingScans.slice(start, start + SCAN_BATCH_SIZE)) {
      const { scan, uploaded } = await ensurePhotoUploaded(pending, uploadPhoto, api);
      report.photosUploaded += uploaded ? 1 : 0;
      batch.push(scan);
    }

    let results: ScanSyncResult[];
    try {
      const response = await api.request<{ results: ScanSyncResult[] }>('/scans/sync', {
        method: 'POST',
        body: { scans: batch.map(toScanPayload) },
      });
      results = response.results;
    } catch (error) {
      classify(error);
      // A 422 for the whole batch: keep the rows pending rather than guessing which one.
      throw new SyncInterruptedError('server');
    }

    const sent = new Map(batch.map((scan) => [scan.id, scan]));
    for (const result of results) {
      const scan = sent.get(result.id);
      if (scan) {
        record(
          'scans',
          scan.id,
          result.status === 'rejected' ? 'failed' : 'synced',
          scan.updated_at,
        );
      }
    }
  }

  for (const plot of plots.filter((p) => p.deleted_at)) {
    record('plots', plot.id, await deleteRemote(api, `/plots/${plot.id}`), plot.updated_at);
  }
  for (const farm of farms.filter((f) => f.deleted_at)) {
    record('farms', farm.id, await deleteRemote(api, `/farms/${farm.id}`), farm.updated_at);
  }

  return report;
}
