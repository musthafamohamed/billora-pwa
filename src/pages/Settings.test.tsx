import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';
import { useStore } from '../lib/store';
import { emptyProfile, type BusinessProfile } from '../lib/types';

vi.mock('../lib/store', () => ({ useStore: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof useStore>;
let finishSave: () => void;
let failSave: (error: Error) => void;
let saved: BusinessProfile[];

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  window.localStorage.clear();
  saved = [];
  const pendingSave = new Promise<void>((resolve, reject) => { finishSave = resolve; failSave = reject; });
  store = {
    loaded: true, welcomed: true, theme: 'light', profile: { ...emptyProfile(), businessName: 'Original business' },
    products: [], customers: [], invoices: [], setTheme: async () => {}, reload: async () => {},
    saveProfileState: async (profile) => { saved.push(profile); await pendingSave; store.profile = profile; },
    upsertProduct: async () => {}, deleteProduct: async () => {}, upsertCustomer: async (c) => c,
    upsertInvoice: async () => {}, deleteInvoice: async () => {}, setWelcomed: async () => {}, replaceAll: async () => {},
  };
  vi.mocked(useStore).mockImplementation(() => store);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Settings />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function editName(name: string) {
  const input = container.querySelector<HTMLInputElement>('[name="businessName"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, name);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

function businessName() { return container.querySelector<HTMLInputElement>('[name="businessName"]')!.value; }

describe('saving settings', () => {
  it('keeps a newer edit made while an earlier save is pending', async () => {
    await editName('Saved business');
    await submit();
    await editName('Newer unsaved business');
    await act(async () => { finishSave(); await Promise.resolve(); root.render(<Settings />); });
    expect(store.profile.businessName).toBe('Saved business');
    expect(businessName()).toBe('Newer unsaved business');
    expect(container.textContent).toContain('unsaved');
  });

  it('prevents duplicate submits while a save is pending', async () => {
    await editName('Save once');
    await submit();
    await submit();
    expect(saved).toHaveLength(1);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(async () => { finishSave(); });
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('preserves edits and allows retry after a failed save', async () => {
    await editName('Keep this business');
    await submit();
    await act(async () => { failSave(new Error('Disk full')); });
    expect(businessName()).toBe('Keep this business');
    expect(container.querySelector('[role="alert"]')?.textContent ?? '').toContain('Could not save');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(store.profile.businessName).toBe('Original business');
    store.saveProfileState = async (profile) => { store.profile = profile; };
    await act(async () => root.render(<Settings />));
    await submit();
    expect(store.profile.businessName).toBe('Keep this business');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
