import { describe, expect, it } from 'vitest';
import { AuthSession } from './session';
import type { AuthGateway, SessionIdentity, Authorization, MembershipLookup } from './types';

const alice = { uid: 'alice', email: 'alice@example.test' };
const bob = { uid: 'bob', email: 'bob@example.test' };
const failure = (code: string) => Object.assign(new Error('SDK details must stay private'), { code });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function fakeGateway(initial: SessionIdentity | null = null) {
  let current = initial;
  let callback: (identity: SessionIdentity | null) => void = () => {};
  let onError: (error: unknown) => void = () => {};
  const controls = { loginFailure: null as unknown, tokenFailure: null as unknown, resetFailure: null as unknown,
    token: null as Promise<void> | null, reset: null as Promise<void> | null, logout: null as Promise<void> | null };
  const gateway: AuthGateway = {
    currentIdentity: () => current,
    observe: (next, error) => { callback = next; onError = error; queueMicrotask(() => next(current)); return () => { callback = () => {}; }; },
    checkToken: async () => { if (controls.tokenFailure) throw controls.tokenFailure; if (controls.token) await controls.token; },
    login: async email => { if (controls.loginFailure) throw controls.loginFailure; current = email === bob.email ? bob : alice; callback(current); return current; },
    logout: async () => { if (controls.logout) await controls.logout; current = null; callback(null); },
    requestPasswordReset: async () => { if (controls.resetFailure) throw controls.resetFailure; if (controls.reset) await controls.reset; },
  };
  return { gateway, controls, emit: (identity: SessionIdentity | null) => { current = identity; callback(identity); },
    setCurrent: (identity: SessionIdentity | null) => { current = identity; }, staleCallback: () => callback, error: (error: unknown) => onError(error) };
}
async function ready(initial: SessionIdentity | null = null, lookup?: MembershipLookup) {
  const fake = fakeGateway(initial); const session = new AuthSession(async () => fake.gateway, lookup); const stop = session.start(); await settle();
  return { ...fake, session, stop };
}

