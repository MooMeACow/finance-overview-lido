import { useEffect, useState } from 'react';

import { getSyncState, subscribeSync, type SyncState } from './index';

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState());
  useEffect(() => subscribeSync(setState), []);
  return state;
}

/** "just now", "5 min ago", "2 hours ago", "3 days ago" */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hour${Math.round(s / 3600) === 1 ? '' : 's'} ago`;
  return `${Math.round(s / 86400)} day${Math.round(s / 86400) === 1 ? '' : 's'} ago`;
}
