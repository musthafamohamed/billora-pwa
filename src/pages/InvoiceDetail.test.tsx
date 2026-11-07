import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceDetail from './InvoiceDetail';
import { useStore } from '../lib/store';
import { businessSnapshotOf, emptyProfile, type Invoice } from '../lib/types';

vi.mock('../lib/store', () => ({ useStore: vi.fn() }));

const invoice: Invoice = {
  id: 'print-test', invoiceNumber: 'INV-2026-0001', invoiceType: 'NON_TAX', status: 'FINAL',
  issueDate: '2026-11-07', dueDate: '', customerId: 'c1',
  customerSnapshot: { id: 'c1', name: 'Print Customer', phone: '', email: '', billingAddress: '', gstin: '', state: '' },
  businessSnapshot: businessSnapshotOf({ ...emptyProfile(), businessName: 'Print Business' }),
  lineItems: [], subtotal: 0, discountAmount: 0, taxableAmount: 0,
  taxBreakdown: { kind: 'NONE', cgst: 0, sgst: 0, igst: 0, gst: 0 }, totalTax: 0, grandTotal: 0,
  notes: '', termsAndConditions: '', createdAt: '', updatedAt: '',
};

let root: Root;
let container: HTMLDivElement;
const createObjectURL = vi.fn((_blob: Blob) => 'blob:invoice-for-print');
const revokeObjectURL = vi.fn();

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
  vi.mocked(useStore).mockReturnValue({ invoices: [invoice], upsertInvoice: vi.fn() } as unknown as ReturnType<typeof useStore>);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<InvoiceDetail id={invoice.id} navigate={vi.fn()} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function printInvoice() {
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes('Print PDF'))!;
  await act(async () => button.click());
}

describe('Print PDF', () => {
  it('opens the generated PDF instead of printing the app, and releases it after closing the viewer', async () => {
    const viewer = { opener: window, closed: false };
    const open = vi.spyOn(window, 'open').mockReturnValue(viewer as unknown as Window);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await printInvoice();
    expect(open).toHaveBeenCalledWith('blob:invoice-for-print', '_blank');
    const pdf = createObjectURL.mock.calls[0]?.[0] as unknown as Blob;
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBeGreaterThan(1000);
    expect(print).not.toHaveBeenCalled();
    expect(viewer.opener).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    viewer.closed = true;
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invoice-for-print');
    expect(container.textContent).toContain('PDF opened');
  });

  it('explains the download fallback when the browser blocks the viewer', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await printInvoice();
    expect(container.querySelector('[role="alert"]')?.textContent ?? '').toContain('Download PDF');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invoice-for-print');
  });

  it('offers download when native PDF viewing is unavailable', async () => {
    vi.stubGlobal('navigator', { pdfViewerEnabled: false });
    const open = vi.spyOn(window, 'open');
    await printInvoice();
    expect(open).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent ?? '').toContain('Download PDF');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

});
