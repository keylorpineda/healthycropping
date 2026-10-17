import * as Crypto from 'expo-crypto';

import { getDatabase } from '../database';
import { type CreateScanInput, type Scan, type ScanFilters, type SyncStatus } from '../types';

export class ScansRepository {
  getAll(filters?: ScanFilters): Scan[] {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (!filters?.includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (filters?.crop) {
      conditions.push('crop = ?');
      params.push(filters.crop);
    }

    if (filters?.severity) {
      conditions.push('severity = ?');
      params.push(filters.severity);
    }

    if (filters?.farm_id) {
      conditions.push('farm_id = ?');
      params.push(filters.farm_id);
    }

    if (filters?.plot_id) {
      conditions.push('plot_id = ?');
      params.push(filters.plot_id);
    }

    let query = 'SELECT * FROM scans';
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY scanned_at DESC';

    return db.getAllSync<Scan>(query, ...params);
  }

  getById(id: string): Scan | null {
    const db = getDatabase();
    return db.getFirstSync<Scan>('SELECT * FROM scans WHERE id = ?', id);
  }

  create(input: CreateScanInput): Scan {
    const db = getDatabase();
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    db.runSync(
      `INSERT INTO scans (
        id, farm_id, plot_id, crop, predicted_class, severity,
        confidence, threshold, is_low_confidence, model_version,
        local_photo_uri, cloudinary_public_id, explanation_json,
        scanned_at, updated_at, deleted_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.farm_id ?? null,
      input.plot_id ?? null,
      input.crop,
      input.predicted_class,
      input.severity,
      input.confidence,
      input.threshold,
      input.is_low_confidence ? 1 : 0,
      input.model_version,
      input.local_photo_uri,
      null,
      input.explanation_json ?? null,
      now,
      now,
      null,
      'pending',
    );

    const created = this.getById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created scan ${id}`);
    }
    return created;
  }

  updateLocation(id: string, farm_id: string | null, plot_id: string | null): Scan | null {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.runSync(
      `UPDATE scans SET farm_id = ?, plot_id = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
      farm_id,
      plot_id,
      now,
      'pending',
      id,
    );

    return this.getById(id);
  }

  updateSyncStatus(
    id: string,
    sync_status: SyncStatus,
    cloudinary_public_id?: string | null,
  ): Scan | null {
    const db = getDatabase();
    const now = new Date().toISOString();

    if (cloudinary_public_id !== undefined) {
      db.runSync(
        `UPDATE scans SET sync_status = ?, cloudinary_public_id = ?, updated_at = ? WHERE id = ?`,
        sync_status,
        cloudinary_public_id,
        now,
        id,
      );
    } else {
      db.runSync(
        `UPDATE scans SET sync_status = ?, updated_at = ? WHERE id = ?`,
        sync_status,
        now,
        id,
      );
    }

    return this.getById(id);
  }

  delete(id: string): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();
    const res = db.runSync(
      `UPDATE scans SET deleted_at = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
      now,
      now,
      'pending',
      id,
    );
    return res.changes > 0;
  }

  restore(id: string): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();
    const res = db.runSync(
      `UPDATE scans SET deleted_at = NULL, updated_at = ?, sync_status = ? WHERE id = ?`,
      now,
      'pending',
      id,
    );
    return res.changes > 0;
  }

  hardDelete(id: string): boolean {
    const db = getDatabase();
    const res = db.runSync('DELETE FROM scans WHERE id = ?', id);
    return res.changes > 0;
  }

  getPendingSync(): Scan[] {
    const db = getDatabase();
    return db.getAllSync<Scan>(
      "SELECT * FROM scans WHERE sync_status = 'pending' ORDER BY scanned_at ASC",
    );
  }
}

export const scansRepository = new ScansRepository();
