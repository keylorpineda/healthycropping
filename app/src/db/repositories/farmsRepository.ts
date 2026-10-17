import * as Crypto from 'expo-crypto';

import { getDatabase } from '../database';
import { type CreateFarmInput, type Farm, type UpdateFarmInput } from '../types';

export class FarmsRepository {
  getAll(includeDeleted = false): Farm[] {
    const db = getDatabase();
    if (includeDeleted) {
      return db.getAllSync<Farm>('SELECT * FROM farms ORDER BY created_at DESC');
    }
    return db.getAllSync<Farm>(
      'SELECT * FROM farms WHERE deleted_at IS NULL ORDER BY created_at DESC',
    );
  }

  getById(id: string): Farm | null {
    const db = getDatabase();
    return db.getFirstSync<Farm>('SELECT * FROM farms WHERE id = ?', id);
  }

  create(input: CreateFarmInput): Farm {
    const db = getDatabase();
    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    db.runSync(
      `INSERT INTO farms (id, name, region, altitude_m, created_at, updated_at, deleted_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name.trim(),
      input.region.trim(),
      input.altitude_m ?? null,
      now,
      now,
      null,
      'pending',
    );

    const created = this.getById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created farm ${id}`);
    }
    return created;
  }

  update(id: string, input: UpdateFarmInput): Farm | null {
    const db = getDatabase();
    const current = this.getById(id);
    if (!current) return null;

    const name = input.name !== undefined ? input.name.trim() : current.name;
    const region = input.region !== undefined ? input.region.trim() : current.region;
    const altitude_m = input.altitude_m !== undefined ? input.altitude_m : current.altitude_m;
    const now = new Date().toISOString();

    db.runSync(
      `UPDATE farms SET name = ?, region = ?, altitude_m = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
      name,
      region,
      altitude_m,
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
      `UPDATE farms SET deleted_at = ?, updated_at = ?, sync_status = ? WHERE id = ?`,
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
      `UPDATE farms SET deleted_at = NULL, updated_at = ?, sync_status = ? WHERE id = ?`,
      now,
      'pending',
      id,
    );
    return res.changes > 0;
  }

  hardDelete(id: string): boolean {
    const db = getDatabase();
    const res = db.runSync('DELETE FROM farms WHERE id = ?', id);
    return res.changes > 0;
  }
}

export const farmsRepository = new FarmsRepository();
