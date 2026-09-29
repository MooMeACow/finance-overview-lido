/**
 * Phones (iOS/Android): sync isn't available yet; data stays in the local
 * SQLite database. The web version is in index.web.ts.
 */
import type { SyncState } from './types';

export type { SyncState, SyncStatus } from './types';

const state: SyncState = { status: 'unavailable' };

export const getSyncState = (): SyncState => state;
export const subscribeSync = (_cb: (s: SyncState) => void) => () => {};
export const subscribeRemoteData = (_cb: () => void) => () => {};
export function startSync(): void {}
export async function setupSync(_passphrase: string, _remember: boolean): Promise<void> {
  throw new Error('Sync is only available on the hosted web version.');
}
export async function unlockSync(_passphrase: string, _remember: boolean): Promise<void> {
  throw new Error('Sync is only available on the hosted web version.');
}
export async function syncNow(): Promise<void> {}
export async function forgetOnThisDevice(): Promise<void> {}
