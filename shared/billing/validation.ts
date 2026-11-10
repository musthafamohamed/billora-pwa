import type { Invoice } from './types';
import { calcLine, round2, validateForFinalize } from './calc';

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
export type RecordKind = 'product' | 'customer' | 'profile' | 'invoice';
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export const isTimestamp = (v: unknown): v is string => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
  && isDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
export const issue = (code: string, path: string, message: string, severity: ValidationIssue['severity'] = 'error'): ValidationIssue =>
  ({ code, path, message, severity });
const profileStrings = ['businessName', 'proprietorName', 'phone', 'email', 'address', 'gstin', 'state', 'stateCode', 'logo',
  'bankName', 'accountHolderName', 'accountNumber', 'ifsc', 'upiId'];
const customerStrings = ['id', 'name', 'phone', 'email', 'billingAddress', 'gstin', 'state'];
const lineMoney = ['quantity', 'unitPrice', 'discountValue', 'taxRate', 'lineSubtotal', 'lineDiscount', 'lineTaxable', 'lineTax', 'lineTotal'];
const totalMoney = ['subtotal', 'discountAmount', 'taxableAmount', 'totalTax', 'grandTotal'];

/** Shape and financial checks on unknown serialized records. Drafts may be
 * incomplete and contain finite inputs being corrected; those are warnings.
 * No defaults, recalculation or other mutation is applied to the record. */
