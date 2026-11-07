import { useCallback, useEffect, useState } from 'react';

/**
 * PWA install support.
 *
 * Chrome (and other Chromium browsers) fire `beforeinstallprompt` only when
 * the PWA install criteria are met: a secure context (HTTPS, or localhost),
 * a valid manifest, icons, and a registered service worker with a fetch
 * handler. No in-app code can force a prompt when those are missing — most
 * notably, a plain-HTTP LAN address such as http://192.168.x.x:5173 is NOT
 * a secure context (only localhost / 127.0.0.1 are exempt), so Chrome
 * reports "This app cannot be installed" there regardless of the app code.
 * The correct path is: production build (npm run build) served over HTTPS,
 * or on localhost — then this hook captures the prompt and the Settings
 * Install button can show it.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Pure helper, unit-tested: is this origin a secure context for install? */
export function isSecureInstallContext(protocol: string, hostname: string): boolean {
  if (protocol === 'https:') return true;
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export interface InstallDiagnostics {
  secure: boolean;
  serviceWorker: boolean;
  manifest: boolean;
  installed: boolean;
  promptAvailable: boolean;
}

/** Pure helper, unit-tested: summarise the diagnostics into one reason. */
export function installBlockerReason(d: InstallDiagnostics): string | null {
  if (d.installed) return 'Already installed on this device.';
  if (!d.secure) return 'Not a secure connection. Install requires HTTPS or localhost — a plain-HTTP LAN address (for example http://192.168.x.x:5173) cannot be installed as a PWA in Chrome.';
  if (!d.manifest) return 'No web app manifest was found. Serve the production build, which includes the manifest.';
  if (!d.serviceWorker) return 'No service worker is registered yet. Reload the production build and try again.';
  if (!d.promptAvailable) return 'Your browser has not offered an install prompt yet. Use the browser menu instead: Android Chrome → Menu → Add to Home screen, or iPhone Safari → Share → Add to Home Screen.';
  return null;
}

export function useInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true),
  );
  const [swRegistered, setSwRegistered] = useState(false);
  const [manifestPresent, setManifestPresent] = useState(false);
  const [installOutcome, setInstallOutcome] = useState<string>('');

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setIsInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    setManifestPresent(!!document.querySelector('link[rel="manifest"]'));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration()
        .then((reg) => setSwRegistered(!!reg))
        .catch(() => setSwRegistered(false));
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const diagnostics: InstallDiagnostics = {
    secure: isSecureInstallContext(window.location.protocol, window.location.hostname),
    serviceWorker: swRegistered,
    manifest: manifestPresent,
    installed: isInstalled,
    promptAvailable: deferred !== null,
  };
  const canInstall = deferred !== null && !isInstalled;
  const blocker = installBlockerReason(diagnostics);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setInstallOutcome(choice.outcome === 'accepted' ? 'Install accepted. The app should now appear on your home screen.' : 'Install dismissed. You can try again from Settings.');
      setDeferred(null);
      return choice.outcome;
    } catch {
      setInstallOutcome('The install prompt could not be shown. Use the browser menu instead.');
      return 'unavailable';
    }
  }, [deferred]);

  return { canInstall, isInstalled, diagnostics, blocker, installOutcome, promptInstall };
}
