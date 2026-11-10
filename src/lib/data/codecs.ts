import type { BackupData, BusinessProfile, Customer, Invoice, Product } from '../../../shared/billing/types';
import { validateBackupData, validateRecord, type RecordKind, type ValidationIssue } from '../../../shared/billing/validation';

export interface DecodeResult<T> { data: T | null; errors: ValidationIssue[]; warnings: ValidationIssue[] }
function result<T>(value: unknown, issues: ValidationIssue[]): DecodeResult<T> {
  const errors = issues.filter(i => i.severity === 'error');
  return { data: errors.length ? null : value as T, errors, warnings: issues.filter(i => i.severity === 'warning') };
}
// Validation precedes narrowing. Decoding deliberately returns the original
// serialized shape: optional charge/taxSplit/line hsnSacCode stay absent.
function decode<T>(kind: RecordKind, value: unknown): DecodeResult<T> { return result(value, validateRecord(kind, value)); }
export const decodeProduct = (value: unknown) => decode<Product>('product', value);
export const decodeCustomer = (value: unknown) => decode<Customer>('customer', value);
export const decodeInvoice = (value: unknown) => decode<Invoice>('invoice', value);
export const decodeProfile = (value: unknown) => decode<BusinessProfile>('profile', value);
export const decodeBackup = (value: unknown) => result<BackupData>(value, validateBackupData(value));

export class DataValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'DataValidationError';
  }
}
export function requireDecoded<T>(decoded: DecodeResult<T>): T {
  if (decoded.data === null) throw new DataValidationError(decoded.errors);
  return decoded.data;
}
