import Dexie, { type Table } from 'dexie';
import type { BusinessProfile, Customer, Invoice, Product } from './types';
import { DataValidationError, decodeProfile, requireDecoded } from './data/codecs';

export interface MetaRow { key: string; value: string }

export class SimpleBillDB extends Dexie {
  products!: Table<Product, string>;
  customers!: Table<Customer, string>;
  invoices!: Table<Invoice, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'simple-bill-db') {
    super(name);
    // Version 1: keep the schema stable across upgrades so existing
    // IndexedDB data survives normal app updates.
    this.version(1).stores({
      products: 'id, isActive, createdAt',
      customers: 'id, phone, createdAt',
      invoices: 'id, invoiceNumber, status, invoiceType, issueDate, customerId, createdAt',
      meta: 'key',
    });
  }
}

export const db = new SimpleBillDB();

export async function getProfile(database: SimpleBillDB = db): Promise<BusinessProfile | null> {
  const row = await database.meta.get('profile');
  if (!row) return null;
  let value: unknown;
  try { value = JSON.parse(row.value); } catch {
    throw new DataValidationError([{ code: 'json', path: 'profile', message: 'Stored business profile is not valid JSON.', severity: 'error' }]);
  }
  return requireDecoded(decodeProfile(value));
}

export async function saveProfile(profile: BusinessProfile, database: SimpleBillDB = db): Promise<void> {
  await database.meta.put({ key: 'profile', value: JSON.stringify(requireDecoded(decodeProfile(profile))) });
}

export async function getMeta(key: string, database: SimpleBillDB = db): Promise<string | null> {
  const row = await database.meta.get(key);
  return row ? row.value : null;
}

export async function setMeta(key: string, value: string, database: SimpleBillDB = db): Promise<void> {
  await database.meta.put({ key, value });
}
