import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StoreProvider, useStore } from '../store';
import { SimpleBillDB } from '../db';
import { createDexieRepository } from './dexieRepository';
import { customer, invoice, product } from './fixtures.test-support';
import { STARTER_PRODUCTS } from '../starter';
import { emptyProfile } from '../types';

let database: SimpleBillDB;
let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof useStore>;
function Consumer() { store = useStore(); return <div>{store.loaded ? `${store.products.length} products; ${store.customers.length} customers; ${store.invoices.length} invoices` : 'loading'}</div>; }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  database = new SimpleBillDB(`billora-store-test-${crypto.randomUUID()}`);
  localStorage.clear(); container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); await database.delete(); vi.unstubAllGlobals();
});
async function mount() {
  const repository = createDexieRepository(database);
  await act(async () => { root.render(<StoreProvider repository={repository}><Consumer /></StoreProvider>); });
  await act(async () => { await store.reload(); });
}
it('retains duplicate starter-named products and serves the existing Store API', async () => {
  const name = STARTER_PRODUCTS[0].name;
  await database.products.bulkPut([{ ...product, name }, { ...product, name, id: 'p2' }]);
  await mount();
  expect(container.textContent).toBe('2 products; 0 customers; 0 invoices');
  expect(await database.products.count()).toBe(2);
  await act(async () => {
    await store.saveProfileState({ ...emptyProfile(), businessName: 'Business' });
    await store.upsertCustomer(customer); await store.upsertInvoice(invoice({ status: 'DRAFT' }));
    await store.upsertProduct({ ...product, sellingPrice: 300 }); await store.setTheme('dark'); await store.setWelcomed();
  });
  expect(store.profile.businessName).toBe('Business'); expect(store.welcomed).toBe(true);
  expect(store.theme).toBe('dark'); expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(store.customers[0]).toEqual(customer); expect(store.invoices[0].id).toBe('i1');
  expect((await database.products.get('p1'))?.sellingPrice).toBe(300);
});
it('seeds once on an empty database and never clears records during reload', async () => {
  await mount();
  await act(async () => { await Promise.all([store.reload(), store.reload()]); });
  expect(store.products).toHaveLength(7);
  expect(await database.products.count()).toBe(7);
  expect(await database.meta.get('profile')).toBeUndefined();
  expect((await database.meta.get('starterSeeded'))?.value).toBe('1');
});
