import * as Crypto from 'expo-crypto';

import { getDatabase } from '../database';
import { type CreatePlotInput, type Plot, type UpdatePlotInput } from '../types';

export class PlotsRepository {
  getAll(includeDeleted = false): Plot[] {
    const db = getDatabase();
    if (includeDeleted) {
      return db.getAllSync<Plot>('SELECT * FROM plots ORDER BY created_at DESC');
    }
    return db.getAllSync<Plot>(
      'SELECT * FROM plots WHERE deleted_at IS NULL ORDER BY created_at DESC',
    );
  }

  getByFarm(farmId: string, includeDeleted = false): Plot[] {
    const db = getDatabase();
    if (includeDeleted) {
      return db.getAllSync<Plot>(
        'SELECT * FROM plots WHERE farm_id = ? ORDER BY created_at DESC',
        farmId,
      );
    }
    return db.getAllSync<Plot>(
      'SELECT * FROM plots WHERE farm_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      farmId,
    );
  }

  getById(id: string): Plot | null {
    const db = getDatabase();
    return db.getFirstSync<Plot>('SELECT * FROM plots WHERE id = ?', id);
  }

  create(input: CreatePlotInput): Plot {
    const db = getDatabase();
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    db.runSync(
      `INSERT INTO plots (id, farm_id, name, crop, area_ha, created_at, updated_at, deleted_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.farm_id,
      input.name.trim(),
      input.crop,
      input.area_ha ?? null,
      now,
      now,
      null,
      'pending',
    );

    const created = this.getById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created plot ${id}`);
    }
    return created;
  }

  update(id: string, input: UpdatePlotInput): Plot | null {
    const db = getDatabase();
    const current = this.getById(id);
    if (!current) return null;

    const name = input.name !== undefined ? input.name.trim() : current.name;
    const crop = input.crop !== undefined ? input.crop : current.crop;
    const area_ha = input.area_ha !== undefined ? input.area_ha : current.area_ha;
    const now = new Date().toISOString();

    db.runSync(
      `UPDATE plots SET name = ?, crop = ?, area_ha = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
      name,
      crop,
      area_ha,
      now,
      'pending',
      id,
    );

    return this.getById(id);
  }

  delete(id: string): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();
    const res = db.runSync(
      `UPDATE plots SET deleted_at = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
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
      `UPDATE plots SET deleted_at = NULL, updated_at = ?, sync_status = ? WHERE id = ?`,
      now,
      'pending',
      id,
    );
    return res.changes > 0;
  }

  hardDelete(id: string): boolean {
    const db = getDatabase();
    const res = db.runSync('DELETE FROM plots WHERE id = ?', id);
    return res.changes > 0;
  }
}

export const plotsRepository = new PlotsRepository();
