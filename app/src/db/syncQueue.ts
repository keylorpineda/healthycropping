import { getDatabase } from './database';
import { type Farm, type Plot, type Scan } from './types';

/**
 * Local side of the sync queue: every create, edit, delete and restore in the
 * repositories sets `sync_status = 'pending'`; the sync engine reads pending rows
 * here and records each outcome.
 */

export type SyncTable = 'farms' | 'plots' | 'scans';

export function getPendingFarms(): Farm[] {
  return getDatabase().getAllSync<Farm>(
    "SELECT * FROM farms WHERE sync_status = 'pending' ORDER BY created_at ASC",
  );
}

export function getPendingPlots(): Plot[] {
  return getDatabase().getAllSync<Plot>(
    "SELECT * FROM plots WHERE sync_status = 'pending' ORDER BY created_at ASC",
  );
}

export function getPendingScans(): Scan[] {
  return getDatabase().getAllSync<Scan>(
    "SELECT * FROM scans WHERE sync_status = 'pending' ORDER BY scanned_at ASC",
  );
}

/** Number of rows waiting to be synced across all tables. */
export function countPending(): number {
  return getPendingFarms().length + getPendingPlots().length + getPendingScans().length;
}

/**
 * Record a sync outcome without touching `updated_at`. The row only changes if
 * it still has the `updated_at` that was sent, so an edit made while the request
 * was in flight stays `pending` and goes out on the next run.
 */
export function markSyncResult(
  table: SyncTable,
  id: string,
  status: 'synced' | 'failed',
  sentUpdatedAt: string,
): boolean {
  const res = getDatabase().runSync(
    `UPDATE ${table} SET sync_status = ? WHERE id = ? AND updated_at = ?`,
    status,
    id,
    sentUpdatedAt,
  );
  return res.changes > 0;
}

/**
 * Store the Cloudinary `public_id` of an uploaded scan photo. `updated_at` moves
 * forward so the API's last-write-wins sync accepts the new value.
 */
export function attachCloudinaryPublicId(id: string, publicId: string): Scan | null {
  const db = getDatabase();
  db.runSync(
    `UPDATE scans SET cloudinary_public_id = ?, updated_at = ? WHERE id = ?`,
    publicId,
    new Date().toISOString(),
    id,
  );
  return db.getFirstSync<Scan>('SELECT * FROM scans WHERE id = ?', id);
}
