import * as SQLite from 'expo-sqlite';

import { ADDED_COLUMNS, SCHEMA_SQL } from './schema';

export const DATABASE_NAME = 'healthycropping.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DATABASE_NAME);
    initDatabase(dbInstance);
  }
  return dbInstance;
}

export function initDatabase(db: SQLite.SQLiteDatabase): void {
  // SQLite disables foreign keys per connection by default; without this pragma the
  // ON DELETE CASCADE / SET NULL clauses in SCHEMA_SQL never fire.
  db.execSync('PRAGMA foreign_keys = ON;');
  db.execSync(SCHEMA_SQL);
  addMissingColumns(db);
}

/** Upgrades databases created before a column existed; new columns are nullable. */
function addMissingColumns(db: SQLite.SQLiteDatabase): void {
  const tables = new Set(ADDED_COLUMNS.map((added) => added.table));
  for (const table of tables) {
    const existing = new Set(
      db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((info) => info.name),
    );
    for (const added of ADDED_COLUMNS) {
      if (added.table === table && !existing.has(added.column)) {
        db.execSync(`ALTER TABLE ${table} ADD COLUMN ${added.column} ${added.type};`);
      }
    }
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.closeSync();
    } catch {
      // Ignored if already closed
    }
    dbInstance = null;
  }
}
