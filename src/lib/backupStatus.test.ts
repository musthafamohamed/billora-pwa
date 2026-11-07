import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupReminderDue, exportBackup, getLastBackupExport } from './backupStatus';

describe('backup export history', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T10:00:00.000Z'));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('remembers a successful export request across reads', () => {
    const downloaded: string[] = [];
    expect(getLastBackupExport()).toBeNull();
    const requestedAt = exportBackup(() => { downloaded.push('backup.json'); });
    expect(downloaded).toEqual(['backup.json']);
    expect(requestedAt).toBe('2026-11-07T10:00:00.000Z');
    expect(getLastBackupExport()).toBe('2026-11-07T10:00:00.000Z');
  });

  it('does not advance history when the download request fails', () => {
    vi.setSystemTime(new Date('2026-11-01T09:00:00.000Z'));
    exportBackup(() => {});
    vi.setSystemTime(new Date('2026-11-07T10:00:00.000Z'));
    expect(() => exportBackup(() => { throw new Error('Download unavailable'); })).toThrow('Download unavailable');
    expect(getLastBackupExport()).toBe('2026-11-01T09:00:00.000Z');
  });

  it('still exports when browser storage is denied', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Storage denied'); });
    const downloaded: string[] = [];
    expect(getLastBackupExport()).toBeNull();
    expect(exportBackup(() => { downloaded.push('backup.json'); })).toBe('2026-11-07T10:00:00.000Z');
    expect(downloaded).toEqual(['backup.json']);
  });

  it('ignores corrupt export timestamps', () => {
    window.localStorage.setItem('simple-bill-last-backup-export', 'not-a-date');
    expect(getLastBackupExport()).toBeNull();
  });
});

describe('backup reminders', () => {
  it.each([
    [null, true],
    ['not-a-date', true],
    ['2026-11-08T10:00:00.000Z', true],
    ['2026-11-07T10:00:00.000Z', false],
    ['2026-11-01T10:00:00.000Z', false],
    ['2026-10-31T10:00:00.000Z', true],
  ] as const)('decides whether an export from %s needs a reminder', (lastExport, expected) => {
    expect(backupReminderDue(lastExport, Date.parse('2026-11-07T10:00:00.000Z'))).toBe(expected);
  });
});
