import 'fake-indexeddb/auto';
import { deleteApp, getApps } from 'firebase/app';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeFirebaseAuth, readFirebaseConfig } from './client';
const config = { VITE_FIREBASE_API_KEY: 'public-web-api-key', VITE_FIREBASE_AUTH_DOMAIN: 'billora-pwa.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'billora-pwa', VITE_FIREBASE_APP_ID: '1:123:web:example' };
afterEach(async () => { await Promise.all(getApps().map(app => deleteApp(app))); });
describe('Firebase configuration boundary', () => {
  it('requires complete public web configuration for the existing project', () => {
    expect(readFirebaseConfig(config, false, 'billora-pwa.web.app').options.projectId).toBe('billora-pwa');
    expect(() => readFirebaseConfig({}, true, 'localhost')).toThrow();
    expect(() => readFirebaseConfig({ ...config, VITE_FIREBASE_PROJECT_ID: 'other-project' }, false, 'localhost')).toThrow();
  });
  it('allows only the isolated demo project on loopback in emulator development mode', () => {
    const env = { ...config, VITE_FIREBASE_USE_EMULATORS: 'true', VITE_FIREBASE_PROJECT_ID: 'demo-billora-phase2' };
    expect(readFirebaseConfig(env, true, 'localhost').emulators).toBe(true);
    for (const [development, hostname] of [[false, 'localhost'], [true, 'example.com']] as const) {
      expect(() => readFirebaseConfig(env, development, hostname)).toThrow();
    }
    expect(() => readFirebaseConfig({ ...env, VITE_FIREBASE_PROJECT_ID: 'billora-pwa' }, true, 'localhost')).toThrow();
    expect(() => readFirebaseConfig({ ...config, VITE_FIREBASE_USE_EMULATORS: 'yes' }, true, 'localhost')).toThrow();
  });
  it.each(Object.keys(config))('rejects missing or blank %s before initialization', name => {
    for (const value of [undefined, '', ' \t\n ']) {
      expect(() => readFirebaseConfig({ ...config, [name]: value }, false, 'invitedigital.online')).toThrow();
    }
    expect(getApps()).toHaveLength(0);
  });
  it('uses the same public configuration in development and on the custom domain', () => {
    expect(readFirebaseConfig(config, true, 'localhost')).toEqual(readFirebaseConfig(config, false, 'invitedigital.online'));
    expect(() => readFirebaseConfig({ ...config, VITE_FIREBASE_AUTH_DOMAIN: 'other-project.firebaseapp.com' }, false, 'invitedigital.online')).toThrow();
  });
  it('initializes the named Auth app once and refuses a conflicting configuration', async () => {
    const parsed = readFirebaseConfig(config, false, 'invitedigital.online');
    const auth = initializeFirebaseAuth(parsed);
    await auth.authStateReady();
    expect(auth.app.name).toBe('billora-auth-pilot');
    expect(auth.app.options).toEqual({ apiKey: 'public-web-api-key', authDomain: 'billora-pwa.firebaseapp.com',
      projectId: 'billora-pwa', appId: '1:123:web:example' });
    expect(initializeFirebaseAuth(parsed)).toBe(auth);
    expect(getApps()).toHaveLength(1);
    expect(() => initializeFirebaseAuth({ ...parsed, options: { ...parsed.options, appId: 'different-app' } })).toThrow();
  });
});
