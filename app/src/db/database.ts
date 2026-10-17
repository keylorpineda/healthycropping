import * as SQLite from 'expo-sqlite';

import { SCHEMA_SQL } from './schema';

export const DATABASE_NAME = 'healthycrop.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DATABASE_NAME);
    initDatabase(dbInstance);
  }
  return dbInstance;
}

export function initDatabase(db: SQLite.SQLiteDatabase): void {
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
