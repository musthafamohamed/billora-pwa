import { describe, expect, it } from 'vitest';
import { installBlockerReason, isSecureInstallContext } from './useInstall';

describe('install context diagnostics', () => {
  it('treats HTTPS and localhost as secure, plain LAN HTTP as not', () => {
    expect(isSecureInstallContext('https:', 'example.com')).toBe(true);
    expect(isSecureInstallContext('http:', 'localhost')).toBe(true);
    expect(isSecureInstallContext('http:', '127.0.0.1')).toBe(true);
    expect(isSecureInstallContext('http:', '192.168.29.204')).toBe(false);
    expect(isSecureInstallContext('http:', 'example.com')).toBe(false);
  });
  it('reports the LAN-HTTP blocker first', () => {
    const reason = installBlockerReason({ secure: false, serviceWorker: false, manifest: true, installed: false, promptAvailable: false });
    expect(reason).toContain('192.168');
    expect(installBlockerReason({ secure: true, serviceWorker: true, manifest: true, installed: false, promptAvailable: true })).toBeNull();
    expect(installBlockerReason({ secure: true, serviceWorker: true, manifest: true, installed: true, promptAvailable: false })).toContain('Already installed');
  });
});