export function validateRecord(kind: RecordKind, value: unknown, path: string = kind): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, at: string, message: string, severity: ValidationIssue['severity'] = 'error') => issues.push(issue(code, at, message, severity));
  if (!isRecord(value)) return [issue('shape', path, 'Expected an object.')];
  const strings = (v: Record<string, unknown>, keys: string[], at: string) => {
    for (const key of keys) if (typeof v[key] !== 'string') add('string', `${at}.${key}`, 'Expected a string.');
  };
  const required = (v: Record<string, unknown>, key: string, at: string) => {
    if (typeof v[key] !== 'string' || !v[key].trim()) add('required', `${at}.${key}`, 'A non-empty identifier or name is required.');
  };
  const money = (v: Record<string, unknown>, keys: string[], at: string, draft = false) => {
    for (const key of keys) {
      const n = v[key];
      if (typeof n !== 'number' || !Number.isFinite(n)) add('finite_number', `${at}.${key}`, 'Expected a finite number.');
      else if (n < 0) add('negative_number', `${at}.${key}`, 'Value cannot be negative.', draft ? 'warning' : 'error');
    }
  };
  const rate = (v: Record<string, unknown>, key: string, at: string, draft = false) => {
    if (typeof v[key] === 'number' && v[key] > 100) add('rate', `${at}.${key}`, 'Rate cannot exceed 100.', draft ? 'warning' : 'error');
  };
  const oneOf = (v: Record<string, unknown>, key: string, choices: string[], at: string) => {
    if (!choices.includes(v[key] as string)) add('enum', `${at}.${key}`, `Expected ${choices.join(', ')}.`);
  };
  if (kind === 'profile') {
    strings(value, [...profileStrings, 'invoicePrefix', 'termsAndConditions'], path);
    money(value, ['defaultTaxRate'], path); rate(value, 'defaultTaxRate', path);
    return issues;
  }
  required(value, 'id', path);
  for (const key of ['createdAt', 'updatedAt']) if (!isTimestamp(value[key])) add('timestamp', `${path}.${key}`, 'Expected an ISO timestamp.');
  if (kind === 'product') {
    strings(value, ['name', 'description', 'unit', 'hsnSacCode'], path); required(value, 'name', path);
    money(value, ['sellingPrice', 'defaultTaxRate'], path); rate(value, 'defaultTaxRate', path);
    if (typeof value.isActive !== 'boolean') add('boolean', `${path}.isActive`, 'Expected a boolean.');
    return issues;
  }
  if (kind === 'customer') {
    strings(value, [...customerStrings, 'notes'], path); required(value, 'name', path);
    return issues;
  }
  const draft = value.status === 'DRAFT';
  strings(value, ['invoiceNumber', 'customerId', 'notes', 'termsAndConditions'], path);
  required(value, 'invoiceNumber', path);
  oneOf(value, 'status', ['DRAFT', 'FINAL', 'CANCELLED'], path);
  oneOf(value, 'invoiceType', ['TAX', 'NON_TAX'], path);
  for (const key of ['issueDate', 'dueDate']) {
    if (value[key] === '' && (draft || key === 'dueDate')) continue;
    if (!isDate(value[key])) add('date', `${path}.${key}`, 'Expected a valid YYYY-MM-DD date.');
  }
  for (const [key, fields] of [['businessSnapshot', profileStrings], ['customerSnapshot', customerStrings]] as const) {
    const snapshot = value[key];
    if (!isRecord(snapshot)) add('snapshot', `${path}.${key}`, 'Required invoice snapshot is missing.');
    else strings(snapshot, fields, `${path}.${key}`);
  }
  if (isRecord(value.customerSnapshot) && value.customerSnapshot.id !== value.customerId && value.customerId !== '') {
    add('snapshot_reference', `${path}.customerSnapshot.id`, 'Snapshot customer ID does not match the invoice customer.');
  }
  money(value, totalMoney, path, draft);
  if (value.additionalChargeAmount !== undefined) money(value, ['additionalChargeAmount'], path, draft);
  if (value.additionalChargeLabel !== undefined) strings(value, ['additionalChargeLabel'], path);
  if (value.taxSplit !== undefined) oneOf(value, 'taxSplit', ['AUTO', 'CGST_SGST', 'IGST', 'GST'], path);
  // These invoice-level optional omissions are supported for legacy records. Preserve absence on decode.
  for (const key of ['additionalChargeLabel', 'additionalChargeAmount', 'taxSplit']) if (value[key] === undefined) {
    add('legacy_optional', `${path}.${key}`, 'Legacy optional field is absent; existing display defaults apply.', 'warning');
  }
  if (!isRecord(value.taxBreakdown)) add('shape', `${path}.taxBreakdown`, 'Tax breakdown is required.');
  else {
    oneOf(value.taxBreakdown, 'kind', ['CGST_SGST', 'IGST', 'GST', 'NONE'], `${path}.taxBreakdown`);
    money(value.taxBreakdown, ['cgst', 'sgst', 'igst', 'gst'], `${path}.taxBreakdown`, draft);
  }
  if (!Array.isArray(value.lineItems)) add('shape', `${path}.lineItems`, 'Expected an item list.');
  else {
    issues.push(...duplicateIssues(value.lineItems, 'id', `${path}.lineItems`));
    Array.from(value.lineItems).forEach((line, i) => {
      const at = `${path}.lineItems[${i}]`;
      if (!isRecord(line)) { add('shape', at, 'Expected a line item object.'); return; }
      required(line, 'id', at);
      strings(line, ['productId', 'productName', 'description', 'unit'], at);
      if (line.hsnSacCode !== undefined) strings(line, ['hsnSacCode'], at);
      oneOf(line, 'discountType', ['NONE', 'PERCENTAGE', 'FIXED'], at);
      money(line, lineMoney, at, draft); rate(line, 'taxRate', at, draft);
      if (line.discountType === 'PERCENTAGE') rate(line, 'discountValue', at, draft);
    });
  }
  // Only inspect arithmetic after all required shapes and finite fields are safe.
  if (!issues.some(i => i.severity === 'error')) {
    const inv = value as unknown as Invoice;
    const severity = draft ? 'warning' : 'error';
    const matches = (actual: number, expected: number, at: string) => {
      if (!Number.isFinite(expected) || Math.abs(actual - expected) > 0.000001) add('financial_mismatch', at, 'Stored financial value is inconsistent; no recalculation was applied.', severity);
    };
    inv.lineItems.forEach((line, i) => {
      const expected = calcLine(line, inv.invoiceType);
      for (const key of Object.keys(expected) as (keyof typeof expected)[]) matches(line[key], expected[key], `${path}.lineItems[${i}].${key}`);
    });
    for (const [total, lineKey] of [['subtotal', 'lineSubtotal'], ['discountAmount', 'lineDiscount'], ['taxableAmount', 'lineTaxable'], ['totalTax', 'lineTax']] as const) {
      matches(inv[total], round2(inv.lineItems.reduce((sum, line) => sum + line[lineKey], 0)), `${path}.${total}`);
    }
    matches(inv.grandTotal, round2(inv.taxableAmount + inv.totalTax + (inv.additionalChargeAmount ?? 0)), `${path}.grandTotal`);
    const tax = inv.taxBreakdown;
    matches(round2(tax.cgst + tax.sgst + tax.igst + tax.gst), inv.totalTax, `${path}.taxBreakdown`);
    if (tax.kind === 'CGST_SGST') {
      matches(tax.cgst, round2(inv.totalTax / 2), `${path}.taxBreakdown.cgst`);
      matches(tax.sgst, round2(inv.totalTax - round2(inv.totalTax / 2)), `${path}.taxBreakdown.sgst`);
    }
    const allowed = tax.kind === 'CGST_SGST' ? ['cgst', 'sgst'] : tax.kind === 'IGST' ? ['igst'] : tax.kind === 'GST' ? ['gst'] : [];
    for (const key of ['cgst', 'sgst', 'igst', 'gst'] as const) if (!allowed.includes(key)) matches(tax[key], 0, `${path}.taxBreakdown.${key}`);
    if (inv.invoiceType === 'NON_TAX' && (tax.kind !== 'NONE' || inv.totalTax !== 0)) add('financial_mismatch', `${path}.taxBreakdown`, 'Non-tax invoices must have no tax.', severity);
    if (!draft) {
      for (const message of validateForFinalize(inv.customerId, inv.lineItems)) add('finalization', path, message);
    }
  }
  return issues;
}

