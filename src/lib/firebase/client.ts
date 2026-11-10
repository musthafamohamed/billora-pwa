import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';

export interface FirebaseClientConfig { options: FirebaseOptions; emulators: boolean }
const configurationError = () => Object.assign(new Error('Invalid or missing Firebase public web configuration.'), { code: 'config/invalid' });
/** Fixed demo endpoints prevent accidentally pointing automated tests at live
 * Firebase. Public configuration is whitelisted; privileged keys are never read. */
export function readFirebaseConfig(env: Record<string, unknown>, development: boolean, hostname: string): FirebaseClientConfig {
  const raw = env.VITE_FIREBASE_USE_EMULATORS;
  if (raw !== undefined && raw !== '' && raw !== 'true' && raw !== 'false') throw configurationError();
  const emulators = raw === 'true';
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (emulators ? !development || !['localhost', '127.0.0.1', '[::1]'].includes(hostname) || projectId !== 'demo-billora-phase2' : projectId !== 'billora-pwa') throw configurationError();
  const fields = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_APP_ID'] as const;
  if (fields.some(key => typeof env[key] !== 'string' || !(env[key] as string).trim())) throw configurationError();
  const options: FirebaseOptions = { apiKey: env.VITE_FIREBASE_API_KEY as string, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: projectId as string, appId: env.VITE_FIREBASE_APP_ID as string };
  if (!emulators && options.authDomain !== 'billora-pwa.firebaseapp.com' && options.authDomain !== 'billora-pwa.web.app') throw configurationError();
  return { options, emulators };
}

/** This module initializes Auth only. No Analytics or Firestore client is opened. */
export function initializeFirebaseAuth(config: FirebaseClientConfig): Auth {
  const existing = getApps().find(app => app.name === 'billora-auth-pilot');
  if (existing && ['projectId', 'apiKey', 'appId', 'authDomain'].some(key => existing.options[key as keyof FirebaseOptions] !== config.options[key as keyof FirebaseOptions])) throw configurationError();
  const app = existing ?? initializeApp(config.options, 'billora-auth-pilot');
  if (existing) return getAuth(app);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  if (config.emulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return auth;
}
