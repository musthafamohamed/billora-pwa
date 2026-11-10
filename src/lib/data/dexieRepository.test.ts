import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimpleBillDB } from '../db';
import { createDexieRepository } from './dexieRepository';
import { backup, customer, invoice, product } from './fixtures.test-support';
import { emptyProfile } from '../types';

let database: SimpleBillDB;
let repository: ReturnType<typeof createDexieRepository>;
beforeEach(() => {
  database = new SimpleBillDB(`billora-test-${crypto.randomUUID()}`);
  repository = createDexieRepository(database);
});
afterEach(async () => { await database.delete(); });

describe('existing Dexie repository', () => {
  it('creates and updates products/customers with stable IDs and ordering', async () => {
    await repository.upsertProduct(product);
    await repository.upsertProduct({ ...product, sellingPrice: 200 });
    await repository.upsertCustomer(customer);
    await repository.upsertCustomer({ ...customer, phone: '123' });
    expect((await repository.listProducts()).map(p => [p.id, p.sellingPrice])).toEqual([['p1', 200]]);
    expect((await repository.listCustomers()).map(c => [c.id, c.phone])).toEqual([['c1', '123']]);
    await repository.deleteProduct('p1');
    expect(await repository.listProducts()).toEqual([]);
  });
  it('persists profile and local metadata across adapter recreation', async () => {
    const profile = { ...emptyProfile(), businessName: 'Local business' };
    await repository.saveProfile(profile); await repository.setMeta('theme', 'dark');
    const reopened = createDexieRepository(database);
    expect(await reopened.getProfile()).toEqual(profile);
    expect(await reopened.getMeta('theme')).toBe('dark');
    expect(await reopened.getMeta('absent')).toBeNull();
  });
  it('supports incomplete draft autosave, edits, finalization and status-only cancellation', async () => {
    const draft = invoice({ status: 'DRAFT', issueDate: '', lineItems: [] });
    await repository.upsertInvoice(draft);
    expect((await repository.listInvoices())[0]).toEqual(draft);
    await repository.upsertInvoice(invoice({ status: 'DRAFT' }));
    await repository.upsertInvoice(invoice());
    await repository.upsertInvoice(invoice({ status: 'CANCELLED' }));
    expect((await repository.listInvoices())[0]).toEqual(invoice({ status: 'CANCELLED' }));
    await expect(repository.upsertInvoice(invoice({ status: 'DRAFT' }))).rejects.toThrow();
    await repository.deleteInvoice('i1'); expect(await repository.listInvoices()).toEqual([]);
  });
  it('atomically prevents stale concurrent drafts from downgrading a finalized invoice', async () => {
    await repository.upsertInvoice(invoice({ status: 'DRAFT' }));
    const results = await Promise.allSettled([
      repository.upsertInvoice(invoice()), repository.upsertInvoice(invoice({ status: 'DRAFT', notes: 'stale' })),
    ]);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((await database.invoices.get('i1'))?.status).toBe('FINAL');
    await expect(repository.upsertInvoice(invoice({ status: 'CANCELLED', notes: 'tampered' }))).rejects.toThrow();
    expect((await database.invoices.get('i1'))?.notes).toBe('');
  });
  it('rejects malformed writes and restore preflight without clearing existing data', async () => {
    await repository.upsertProduct(product);
    await expect(repository.upsertProduct({ ...product, sellingPrice: NaN })).rejects.toThrow();
    const bad = backup(); bad.invoices.push(invoice());
    await expect(repository.replaceAll(bad)).rejects.toThrow();
    expect(await database.products.toArray()).toEqual([product]);
    expect(await database.invoices.count()).toBe(0);
  });
  it('rolls back all tables and profile if restore encounters a database write failure', async () => {
    await repository.replaceAll(backup());
    const replacement = backup(); replacement.products[0].sellingPrice = 500;
    replacement.profile.businessName = 'Replacement';
    Object.assign(replacement.customers[0], { uncloneable: () => {} });
    await expect(repository.replaceAll(replacement)).rejects.toThrow();
    expect(await repository.listProducts()).toEqual([product]);
    expect((await repository.getProfile())?.businessName).toBe('');
    expect(await repository.listInvoices()).toEqual([invoice()]);
  });
  it('opens existing v1 tables without changing records or removing duplicate names', async () => {
    // Build the pre-refactor schema independently, then open it through the adapter.
    const legacy = new Dexie(database.name);
    legacy.version(1).stores({
      products: 'id, isActive, createdAt', customers: 'id, phone, createdAt',
      invoices: 'id, invoiceNumber, status, invoiceType, issueDate, customerId, createdAt', meta: 'key',
    });
    await legacy.table('products').bulkPut([product, { ...product, id: 'p2' }]);
    const inv = invoice(); await legacy.table('invoices').put(inv);
    legacy.close();
    await database.open();
    expect(database.verno).toBe(1);
    expect((await repository.listProducts()).map(p => p.id)).toEqual(['p1', 'p2']);
    expect(await repository.listInvoices()).toEqual([inv]);
    expect(database.tables.map(t => t.name).sort()).toEqual(['customers', 'invoices', 'meta', 'products']);
  });
  it('reports corrupt stored records without rewriting or deleting them', async () => {
    const malformed = { ...product, sellingPrice: -1 };
    await database.products.put(malformed);
    await expect(repository.listProducts()).rejects.toMatchObject({ name: 'DataValidationError' });
    expect(await database.products.get('p1')).toEqual(malformed);
    await database.meta.put({ key: 'profile', value: '{broken' });
    await expect(repository.getProfile()).rejects.toMatchObject({ name: 'DataValidationError' });
    expect((await database.meta.get('profile'))?.value).toBe('{broken');
  });
});

it('reports records missing index fields instead of silently omitting them', async () => {
  await database.products.put({ ...product, createdAt: undefined } as unknown as typeof product);
  await expect(repository.listProducts()).rejects.toMatchObject({ name: 'DataValidationError' });
  expect(await database.products.count()).toBe(1);
});

it('preserves date sorting and primary-key tie ordering after decoding full tables', async () => {
  await database.products.bulkPut([
    { ...product, id: 'p2' }, product, { ...product, id: 'p0', createdAt: '2026-11-08T08:00:00.000Z' },
  ]);
  await database.invoices.bulkPut([invoice(), invoice({ id: 'i2', invoiceNumber: 'INV-2026-0002' }),
    invoice({ id: 'i0', invoiceNumber: 'INV-2026-0000', issueDate: '2026-11-08' })]);
  expect((await repository.listProducts()).map(p => p.id)).toEqual(['p0', 'p1', 'p2']);
  expect((await repository.listInvoices()).map(i => i.id)).toEqual(['i2', 'i1', 'i0']);
});
