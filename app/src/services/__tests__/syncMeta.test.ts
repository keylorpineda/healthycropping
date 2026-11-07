import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

import { closeDatabase, farmsRepository, getDatabase, markSyncResult } from '@/db';
import { claimLocalData, loadLastSyncedAt, OWNER_UID_KEY, saveLastSyncedAt } from '../syncMeta';

const mockDb = (SQLite as unknown as { __mockDb: { reset: () => void } }).__mockDb;

describe('sync metadata', () => {
  beforeEach(async () => {
    closeDatabase();
    mockDb.reset();
    getDatabase();
    await AsyncStorage.clear();
  });

  it('persists the last sync time', async () => {
    await expect(loadLastSyncedAt()).resolves.toBeNull();
    await saveLastSyncedAt('2026-11-07T12:00:00.000Z');
    await expect(loadLastSyncedAt()).resolves.toBe('2026-11-07T12:00:00.000Z');
  });

  it('claims anonymous data on the first sign-in and re-queues failed records', async () => {
    const anonymous = farmsRepository.create({ name: 'Sin cuenta', region: 'Naranjo' });
    const refused = farmsRepository.create({ name: 'Rechazada', region: 'Naranjo' });
    markSyncResult('farms', refused.id, 'failed', refused.updated_at);
    const synced = farmsRepository.create({ name: 'Lista', region: 'Naranjo' });
    markSyncResult('farms', synced.id, 'synced', synced.updated_at);

    await expect(claimLocalData('user-a')).resolves.toBe('claimed');

    expect(farmsRepository.getById(anonymous.id)?.sync_status).toBe('pending');
    expect(farmsRepository.getById(refused.id)?.sync_status).toBe('pending');
    expect(farmsRepository.getById(synced.id)?.sync_status).toBe('synced');
    await expect(AsyncStorage.getItem(OWNER_UID_KEY)).resolves.toBe('user-a');
  });

  it('recognizes the same user signing in again', async () => {
    await claimLocalData('user-a');
    await expect(claimLocalData('user-a')).resolves.toBe('sameOwner');
  });

  it('leaves data owned by another account untouched', async () => {
    await claimLocalData('user-a');
    const farm = farmsRepository.create({ name: 'De A', region: 'Naranjo' });
    markSyncResult('farms', farm.id, 'failed', farm.updated_at);

    await expect(claimLocalData('user-b')).resolves.toBe('otherOwner');
    expect(farmsRepository.getById(farm.id)?.sync_status).toBe('failed');
    await expect(AsyncStorage.getItem(OWNER_UID_KEY)).resolves.toBe('user-a');
  });
});
