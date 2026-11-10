import type { BackupData, BusinessProfile, Customer, Invoice, Product } from './types';
import { decodeBackup } from './data/codecs';
import type { ValidationIssue } from '../../shared/billing/validation';
export type { BackupData } from './types';

export function buildBackup(profile: BusinessProfile | null, products: Product[], customers: Customer[], invoices: Invoice[]): BackupData {
  return { app: 'simple-bill', version: 1, exportedAt: new Date().toISOString(), profile, products, customers, invoices };
}

/** Pure preflight: never opens a database or changes supplied records. */
export const preflightBackup = decodeBackup;
/** Compatibility API for existing restore callers. Warnings do not block restore. */
export function validateBackup(data: unknown): string[] {
  return preflightBackup(data).errors.map(i => `${i.path}: ${i.message}`);
}
export function parseBackup(text: string): { data: BackupData | null; errors: string[]; warnings: ValidationIssue[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { data: null, errors: ['File is not valid JSON.'], warnings: [] }; }
  const result = preflightBackup(parsed);
  return { ...result, errors: result.errors.map(i => `${i.path}: ${i.message}`) };
}
