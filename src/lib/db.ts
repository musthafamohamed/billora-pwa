import Dexie, { type Table } from 'dexie';
import type { BusinessProfile, Customer, Invoice, Product } from './types';

export interface MetaRow { key: string; value: string }

class SimpleBillDB extends Dexie {
  products!: Table<Product, string>;
  customers!: Table<Customer, string>;
  invoices!: Table<Invoice, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('simple-bill-db');
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

export async function getProfile(): Promise<BusinessProfile | null> {
  const row = await db.meta.get('profile');
  if (!row) return null;
  try { return JSON.parse(row.value) as BusinessProfile; } catch { return null; }
}

export async function saveProfile(profile: BusinessProfile): Promise<void> {
  await db.meta.put({ key: 'profile', value: JSON.stringify(profile) });
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row ? row.value : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
