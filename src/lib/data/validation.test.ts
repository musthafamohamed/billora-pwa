import { describe, expect, it } from 'vitest';
import { decodeInvoice, decodeProduct, decodeCustomer, decodeProfile } from './codecs';
import { preflightBackup, parseBackup } from '../backup';
import { validateInvoiceTransition } from '../../../shared/billing/validation';
import { calcInvoice } from '../../../shared/billing/calc';
import { emptyProfile } from '../types';
import { backup, customer, invoice, product } from './fixtures.test-support';

const errors = (data: unknown) => preflightBackup(data).errors;
describe('shared billing and serialized boundaries', () => {
  it('preserves tax, discount, totals and legacy snapshot bytes without inserting defaults', () => {
    const inv = invoice(); const before = JSON.stringify(inv);
    expect(decodeInvoice(inv).data).toEqual(inv);
    expect(JSON.stringify(inv)).toBe(before);
    expect(inv).not.toHaveProperty('additionalChargeAmount');
    expect(decodeInvoice(inv).warnings.length).toBeGreaterThan(0);
    const result = calcInvoice(inv.lineItems, 'TAX', 'Kerala', 'Kerala');
    expect([result.subtotal, result.discountAmount, result.totalTax, result.grandTotal]).toEqual([200, 20, 32.4, 212.4]);
    expect(calcInvoice(inv.lineItems, 'NON_TAX', '', '').grandTotal).toBe(180);
  });
  it('accepts incomplete finite drafts for autosave but rejects them as finalization candidates', () => {
    const draft = invoice({ status: 'DRAFT', customerId: '', issueDate: '', lineItems: [] });
    expect(decodeInvoice(draft).errors).toEqual([]);
    expect(decodeInvoice({ ...draft, status: 'FINAL' }).errors.length).toBeGreaterThan(0);
  });
  it.each([NaN, Infinity, -1])('reports malformed product money %s and leaves input alone', value => {
    const p = { ...product, sellingPrice: value };
    expect(decodeProduct(p).errors.some(e => e.path.endsWith('sellingPrice'))).toBe(true);
    expect(Object.is(p.sellingPrice, value)).toBe(true);
  });
  it('validates customer and profile shapes rather than asserting JSON types', () => {
    expect(decodeCustomer(customer).data).toEqual(customer);
    expect(decodeProfile(emptyProfile()).errors).toEqual([]);
    expect(decodeCustomer({ ...customer, createdAt: 'yesterday' }).data).toBeNull();
    expect(decodeProfile({ ...emptyProfile(), defaultTaxRate: Infinity }).data).toBeNull();
  });
  it('detects duplicate IDs in each collection and duplicate invoice numbers', () => {
    for (const key of ['products', 'customers', 'invoices'] as const) {
      const b = backup(); (b[key] as unknown[]).push(b[key][0]);
      expect(errors(b).some(e => e.code === 'duplicate_id')).toBe(true);
    }
    const b = backup(); b.invoices.push(invoice({ id: 'i2' }));
    expect(errors(b).some(e => e.code === 'duplicate_invoice_number')).toBe(true);
  });
  it.each(['2026-02-30', '2026-13-01', 'not a date'])('rejects invalid calendar date %s', issueDate => {
    const b = backup(); b.invoices[0].issueDate = issueDate;
    expect(errors(b).some(e => e.path.endsWith('issueDate'))).toBe(true);
  });
  it('rejects malformed lines, missing snapshots, nonfinite money and inconsistent financial structures', () => {
    const inv = invoice();
    for (const bad of [ { ...inv, lineItems: [null] }, { ...inv, businessSnapshot: {} },
      { ...inv, grandTotal: Infinity }, { ...inv, grandTotal: 999 },
      { ...inv, taxBreakdown: { ...inv.taxBreakdown, igst: 32.4 } },
      { ...inv, lineItems: [{ ...inv.lineItems[0], lineTotal: 1 }] } ]) {
      expect(decodeInvoice(bad).data).toBeNull();
    }
  });
  it('reports missing source references as warnings when historical snapshots are readable', () => {
    const b = backup(); b.customers = []; b.products = [];
    const result = preflightBackup(b);
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter(w => w.code === 'missing_reference')).toHaveLength(2);
    b.invoices[0].customerSnapshot.id = 'other';
    expect(errors(b).some(e => e.code === 'snapshot_reference')).toBe(true);
  });
  it('allows custom line items and detects duplicate line identifiers', () => {
    const b = backup(); b.invoices[0].lineItems[0].productId = '';
    expect(errors(b)).toEqual([]);
    b.invoices[0].lineItems.push(b.invoices[0].lineItems[0]);
    expect(errors(b).some(e => e.code === 'duplicate_id')).toBe(true);
  });
  it('preflights without mutating data and rejects unsupported versions or missing envelopes', () => {
    const b = backup(); const before = JSON.stringify(b);
    expect(errors(b)).toEqual([]); expect(JSON.stringify(b)).toBe(before);
    expect(errors({ ...b, version: 2 }).length).toBeGreaterThan(0);
    expect(errors({ ...b, exportedAt: 'bad' }).length).toBeGreaterThan(0);
    expect(parseBackup(JSON.stringify(b)).data).toEqual(b);
    expect(parseBackup('{}').data).toBeNull();
  });
  it('allows only status and update-time changes during final cancellation', () => {
    const previous = invoice(); const cancelled = { ...previous, status: 'CANCELLED' as const, updatedAt: '2026-11-10T00:00:00.000Z' };
    expect(validateInvoiceTransition(previous, cancelled)).toEqual([]);
    for (const next of [{ ...cancelled, grandTotal: 0 }, { ...cancelled, notes: 'changed' },
      { ...cancelled, invoiceNumber: 'other' }, { ...cancelled, businessSnapshot: { ...previous.businessSnapshot, phone: '1' } }]) {
      expect(validateInvoiceTransition(previous, next).length).toBeGreaterThan(0);
    }
    expect(validateInvoiceTransition(previous, { ...cancelled, status: 'DRAFT' }).length).toBeGreaterThan(0);
  });
});

