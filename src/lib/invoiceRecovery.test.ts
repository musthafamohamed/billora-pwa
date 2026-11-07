import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearInvoiceRecoveries, readInvoiceRecovery, writeInvoiceRecovery, type InvoiceRecovery } from './invoiceRecovery';
import type { Invoice } from './types';

const draft: InvoiceRecovery = {
  invoiceId: 'i1', invoiceNumber: 'INV-2026-0001', invoiceType: 'TAX',
  issueDate: '2026-11-07', dueDate: '', customerId: '', lines: [],
  notes: 'Deliver tomorrow', terms: '', chargeLabel: 'Rent', chargeAmount: 50, taxSplit: 'IGST',
  createdAt: '2026-11-07T10:00:00.000Z', updatedAt: '2026-11-07T10:01:00.000Z', baseUpdatedAt: '',
};

beforeEach(() => { localStorage.clear(); clearInvoiceRecoveries(); vi.restoreAllMocks(); });

describe('invoice editor recovery', () => {
  it('recovers incomplete work before a customer or item has been selected', () => {
    expect(writeInvoiceRecovery(undefined, draft)).toBe(true);
    expect(readInvoiceRecovery(undefined, [])).toMatchObject({ invoiceId: 'i1', notes: 'Deliver tomorrow', chargeAmount: 50, customerId: '', lines: [], taxSplit: 'IGST' });
  });

  it('does not recover an editor copy for a finalized or deleted invoice', () => {
    writeInvoiceRecovery('i1', { ...draft, baseUpdatedAt: '2026-11-07T10:00:00.000Z' });
    const final = { id: 'i1', status: 'FINAL', updatedAt: '2026-11-07T10:02:00.000Z' } as Invoice;
    expect(readInvoiceRecovery('i1', [final])).toBeNull();
    writeInvoiceRecovery('i1', { ...draft, baseUpdatedAt: '2026-11-07T10:00:00.000Z' });
    expect(readInvoiceRecovery('i1', [])).toBeNull();
  });

  it('keeps unsaved edits newer than the last database snapshot', () => {
    writeInvoiceRecovery('i1', { ...draft, baseUpdatedAt: '2026-11-07T09:59:00.000Z' });
    const saved = { id: 'i1', status: 'DRAFT', updatedAt: '2026-11-07T10:00:00.000Z' } as Invoice;
    expect(readInvoiceRecovery('i1', [saved])?.notes).toBe('Deliver tomorrow');
  });

  it('does not replace a newer saved invoice with a stale local copy', () => {
    writeInvoiceRecovery('i1', draft);
    const saved = { id: 'i1', status: 'DRAFT', updatedAt: '2026-11-07T11:00:00.000Z' } as Invoice;
    expect(readInvoiceRecovery('i1', [saved])).toBeNull();
  });

  it('rejects malformed and non-finite recovered input', () => {
    writeInvoiceRecovery(undefined, draft);
    const key = Object.keys(localStorage).find(k => k.includes('invoice-recovery'))!;
    localStorage.setItem(key, JSON.stringify({ ...draft, chargeAmount: 'free' }));
    expect(readInvoiceRecovery(undefined, [])).toBeNull();
    localStorage.setItem(key, '{broken');
    expect(readInvoiceRecovery(undefined, [])).toBeNull();
  });

  it('retains work in memory when storage is denied, and reports that it is not durable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(writeInvoiceRecovery(undefined, draft)).toBe(false);
    expect(readInvoiceRecovery(undefined, [])?.notes).toBe('Deliver tomorrow');
  });

  it('clears recovery after a data restore without clearing unrelated preferences', () => {
    localStorage.setItem('simple-bill-theme', 'dark');
    writeInvoiceRecovery(undefined, draft);
    writeInvoiceRecovery('i1', draft);
    clearInvoiceRecoveries();
    expect(readInvoiceRecovery(undefined, [])).toBeNull();
    expect(localStorage.getItem('simple-bill-theme')).toBe('dark');
  });

  it('retains finite line inputs that are still being corrected, without losing other fields', () => {
    writeInvoiceRecovery(undefined, { ...draft, lines: [{ id: 'l1', productName: 'Brick', unit: 'Piece', quantity: -1, unitPrice: -10, discountType: 'NONE', discountValue: 0, taxRate: 120 }] });
    expect(readInvoiceRecovery(undefined, [])).toMatchObject({
      notes: 'Deliver tomorrow', lines: [{ quantity: -1, unitPrice: -10, taxRate: 120 }],
    });
  });

  it('rejects non-finite line inputs rather than calculating with them', () => {
    writeInvoiceRecovery(undefined, { ...draft, lines: [{ id: 'l1', productName: 'Brick', unit: 'Piece', quantity: Infinity, unitPrice: 10, discountType: 'NONE', discountValue: 0, taxRate: 18 }] });
    expect(readInvoiceRecovery(undefined, [])).toBeNull();
  });

});
