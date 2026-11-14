import type * as SQLite from 'expo-sqlite';

import { initDatabase, parsePlotLocation } from '../index';

describe('parsePlotLocation', () => {
  it('accepts an empty location as null coordinates', () => {
    expect(parsePlotLocation('', '  ')).toEqual({ ok: true, latitude: null, longitude: null });
  });

  it('parses decimal degrees, including a decimal comma', () => {
    expect(parsePlotLocation('9.6611', '-84,0225')).toEqual({
      ok: true,
      latitude: 9.6611,
      longitude: -84.0225,
    });
  });

  it.each([
    ['9.66', ''],
    ['', '-84.02'],
  ])('rejects one coordinate without the other (%p, %p)', (latitude, longitude) => {
    expect(parsePlotLocation(latitude, longitude)).toEqual({ ok: false, error: 'locationPair' });
  });

  it.each([
    ['90.5', '-84.02', 'latitudeRange'],
    ['abc', '-84.02', 'latitudeRange'],
    ['9.66', '-180.5', 'longitudeRange'],
    ['9.66', 'west', 'longitudeRange'],
  ])('rejects out-of-range or non-numeric values (%p, %p)', (latitude, longitude, error) => {
    expect(parsePlotLocation(latitude, longitude)).toEqual({ ok: false, error });
  });
});

describe('initDatabase column upgrades', () => {
  function fakeDb(plotColumns: string[]) {
    const execSync = jest.fn();
    const getAllSync = jest.fn((sql: string) =>
      sql.includes('table_info(plots)') ? plotColumns.map((name) => ({ name })) : [],
    );
    return { db: { execSync, getAllSync } as unknown as SQLite.SQLiteDatabase, execSync };
  }

  it('adds the location columns to a plots table created before #136', () => {
    const { db, execSync } = fakeDb(['id', 'farm_id', 'name', 'crop', 'area_ha']);

    initDatabase(db);

    expect(execSync).toHaveBeenCalledWith('ALTER TABLE plots ADD COLUMN latitude REAL;');
    expect(execSync).toHaveBeenCalledWith('ALTER TABLE plots ADD COLUMN longitude REAL;');
  });

  it('leaves an up-to-date plots table alone', () => {
    const { db, execSync } = fakeDb(['id', 'area_ha', 'latitude', 'longitude']);

    initDatabase(db);

    const alters = execSync.mock.calls.filter(([sql]) => String(sql).startsWith('ALTER TABLE'));
    expect(alters).toEqual([]);
  });
});