describe('secure authentication session', () => {
  it('starts loading and restores identity without granting membership', async () => {
    const pending = deferred<AuthGateway>(); const session = new AuthSession(() => pending.promise); const stop = session.start();
    expect(session.getSnapshot().status).toBe('loading'); expect(session.getSnapshot().identity).toBeNull();
    const fake = fakeGateway(alice); pending.resolve(fake.gateway); await settle();
    expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', identity: alice, authorization: { status: 'unassigned' }, token: 'cached-or-refreshed' }); stop();
  });
  it('logs in with email/password and never infers a role from identity', async () => {
    const { session, stop } = await ready(); await session.login(alice.email, 'test-password'); await settle();
    expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', identity: alice, authorization: { status: 'unassigned' } }); stop();
  });
  it.each(['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'])('handles %s without leaking raw SDK errors', async code => {
    const { session, controls, stop } = await ready(); controls.loginFailure = failure(code);
    await session.login(alice.email, 'wrong');
    expect(session.getSnapshot()).toMatchObject({ status: 'unauthenticated', identity: null, error: { kind: 'credentials' } });
    expect(session.getSnapshot().error?.message).not.toContain('SDK details'); stop();
  });
  it('handles network failure and allows a login retry', async () => {
    const { session, controls, stop } = await ready(); controls.loginFailure = failure('auth/network-request-failed');
    await session.login(alice.email, 'test-password'); expect(session.getSnapshot().error?.kind).toBe('network');
    controls.loginFailure = null; await session.login(alice.email, 'test-password'); await settle();
    expect(session.getSnapshot().identity).toEqual(alice); expect(session.getSnapshot().error).toBeNull(); stop();
  });
  it('clears identity immediately on logout and supports account switching', async () => {
    const { session, controls, stop } = await ready(alice); const logout = deferred<void>(); controls.logout = logout.promise;
    const signingOut = session.logout(); expect(session.getSnapshot().identity).toBeNull();
    expect(session.getSnapshot().authorization.status).toBe('unassigned'); logout.resolve(); await signingOut;
    expect(session.getSnapshot().status).toBe('unauthenticated'); controls.logout = null;
    await session.login(bob.email, 'other-password'); await settle(); expect(session.getSnapshot().identity).toEqual(bob); stop();
  });
  it('discards a previous account membership response after an account switch', async () => {
    const pending = deferred<Authorization>();
    const { session, emit, stop } = await ready(alice, identity => identity.uid === alice.uid ? pending.promise : Promise.resolve({ status: 'unassigned' }));
    emit(bob); await settle(); pending.resolve({ status: 'suspended' }); await settle();
    expect(session.getSnapshot()).toMatchObject({ identity: bob, authorization: { status: 'unassigned' } }); stop();
  });
  it('ignores stale observer events which do not match the SDK current identity', async () => {
    const { session, emit, staleCallback, stop } = await ready(alice); const oldCallback = staleCallback();
    emit(bob); await settle(); oldCallback(alice); oldCallback(null); await settle();
    expect(session.getSnapshot().identity).toEqual(bob); stop();
  });
  it('prevents a pending token check from restoring identity after logout', async () => {
    const { session, emit, controls, stop } = await ready(alice); const token = deferred<void>(); controls.token = token.promise;
    emit(alice); await settle(); await session.logout(); token.resolve(); await settle();
    expect(session.getSnapshot()).toMatchObject({ status: 'unauthenticated', identity: null }); stop();
  });
  it.each(['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled'])('blocks an invalid or disabled session: %s', async code => {
    const { session, emit, controls, stop } = await ready(alice); controls.tokenFailure = failure(code); emit(alice); await settle();
    expect(session.getSnapshot().identity).toBeNull(); expect(session.getSnapshot().error?.kind).toBe(code === 'auth/user-disabled' ? 'disabled' : 'expired'); stop();
  });
  it('distinguishes cached identity from unavailable token/authorization verification', async () => {
    const { session, emit, controls, stop } = await ready(alice); controls.tokenFailure = failure('auth/network-request-failed'); emit(alice); await settle();
    expect(session.getSnapshot()).toMatchObject({ identity: alice, authorization: { status: 'unavailable' }, token: 'unavailable', error: { kind: 'network' } }); stop();
  });
  it('restores cached authentication while offline without inventing an authorization grace period', async () => {
    const { session, stop } = await ready(alice);
    expect(session.getSnapshot()).toMatchObject({ identity: alice, authorization: { status: 'unassigned' }, token: 'cached-or-refreshed' }); stop();
  });
  it('rejects membership bound to another account', async () => {
    const { session, stop } = await ready(alice, async () => ({ status: 'authorized', membership: { uid: 'bob', role: 'OWNER', businessId: 'business-b', permissions: [], verifiedAt: '2026-11-09T00:00:00Z' } }));
    expect(session.getSnapshot().authorization.status).toBe('unavailable'); stop();
  });
  it('handles observer errors and initialization failures explicitly', async () => {
    const { session, error, stop } = await ready(alice); error(failure('auth/user-token-expired')); await settle();
    expect(session.getSnapshot().identity).toBeNull(); stop();
    const broken = new AuthSession(async () => { throw failure('config/invalid'); }); const dispose = broken.start(); await settle();
    expect(broken.getSnapshot().status).toBe('configuration-error'); dispose();
  });
  it('requests a password reset with a generic confirmation and handles network errors', async () => {
    const { session, controls, stop } = await ready(); await session.requestPasswordReset(alice.email);
    expect(session.getSnapshot().message).toContain('If an account');
    controls.resetFailure = failure('auth/user-not-found'); await session.requestPasswordReset('absent@example.test');
    expect(session.getSnapshot().error).toBeNull(); expect(session.getSnapshot().message).toContain('If an account');
    controls.resetFailure = failure('auth/network-request-failed'); await session.requestPasswordReset(alice.email);
    expect(session.getSnapshot().error?.kind).toBe('network'); stop();
  });
  it('discards callbacks after disposal, including a late client initialization', async () => {
    const pending = deferred<AuthGateway>(); const session = new AuthSession(() => pending.promise); const stop = session.start(); stop();
    pending.resolve(fakeGateway(alice).gateway); await settle(); expect(session.getSnapshot().identity).toBeNull();
  });
});

it('keeps logout failure locked instead of restoring the previous identity from a callback', async () => {
  const { session, controls, emit, stop } = await ready(alice);
  controls.logout = Promise.reject(failure('auth/web-storage-unsupported'));
  await session.logout(); emit(alice); await settle();
  expect(session.getSnapshot()).toMatchObject({ identity: null, needsSignOut: true });
  controls.logout = null; await session.logout();
  expect(session.getSnapshot()).toMatchObject({ status: 'unauthenticated', identity: null, needsSignOut: false }); stop();
});

it('does not let an old password-reset request block logout or write into the next account', async () => {
  const { session, controls, emit, stop } = await ready(); const pending = deferred<void>(); controls.reset = pending.promise;
  const reset = session.requestPasswordReset(alice.email); emit(bob); await settle();
  await session.logout(); pending.resolve(); await reset; await settle();
  expect(session.getSnapshot()).toMatchObject({ status: 'unauthenticated', identity: null, message: null }); stop();
});

it('ignores a failed token result when the SDK account changed before its observer callback', async () => {
  const { session, controls, emit, setCurrent, stop } = await ready(alice); const pending = deferred<void>();
  controls.token = pending.promise; emit(alice); await settle(); setCurrent(bob);
  pending.reject(failure('auth/network-request-failed')); await settle();
  expect(session.getSnapshot().identity).toBeNull();
  controls.token = null; emit(bob); await settle(); expect(session.getSnapshot().identity).toEqual(bob); stop();
});
