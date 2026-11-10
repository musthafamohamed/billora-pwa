import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, initializeAuth, inMemoryPersistence, signOut, type Auth } from 'firebase/auth';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { createFirebaseGateway } from '../../src/lib/auth/firebaseGateway';
import { AuthSession } from '../../src/lib/auth/session';
import { readFirebaseConfig } from '../../src/lib/firebase/client';

const projectId = 'demo-billora-phase2';
let environment: RulesTestEnvironment;
let app: FirebaseApp; let auth: Auth;
const email = 'phase2-fixture@example.test'; const password = 'Emulator-only-password-2048';
// Refuse to start SDKs or fixtures unless both emulators are explicitly selected.
beforeAll(async () => {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || process.env.GCLOUD_PROJECT !== projectId) throw new Error('Only demo-billora-phase2 loopback emulators may run these tests.');
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080,
    rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
  app = initializeApp({ projectId, apiKey: 'demo-emulator-api-key', appId: 'demo-emulator-app' }, `phase2-emulator-${Date.now()}`);
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await createUserWithEmailAndPassword(auth, email, password); await signOut(auth);
});
afterAll(async () => { await environment?.cleanup(); if (app) await deleteApp(app); });
async function waitFor(session: AuthSession, status: string) {
  if (session.getSnapshot().status === status) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error(`Session did not reach ${status}`)); }, 10000);
    const unsubscribe = session.subscribe(() => { if (session.getSnapshot().status === status) { clearTimeout(timer); unsubscribe(); resolve(); } });
  });
}

describe('actual Firebase Auth adapter on isolated emulators', () => {
  it('uses the real SDK for login, observed restoration and logout without membership', async () => {
    const gateway = createFirebaseGateway(auth); const session = new AuthSession(async () => gateway); const stop = session.start();
    await waitFor(session, 'unauthenticated'); await session.login(email, password); await waitFor(session, 'authenticated');
    expect(session.getSnapshot()).toMatchObject({ identity: { email }, authorization: { status: 'unassigned' } });
    stop(); const restored = new AuthSession(async () => gateway); const dispose = restored.start();
    await waitFor(restored, 'authenticated'); expect(restored.getSnapshot().identity?.email).toBe(email);
    await restored.logout(); expect(restored.getSnapshot().identity).toBeNull(); dispose();
  });
  it('handles an actual invalid-password response through the session boundary', async () => {
    const session = new AuthSession(async () => createFirebaseGateway(auth)); const stop = session.start();
    await waitFor(session, 'unauthenticated'); await session.login(email, 'incorrect-password');
    expect(session.getSnapshot().error?.kind).toBe('credentials'); expect(session.getSnapshot().identity).toBeNull(); stop();
  });
  it('sends reset requests to the emulator without sending real email', async () => {
    const gateway = createFirebaseGateway(auth); await gateway.requestPasswordReset(email);
    const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/oobCodes`);
    const codes = await response.json() as { oobCodes: { email: string; requestType: string }[] };
    expect(codes.oobCodes.some(code => code.email === email && code.requestType === 'PASSWORD_RESET')).toBe(true);
  });
  it('detects a revoked/deleted emulator identity on token refresh', async () => {
    const gateway = createFirebaseGateway(auth); const identity = await gateway.login(email, password);
    await deleteUser(auth.currentUser!);
    await expect(gateway.checkToken(identity, true)).rejects.toMatchObject({ code: 'auth/invalid-user-token' });
  });
  it('rejects production project configuration when emulator mode is requested', () => {
    expect(() => readFirebaseConfig({ VITE_FIREBASE_USE_EMULATORS: 'true', VITE_FIREBASE_PROJECT_ID: 'billora-pwa',
      VITE_FIREBASE_API_KEY: 'demo', VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_FIREBASE_APP_ID: 'demo' }, true, 'localhost')).toThrow();
  });
});

describe('deny-all business data rules', () => {
  beforeAll(async () => {
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'businesses/a/invoices/i1'), { grandTotal: 100 });
      await setDoc(doc(context.firestore(), 'businesses/b/customers/c1'), { name: 'Isolated fixture' });
    });
  });
  it.each([null, 'alice', 'bob'])('denies document reads, collection queries and all write operations for %s', async uid => {
    const firestore = (uid ? environment.authenticatedContext(uid) : environment.unauthenticatedContext()).firestore();
    const invoice = doc(firestore, 'businesses/a/invoices/i1');
    await assertFails(getDoc(invoice));
    await assertFails(getDoc(doc(firestore, 'businesses/b/customers/c1')));
    await assertFails(getDocs(collection(firestore, 'businesses/a/invoices')));
    await assertFails(setDoc(doc(firestore, 'businesses/a/invoices/new'), { grandTotal: 1 }));
    await assertFails(updateDoc(invoice, { grandTotal: 2 })); await assertFails(deleteDoc(invoice));
  });
  it('denies forged role claims and client membership/role writes', async () => {
    const firestore = environment.authenticatedContext('attacker', { role: 'SUPERADMIN', businessId: 'a', superAdmin: true }).firestore();
    await assertFails(getDoc(doc(firestore, 'businesses/a/invoices/i1')));
    await assertFails(setDoc(doc(firestore, 'platformAdmins/attacker'), { role: 'SUPERADMIN' }));
    await assertFails(setDoc(doc(firestore, 'businesses/a/members/attacker'), { role: 'OWNER' }));
  });
});
