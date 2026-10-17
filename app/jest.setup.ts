/* eslint-disable @typescript-eslint/no-require-imports */
// Include testing-library jest matchers
import '@testing-library/react-native';

// Mock Reanimated
try {
  const reanimated = require('react-native-reanimated');
  if (reanimated.setUpTests) {
    reanimated.setUpTests();
  }
} catch {
  // Ignore if reanimated is not loaded in node context
}

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'es', regionCode: 'CR' }],
  locale: 'es-CR',
}));

// Mock react-native-fast-tflite
jest.mock('react-native-fast-tflite', () => ({
  loadTensorflowModel: jest.fn().mockResolvedValue({
    delegate: 'default',
    run: jest.fn().mockResolvedValue([new Float32Array([0.1, 0.85, 0.01, 0.02, 0.01, 0.01])]),
    runSync: jest.fn().mockReturnValue([new Float32Array([0.1, 0.85, 0.01, 0.02, 0.01, 0.01])]),
    inputs: [{ name: 'input', dataType: 'float32', shape: [1, 224, 224, 3] }],
    outputs: [{ name: 'output', dataType: 'float32', shape: [1, 6] }],
  }),
  useTensorflowModel: jest.fn().mockReturnValue({
    state: 'loaded',
    model: {
      delegate: 'default',
      run: jest.fn().mockResolvedValue([new Float32Array([0.1, 0.85, 0.01, 0.02, 0.01, 0.01])]),
      runSync: jest.fn().mockReturnValue([new Float32Array([0.1, 0.85, 0.01, 0.02, 0.01, 0.01])]),
      inputs: [{ name: 'input', dataType: 'float32', shape: [1, 224, 224, 3] }],
      outputs: [{ name: 'output', dataType: 'float32', shape: [1, 6] }],
    },
  }),
}));

// Mock expo-camera
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  const CameraView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file:///mock/captured_photo.jpg',
        width: 1080,
        height: 1920,
      }),
    }));
    return React.createElement(View, { ...props, testID: props.testID || 'camera-view' });
  });

  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true }, jest.fn().mockResolvedValue({ granted: true })],
  };
});

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///mock/gallery_photo.jpg', width: 800, height: 600 }],
  }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  MediaTypeOptions: {
    Images: 'Images',
  },
}));

// Mock expo-image-manipulator
jest.mock('expo-image-manipulator', () => {
  const jpeg = require('jpeg-js');
  const mockRaw = new Uint8Array(224 * 224 * 4);
  const encoded = jpeg.encode({ width: 224, height: 224, data: mockRaw }, 50);
  const base64Jpeg = Buffer.from(encoded.data).toString('base64');

  return {
    manipulateAsync: jest.fn().mockResolvedValue({
      uri: 'file:///mock/manipulated.jpg',
      base64: base64Jpeg,
      width: 224,
      height: 224,
    }),
    SaveFormat: {
      JPEG: 'jpeg',
      PNG: 'png',
    },
  };
});

// Mock expo-crypto
let mockUuidCounter = 1;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    const pad = String(mockUuidCounter++).padStart(12, '0');
    return `00000000-0000-4000-8000-${pad}`;
  }),
}));

// In-memory SQLite mock for expo-sqlite
class MockSQLiteDatabase {
  tables: Record<string, any[]> = {};

  reset() {
    this.tables = {};
  }

