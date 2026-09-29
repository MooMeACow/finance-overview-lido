/** What the sync status looks like to the rest of the app. */
export type SyncStatus =
  | 'unavailable' // not on the hosted site (e.g. running locally) or not supported here
  | 'checking'
  | 'setup' // hosted, logged in, but no synced data yet: choose a passphrase
  | 'locked' // synced data exists: enter your passphrase on this device
  | 'syncing'
  | 'synced'
  | 'offline' // no internet: changes are kept on this device and synced later
  | 'signed_out' // the login expired: reload the page
  | 'error';

export type SyncState = {
  status: SyncStatus;
  email?: string;
  lastSynced?: string | null;
  message?: string;
  /** Changes made here that aren't on the server yet */
  pending?: boolean;
};
