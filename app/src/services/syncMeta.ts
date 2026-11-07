import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDatabase } from '@/db';

/**
 * Small persisted sync metadata: who owns the local data on this device and when
 * it was last synced. Kept in AsyncStorage (not SQLite) because it describes the
 * device session, not a synced record.
 */

export const OWNER_UID_KEY = 'hc.sync.ownerUid';
export const LAST_SYNCED_AT_KEY = 'hc.sync.lastSyncedAt';

export async function loadLastSyncedAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNCED_AT_KEY);
  } catch {
    return null;
  }
}

export async function saveLastSyncedAt(iso: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, iso);
  } catch {
    // Losing the timestamp only affects the Settings label.
  }
}

export type ClaimOutcome = 'claimed' | 'sameOwner' | 'otherOwner';

/** Put records the API refused earlier back in the queue for another attempt. */
function requeueFailed(): number {
  const db = getDatabase();
  let changes = 0;
  for (const table of ['farms', 'plots', 'scans'] as const) {
    changes += db.runSync(
      `UPDATE ${table} SET sync_status = 'pending' WHERE sync_status = 'failed'`,
    ).changes;
  }
  return changes;
}

/**
 * Claim the device's local data for the user who just signed in.
 *
 * Records created without an account are already `pending`, so the next sync
 * uploads them under this user. The first sign-in on a device (or the same user
 * signing in again) also re-queues `failed` records. When a different account
 * signs in, data synced by the previous account stays as it is: those IDs belong
 * to the other user on the API and would be rejected, and uploading them would
 * copy someone else's diagnoses into this account.
 */
export async function claimLocalData(uid: string): Promise<ClaimOutcome> {
  let owner: string | null = null;
  try {
    owner = await AsyncStorage.getItem(OWNER_UID_KEY);
  } catch {
    owner = null;
  }
  if (owner && owner !== uid) {
    return 'otherOwner';
  }
  requeueFailed();
  if (!owner) {
    try {
      await AsyncStorage.setItem(OWNER_UID_KEY, uid);
    } catch {
      // Without the marker the next sign-in simply claims again.
    }
    return 'claimed';
  }
  return 'sameOwner';
}
