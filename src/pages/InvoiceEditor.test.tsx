import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceEditor from './InvoiceEditor';
import { clearInvoiceRecoveries } from '../lib/invoiceRecovery';
import { emptyProfile, type Customer, type Invoice } from '../lib/types';

const store = vi.hoisted(() => ({ value: {} as any }));
vi.mock('../lib/store', () => ({ useStore: () => store.value }));

const customer: Customer = { id: 'c1', name: 'Buyer', phone: '', email: '', billingAddress: '', gstin: '', state: 'Kerala', notes: '', createdAt: '', updatedAt: '' };
const saved: Invoice = {
  id: 'i1', invoiceNumber: 'INV-2026-0001', invoiceType: 'TAX', status: 'DRAFT', issueDate: '2026-11-07', dueDate: '',
  customerId: 'c1', customerSnapshot: customer, businessSnapshot: emptyProfile(),
  lineItems: [{ id: 'l1', productId: '', productName: 'Brick', description: '', unit: 'Piece', quantity: 1, unitPrice: 10, discountType: 'NONE', discountValue: 0, taxRate: 18, lineSubtotal: 10, lineDiscount: 0, lineTaxable: 10, lineTax: 1.8, lineTotal: 11.8 }],
  subtotal: 10, discountAmount: 0, taxableAmount: 10, taxBreakdown: { kind: 'CGST_SGST', cgst: .9, sgst: .9, igst: 0, gst: 0 }, totalTax: 1.8, grandTotal: 11.8,
  notes: '', termsAndConditions: '', createdAt: '2026-11-07T10:00:00.000Z', updatedAt: '2026-11-07T10:00:00.000Z',
};
let root: Root | undefined;
let host: HTMLDivElement;
const navigate = vi.fn();
async function mount(id?: string) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<InvoiceEditor id={id} navigate={navigate} />); });
}
async function unmount() { if (root) { await act(async () => root!.unmount()); root = undefined; } host?.remove(); }
async function enterNotes(value: string) {
  const field = [...host.querySelectorAll('label')].find(l => l.textContent?.startsWith('Notes (optional)'))!.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); localStorage.clear(); clearInvoiceRecoveries(); navigate.mockClear();
  store.value = { profile: emptyProfile(), customers: [customer], products: [], invoices: [], upsertInvoice: async () => {}, upsertCustomer: async (c: Customer) => c };
});
afterEach(async () => { await unmount(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('invoice editor saving', () => {
  it('restores incomplete edits after leaving before the autosave delay', async () => {
    await mount(); await enterNotes('Deliver tomorrow'); await unmount(); await mount();
    const notes = [...host.querySelectorAll('textarea')].find(e => e.value === 'Deliver tomorrow');
    expect(notes?.value).toBe('Deliver tomorrow');
    expect(host.textContent).toContain('Recovered');
  });

  it('shows a save failure while retaining the latest working copy for retry', async () => {
    store.value.invoices = [saved];
    store.value.upsertInvoice = async () => { throw new Error('Disk full'); };
    await mount('i1'); await enterNotes('Latest delivery');
    expect(host.textContent).toContain('Saving');
    await act(async () => { await vi.advanceTimersByTimeAsync(901); });
    expect(host.textContent).toContain("Couldn't save");
    expect([...host.querySelectorAll('button')].some(b => b.textContent?.includes('Retry'))).toBe(true);
    await unmount(); await mount('i1');
    expect([...host.querySelectorAll('textarea')].some(e => e.value === 'Latest delivery')).toBe(true);
  });

  it('keeps finalization after an in-flight autosave and clears the recovery after success', async () => {
    const writes: string[] = []; let release!: () => void;
    store.value.invoices = [saved];
    store.value.upsertInvoice = async (inv: Invoice) => {
      if (inv.status === 'DRAFT') await new Promise<void>(r => { release = r; });
      writes.push(inv.status);
    };
    await mount('i1'); await enterNotes('Ready');
    await act(async () => { await vi.advanceTimersByTimeAsync(901); });
    const finalize = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Finalize Invoice'))!;
    await act(async () => { finalize.click(); });
    expect(writes).toEqual([]);
    await act(async () => { release(); await Promise.resolve(); });
    expect(writes).toEqual(['DRAFT', 'FINAL']);
    expect(navigate).toHaveBeenCalledWith('invoice-detail', 'i1');
    expect(Object.keys(localStorage).some(k => k.includes('invoice-recovery'))).toBe(false);
  });

  it('does not let an old unmounted editor overwrite a newer recovered working copy', async () => {
    let release!: () => void;
    store.value.invoices = [saved];
    store.value.upsertInvoice = async () => { await new Promise<void>(r => { release = r; }); };
    await mount('i1'); await enterNotes('Old edit');
    await act(async () => { await vi.advanceTimersByTimeAsync(901); });
    await unmount(); await mount('i1'); await enterNotes('Newer edit');
    await act(async () => { release(); await Promise.resolve(); });
    await unmount(); await mount('i1');
    expect([...host.querySelectorAll('textarea')].some(e => e.value === 'Newer edit')).toBe(true);
  });

  it.each(['Save Draft', 'Finalize Invoice'])('does not let an unmounted %s completion clear or navigate a newer editor', async label => {
    let release!: () => void;
    store.value.invoices = [saved];
    store.value.upsertInvoice = async () => { await new Promise<void>(r => { release = r; }); };
    await mount('i1'); await enterNotes('Old explicit save');
    const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
    await act(async () => { button.click(); });
    await unmount(); await mount('i1'); await enterNotes('Newer recovered work');
    await act(async () => { release(); await Promise.resolve(); });
    expect(navigate).not.toHaveBeenCalled();
    await unmount(); await mount('i1');
    expect([...host.querySelectorAll('textarea')].some(e => e.value === 'Newer recovered work')).toBe(true);
  });

  it('keeps the rest of an unfinished draft when its required date is temporarily blank', async () => {
    await mount(); await enterNotes('Keep these delivery notes');
    const date = host.querySelector<HTMLInputElement>('input[type="date"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '');
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await unmount(); await mount();
    expect(host.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('');
    expect([...host.querySelectorAll('textarea')].some(e => e.value === 'Keep these delivery notes')).toBe(true);
  });

  it('keeps a blank date recoverable but requires a date before finalizing', async () => {
    store.value.invoices = [saved];
    await mount('i1');
    const date = host.querySelector<HTMLInputElement>('input[type="date"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '');
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Finalize Invoice')!;
    await act(async () => { button.click(); });
    expect(navigate).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('invoice date');
  });

});
