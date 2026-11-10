import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './lib/auth/AuthProvider';
import { PilotRoutes } from './AuthPilot';
import type { AuthGateway, SessionIdentity, Authorization } from './lib/auth/types';

let root: Root; let container: HTMLDivElement;
let current: SessionIdentity | null;
let emit: (identity: SessionIdentity | null) => void;
let loginError: unknown;
let gateway: AuthGateway;
let resets: string[];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); current = null; loginError = null; resets = [];
  window.location.hash = '#/login';
  gateway = {
    currentIdentity: () => current,
    observe: next => { emit = identity => { current = identity; next(identity); }; queueMicrotask(() => next(current)); return () => {}; },
    checkToken: async () => {},
    login: async email => { if (loginError) throw loginError; current = { uid: 'test-user', email }; emit(current); return current; },
    logout: async () => emit(null), requestPasswordReset: async email => { resets.push(email); },
  };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(authorization?: Authorization) {
  const loadGateway = async () => gateway;
  await act(async () => { root.render(<AuthProvider loadGateway={loadGateway} membership={authorization ? async () => authorization : undefined}><PilotRoutes /></AuthProvider>); });
}
async function fill(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === text)!;
  await act(async () => button.click());
}
async function submit() { await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }

describe('authentication pilot UI boundary', () => {
  it('uses labeled login fields and renders pending access after login, without opening Dexie', async () => {
    const opened = vi.spyOn(indexedDB, 'open'); await render();
    expect(container.querySelector('input[type=email]')?.getAttribute('aria-label')).toBe('Email');
    await fill('email', 'developer@example.test'); await fill('password', 'emulator-password'); await submit();
    expect(container.textContent).toContain('Access pending'); expect(container.textContent).toContain('developer@example.test');
    expect(container.querySelector('input[type=password]')).toBeNull(); expect(opened).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('PM SONS'); expect(container.textContent).not.toContain('Create Invoice');
    await click('Sign out'); expect(container.querySelector('input[type=password]')).not.toBeNull();
    expect(container.textContent).not.toContain('developer@example.test');
  });
  it('rejects direct business and legacy route attempts without loading local records', async () => {
    const opened = vi.spyOn(indexedDB, 'open'); await render();
    for (const hash of ['#/invoices', '#/customers', '#/reports', '#/legacy', '#/workspace']) {
      await act(async () => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); });
      expect(container.textContent).not.toContain('Create Invoice'); expect(container.querySelector('form')).not.toBeNull();
    }
    await act(async () => emit({ uid: 'user-a', email: 'a@example.test' }));
    expect(container.textContent).toContain('Access pending'); expect(opened).not.toHaveBeenCalled();
  });
  it('shows a generic credential error and supports the password reset form', async () => {
    await render(); loginError = Object.assign(new Error('private SDK detail'), { code: 'auth/invalid-credential' });
    await fill('email', 'test@example.test'); await fill('password', 'incorrect'); await submit();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Check your email and password');
    expect(container.textContent).not.toContain('private SDK detail');
    await click('Forgot password?'); expect(container.querySelector('input[type=password]')).toBeNull();
    await submit(); expect(resets).toEqual(['test@example.test']); expect(container.querySelector('[role=status]')?.textContent).toContain('If an account');
  });
  it('removes the previous identity on account switching and ignores forged local role hints', async () => {
    localStorage.setItem('role', 'SUPERADMIN'); localStorage.setItem('businessId', 'business-a');
    await render(); await act(async () => emit({ uid: 'a', email: 'a@example.test' }));
    await act(async () => emit({ uid: 'b', email: 'b@example.test' }));
    expect(container.textContent).toContain('b@example.test'); expect(container.textContent).not.toContain('a@example.test');
    expect(container.textContent).toContain('Access pending');
    localStorage.removeItem('role'); localStorage.removeItem('businessId');
  });
  it.each(['SUPERADMIN', 'OWNER', 'STAFF'] as const)('keeps even a verified %s workspace blocked until Phase 3', async role => {
    const membership = role === 'SUPERADMIN' ? { uid: 'a', verifiedAt: '2026-11-09', role, permissions: [] } : { uid: 'a', verifiedAt: '2026-11-09', role, permissions: [], businessId: 'a' };
    await render({ status: 'authorized', membership }); await act(async () => emit({ uid: 'a', email: 'a@example.test' }));
    expect(container.textContent).toContain('Workspace not available yet'); expect(container.textContent).not.toContain('Create Invoice');
  });
  it.each(['suspended', 'unavailable'] as const)('distinguishes authorization state %s', async status => {
    await render({ status }); await act(async () => emit({ uid: 'a', email: 'a@example.test' }));
    expect(container.textContent).toContain(status === 'suspended' ? 'Access paused' : 'Access verification unavailable');
  });
});
