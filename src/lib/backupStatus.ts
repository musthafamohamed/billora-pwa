const KEY = 'simple-bill-last-backup-export';

/** Export history records a download request, not a verified file on disk. */
export function getLastBackupExport(): string | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function exportBackup(download: () => void): string {
  download();
  const requestedAt = new Date().toISOString();
  try { window.localStorage.setItem(KEY, requestedAt); } catch { /* Export still works when storage is unavailable. */ }
  return requestedAt;
}

export function backupReminderDue(lastExport: string | null, now = Date.now()): boolean {
  const exportedAt = lastExport ? Date.parse(lastExport) : NaN;
  return !Number.isFinite(exportedAt) || exportedAt > now || now - exportedAt >= 7 * 24 * 60 * 60 * 1000;
}
