/** Phones: backups aren't available yet (the phone app keeps its own SQLite database). */
export const BACKUP_FORMAT = 'finance-overview-backup';
export const backupSupported = false;
export function isBackupFile(text: string): boolean {
  try {
    return JSON.parse(text)?.format === BACKUP_FORMAT;
  } catch {
    return false;
  }
}
export function downloadBackup(): void {
  throw new Error('Backups are only available in the web version for now.');
}
export function describeBackup(_text: string): { exportedAt: string; counts: Record<string, number> } {
  throw new Error('Backups are only available in the web version for now.');
}
export function restoreBackup(_text: string): void {
  throw new Error('Backups are only available in the web version for now.');
}