  execSync(sql: string) {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      this.runSync(stmt);
    }
  }

  async execAsync(sql: string) {
    this.execSync(sql);
  }

  runSync(sql: string, ...params: any[]) {
    const clean = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');

    // CREATE TABLE
    const createMatch = clean.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (createMatch) {
      const table = createMatch[1]!;
      if (!this.tables[table]) {
        this.tables[table] = [];
      }
      return { changes: 0, lastInsertRowId: 0 };
    }

    // INSERT INTO
    const insertMatch = clean.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const table = insertMatch[1]!;
      const cols = insertMatch[2]!.split(',').map((c) => c.trim());
      const row: Record<string, any> = {};
      const flatParams = params.flat();
      cols.forEach((col, idx) => {
        row[col] = flatParams[idx] ?? null;
      });
      if (!this.tables[table]) {
        this.tables[table] = [];
      }
      this.tables[table].push(row);
      return { changes: 1, lastInsertRowId: this.tables[table].length };
    }

    // UPDATE
    const updateMatch = clean.match(/UPDATE (\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
    if (updateMatch) {
      const table = updateMatch[1]!;
      const setPart = updateMatch[2]!;
      const wherePart = updateMatch[3]!;
      const flatParams = params.flat();

      let paramIdx = 0;
      const assignments = setPart.split(',').map((s) => s.trim());
      const updates: Record<string, any> = {};

      for (const assign of assignments) {
        const [colPart, valPart] = assign.split('=').map((s) => s.trim());
        const col = colPart!;
        if (valPart === '?') {
          updates[col] = flatParams[paramIdx++] ?? null;
        } else if (valPart?.toUpperCase() === 'NULL') {
          updates[col] = null;
        } else if (valPart?.startsWith("'") && valPart?.endsWith("'")) {
          updates[col] = valPart.slice(1, -1);
        } else {
          updates[col] = valPart ?? null;
        }
      }

      const whereVals = flatParams.slice(paramIdx);
      const rows = this.tables[table] || [];
      let changes = 0;

      for (const row of rows) {
        let match = false;
        if (wherePart.includes('id = ?')) {
          match = row.id === whereVals[0];
        } else if (wherePart.includes('id=')) {
          const idVal = wherePart.split('id=')[1]!.trim().replace(/['"]/g, '');
          match = row.id === idVal;
        } else {
          match = true;
        }

        if (match) {
          Object.assign(row, updates);
          changes++;
        }
      }

      return { changes, lastInsertRowId: 0 };
    }

    // DELETE FROM
    const deleteMatch = clean.match(/DELETE FROM (\w+)(?:\s+WHERE\s+(.+))?/i);
    if (deleteMatch) {
      const table = deleteMatch[1]!;
      const wherePart = deleteMatch[2];
      const flatParams = params.flat();
      if (!wherePart) {
        const changes = (this.tables[table] || []).length;
        this.tables[table] = [];
        return { changes, lastInsertRowId: 0 };
      }
      if (wherePart.includes('id = ?')) {
        const targetId = flatParams[0];
        const before = (this.tables[table] || []).length;
        this.tables[table] = (this.tables[table] || []).filter((r) => r.id !== targetId);
        return { changes: before - this.tables[table].length, lastInsertRowId: 0 };
      }
    }

    return { changes: 0, lastInsertRowId: 0 };
  }

  async runAsync(sql: string, ...params: any[]) {
    return this.runSync(sql, ...params);
  }

  getAllSync<T = any>(sql: string, ...params: any[]): T[] {
    const clean = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
    const fromIdx = clean.search(/\bFROM\b/i);
    if (fromIdx === -1) {
      return [];
    }

    const whereIdx = clean.search(/\bWHERE\b/i);
    const orderIdx = clean.search(/\bORDER BY\b/i);

    const tableEnd = whereIdx !== -1 ? whereIdx : orderIdx !== -1 ? orderIdx : clean.length;
    const table = clean.slice(fromIdx + 5, tableEnd).trim().split(' ')[0]!;

    let wherePart = '';
    if (whereIdx !== -1) {
      const whereEnd = orderIdx !== -1 ? orderIdx : clean.length;
      wherePart = clean.slice(whereIdx + 5, whereEnd).trim();
    }

    let orderPart = '';
    if (orderIdx !== -1) {
      orderPart = clean.slice(orderIdx + 9).trim();
    }

    const rows = [...(this.tables[table] || [])];
    const flatParams = params.flat();

    let filtered = rows;
    if (wherePart) {
      filtered = rows.filter((row) => {
        let paramIdx = 0;
        const conditions = wherePart.split(/\s+AND\s+/i);
        for (const cond of conditions) {
          const c = cond.trim();
          if (c === 'deleted_at IS NULL') {
            if (row.deleted_at !== null && row.deleted_at !== undefined) return false;
          } else if (c.includes('=')) {
            const [colPart, opPart] = c.split(/\s*=\s*/);
            const col = colPart?.trim() ?? '';
            const op = opPart?.trim() ?? '';
            if (op === '?') {
              const val = flatParams[paramIdx++];
              if (row[col] !== val) return false;
            } else if (op.startsWith("'") && op.endsWith("'")) {
              if (row[col] !== op.slice(1, -1)) return false;
            } else if (op.toUpperCase() === 'NULL') {
              if (row[col] !== null) return false;
            }
          }
        }
        return true;
      });
    }

    // ORDER BY
    if (orderPart) {
      if (orderPart.includes('created_at DESC') || orderPart.includes('scanned_at DESC')) {
        const col = orderPart.includes('created_at') ? 'created_at' : 'scanned_at';
        filtered.sort((a, b) => ((b[col] || '') > (a[col] || '') ? 1 : -1));
      }
    }

    return filtered as T[];
  }

  async getAllAsync<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    return this.getAllSync<T>(sql, ...params);
  }

  getFirstSync<T = any>(sql: string, ...params: any[]): T | null {
    const results = this.getAllSync<T>(sql, ...params);
    return results[0] ?? null;
  }

  async getFirstAsync<T = any>(sql: string, ...params: any[]): Promise<T | null> {
    return this.getFirstSync<T>(sql, ...params);
  }

  withTransactionSync<T>(cb: () => T): T {
    return cb();
  }

  async withTransactionAsync<T>(cb: () => Promise<T>): Promise<T> {
    return cb();
  }

  closeSync() {}
}

const mockDb = new MockSQLiteDatabase();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => mockDb),
  openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
  __mockDb: mockDb,
}));

