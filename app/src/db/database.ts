import * as SQLite from 'expo-sqlite';

import { SCHEMA_SQL } from './schema';

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