export function duplicateIssues(records: unknown[], key: string, path: string): ValidationIssue[] {
  const seen = new Set<string>(); const issues: ValidationIssue[] = [];
  records.forEach((record, i) => {
    if (!isRecord(record) || typeof record[key] !== 'string' || !record[key]) return;
    if (seen.has(record[key])) issues.push(issue(key === 'invoiceNumber' ? 'duplicate_invoice_number' : 'duplicate_id', `${path}[${i}].${key}`, `Duplicate ${key}: ${record[key]}.`));
    seen.add(record[key]);
  });
  return issues;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(key => sameValue(a[key], b[key]));
}

/** Cancellation preserves every stored field except status and updatedAt.
 * Comparing unknown extra fields also prevents future fields bypassing this rule. */
export function validateInvoiceTransition(previous: Invoice | undefined, next: Invoice): ValidationIssue[] {
  if (!previous || previous.status === 'DRAFT') return [];
  if (previous.status !== 'FINAL' || next.status !== 'CANCELLED') {
    return [issue('status_transition', 'invoice.status', 'This invoice is already final or cancelled. Reload it before making changes.')];
  }
  const { status: _oldStatus, updatedAt: _oldTime, ...oldContent } = previous;
  const { status: _newStatus, updatedAt: _newTime, ...newContent } = next;
  return sameValue(oldContent, newContent) ? [] : [issue('immutable_invoice', 'invoice', 'Cancellation must preserve all invoice contents and financial values.')];
}

/** Pure full-export preflight. Missing mutable source records are recoverable
 * when a readable historical snapshot exists; mismatched snapshot IDs are not. */
export function validateBackupData(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) return [issue('shape', 'backup', 'Backup must be a JSON object.')];
  const issues: ValidationIssue[] = [];
  if (value.app !== 'simple-bill') issues.push(issue('app', 'backup.app', 'This file is not a Simple Bill backup.'));
  if (value.version !== 1) issues.push(issue('version', 'backup.version', 'Unsupported backup version.'));
  if (!isTimestamp(value.exportedAt)) issues.push(issue('timestamp', 'backup.exportedAt', 'Expected an ISO export timestamp.'));
  if (value.profile !== null) issues.push(...validateRecord('profile', value.profile, 'backup.profile'));
  for (const [key, kind] of [['products', 'product'], ['customers', 'customer'], ['invoices', 'invoice']] as const) {
    const records = value[key];
    if (!Array.isArray(records)) { issues.push(issue('shape', `backup.${key}`, `Backup is missing the ${key} list.`)); continue; }
    issues.push(...duplicateIssues(records, 'id', `backup.${key}`));
    if (key === 'invoices') issues.push(...duplicateIssues(records, 'invoiceNumber', 'backup.invoices'));
    Array.from(records).forEach((record, i) => issues.push(...validateRecord(kind, record, `backup.${key}[${i}]`)));
  }
  if (!issues.some(i => i.severity === 'error')) {
    const backup = value as unknown as import('./types').BackupData;
    const products = new Set(backup.products.map(p => p.id));
    const customers = new Set(backup.customers.map(c => c.id));
    backup.invoices.forEach((inv, i) => {
      if (inv.customerId && !customers.has(inv.customerId)) issues.push(issue('missing_reference', `backup.invoices[${i}].customerId`, 'Source customer is absent; preserved invoice snapshot remains available.', 'warning'));
      inv.lineItems.forEach((line, j) => {
        if (line.productId && !products.has(line.productId)) issues.push(issue('missing_reference', `backup.invoices[${i}].lineItems[${j}].productId`, 'Source product is absent; preserved line snapshot remains available.', 'warning'));
      });
    });
  }
  return issues;
}