it.each(['quantity', 'unitPrice', 'discountValue', 'taxRate'] as const)('rejects non-finite %s at the finalization boundary', async key => {
  const { validateForFinalize } = await import('../../../shared/billing/calc');
  for (const value of [NaN, Infinity]) {
    expect(validateForFinalize('c1', [{ ...invoice().lineItems[0], [key]: value }]).length).toBeGreaterThan(0);
  }
});
it('preserves blank business fields from the supported skipped-setup workflow', () => {
  const inv = invoice();
  inv.businessSnapshot.businessName = '';
  expect(decodeInvoice(inv).data).toEqual(inv);
});

it('keeps finite inputs being corrected in drafts and reports their warnings', () => {
  const draft = invoice({ status: 'DRAFT' });
  draft.lineItems[0].unitPrice = -1;
  const result = decodeInvoice(draft);
  expect(result.errors).toEqual([]);
  expect(result.warnings.some(i => i.code === 'negative_number')).toBe(true);
  expect(result.data?.lineItems[0].unitPrice).toBe(-1);
});

it('returns structured errors for sparse serialized lists rather than throwing or dropping rows', () => {
  expect(decodeInvoice(invoice({ lineItems: new Array(1) })).data).toBeNull();
  const b = backup(); b.products = new Array(1);
  expect(preflightBackup(b).errors.length).toBeGreaterThan(0);
});
it('detects an incorrect CGST/SGST allocation even when total tax still matches', () => {
  const inv = invoice(); inv.taxBreakdown.cgst = 0; inv.taxBreakdown.sgst = 32.4;
  expect(decodeInvoice(inv).errors.some(i => i.code === 'financial_mismatch')).toBe(true);
});
