import type { BusinessProfile, Customer, Invoice, Product } from './types';

export interface BackupData {
  app: 'simple-bill';
  version: 1;
  exportedAt: string;
  profile: BusinessProfile | null;
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
}

export function buildBackup(
  profile: BusinessProfile | null,
  products: Product[],
  customers: Customer[],
  invoices: Invoice[],
): BackupData {
  return { app: 'simple-bill', version: 1, exportedAt: new Date().toISOString(), profile, products, customers, invoices };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Strict validation: malformed or wrong-shape JSON is rejected before
 *  any existing data is touched. Returns error strings (empty = valid). */
export function validateBackup(data: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(data)) return ['Backup file is not a JSON object.'];
  if (data.app !== 'simple-bill') errors.push('This file is not a Simple Bill backup.');
  if (data.version !== 1) errors.push('Unsupported backup version.');
  if (!Array.isArray(data.products)) errors.push('Backup is missing the products list.');
  if (!Array.isArray(data.customers)) errors.push('Backup is missing the customers list.');
  if (!Array.isArray(data.invoices)) errors.push('Backup is missing the invoices list.');
  if (data.profile !== null && data.profile !== undefined && !isObj(data.profile)) {
    errors.push('Backup business profile is invalid.');
  }
  if (Array.isArray(data.products)) {
    data.products.forEach((p, i) => {
      if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.sellingPrice !== 'number') {
        errors.push(`Product #${i + 1} is incomplete.`);
      }
    });
  }
  if (Array.isArray(data.customers)) {
    data.customers.forEach((c, i) => {
      if (!isObj(c) || typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.phone !== 'string') {
        errors.push(`Customer #${i + 1} is incomplete.`);
      }
    });
  }
  if (Array.isArray(data.invoices)) {
    data.invoices.forEach((inv, i) => {
      if (!isObj(inv) || typeof inv.id !== 'string' || typeof inv.invoiceNumber !== 'string'
        || !['TAX', 'NON_TAX'].includes(String(inv.invoiceType))
        || !['DRAFT', 'FINAL', 'CANCELLED'].includes(String(inv.status))
        || !Array.isArray(inv.lineItems) || !isObj(inv.customerSnapshot) || !isObj(inv.businessSnapshot)
        || typeof inv.grandTotal !== 'number') {
        errors.push(`Invoice #${i + 1} is incomplete.`);
      }
    });
  }
  return errors;
}

export function parseBackup(text: string): { data: BackupData | null; errors: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { data: null, errors: ['File is not valid JSON.'] }; }
  const errors = validateBackup(parsed);
  if (errors.length) return { data: null, errors };
  return { data: parsed as BackupData, errors: [] };
}
