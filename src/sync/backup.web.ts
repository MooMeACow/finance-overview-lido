/**
 * Web: download all data as a file, and restore it (merged with what's here).
 * The file is NOT encrypted: keep it somewhere private.
 */
import { getSnapshot, saveSnapshot, type Data } from '../db/database.web';
import { mergeData } from '../lib/syncMerge';

export const BACKUP_FORMAT = 'finance-overview-backup';
export const backupSupported = true;

type Backup = { format: typeof BACKUP_FORMAT; version: 1; exported_at: string; data: Data };

export function isBackupFile(text: string): boolean {
  try {
    return JSON.parse(text)?.format === BACKUP_FORMAT;
  } catch {
    return false;
  }
}

function parse(text: string): Backup {
  const b = JSON.parse(text) as Backup;
  if (b?.format !== BACKUP_FORMAT || b.version !== 1 || typeof b.data !== 'object') throw new Error('This is not a Finance Overview backup.');
  return b;
}

export function downloadBackup(): void {
  const backup: Backup = { format: BACKUP_FORMAT, version: 1, exported_at: new Date().toISOString(), data: getSnapshot() };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-backup-${backup.exported_at.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function describeBackup(text: string) {
  const { exported_at, data } = parse(text);
  return {
    exportedAt: exported_at,
    counts: {
      transactions: data.transactions?.length ?? 0,
      accounts: data.accounts?.length ?? 0,
      plans: data.plans?.length ?? 0,
      budgets: data.budgets?.length ?? 0,
      debts: data.debts?.length ?? 0,
    },
  };
}

/** Adds everything from the backup to what's here (nothing here is removed). */
export function restoreBackup(text: string): void {
  const { data } = parse(text);
  saveSnapshot(mergeData(null, getSnapshot(), data));
}
