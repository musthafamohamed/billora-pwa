import { describe, expect, it } from 'vitest';
import { readFirebaseConfig } from './client';
const config = { VITE_FIREBASE_API_KEY: 'public-web-api-key', VITE_FIREBASE_AUTH_DOMAIN: 'billora-pwa.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'billora-pwa', VITE_FIREBASE_APP_ID: '1:123:web:example' };
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
});
