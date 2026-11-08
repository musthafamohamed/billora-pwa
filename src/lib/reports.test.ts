import { describe, expect, it } from 'vitest';
import { filterInvoices, hsnRows, itemRows, netTotals, summaryRows } from './reports';
import type { Invoice, InvoiceLineItem } from './types';

function line(over: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return {
    id: 'l1', productId: 'p1', productName: 'Widget', description: '', unit: 'NOS',
    quantity: 1, unitPrice: 100, discountType: 'NONE', discountValue: 0, taxRate: 18,
    lineSubtotal: 100, lineDiscount: 0, lineTaxable: 100, lineTax: 18, lineTotal: 118, ...over,
  };
}

function inv(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'i1', invoiceNumber: 'INV-2026-0001', invoiceType: 'TAX', status: 'FINAL',
    issueDate: '2026-10-10', dueDate: '', customerId: 'c1',
    customerSnapshot: { id: 'c1', name: 'Acme, "Quoted"\nTraders', phone: '', email: '', billingAddress: '', gstin: '', state: 'Kerala' },
    businessSnapshot: {
      businessName: 'Test Business', proprietorName: '', phone: '', email: '', address: '',
      gstin: '', state: 'Kerala', stateCode: '32', logo: '', bankName: '', accountHolderName: '',
      accountNumber: '', ifsc: '', upiId: '',
    },
    lineItems: [line()],
    subtotal: 100, discountAmount: 0, taxableAmount: 100,
    taxBreakdown: { kind: 'CGST_SGST', cgst: 9, sgst: 9, igst: 0, gst: 0 },
    totalTax: 18, grandTotal: 118, notes: '', termsAndConditions: '', createdAt: '', updatedAt: '', ...over,
  };
}

describe('filterInvoices', () => {
  const all = [
    inv({ id: 'a', invoiceNumber: 'INV-2026-0002', invoiceType: 'NON_TAX', status: 'DRAFT', issueDate: '2026-10-20' }),
    inv({ id: 'b', invoiceNumber: 'INV-2026-0001', invoiceType: 'TAX', status: 'FINAL', issueDate: '2026-10-10' }),
    inv({ id: 'c', invoiceNumber: 'INV-2026-0003', invoiceType: 'TAX', status: 'CANCELLED', issueDate: '2026-10-15' }),
  ];
  it('filters by type and status', () => {
    expect(filterInvoices(all, { type: 'TAX', status: 'ALL' })).toHaveLength(2);
    expect(filterInvoices(all, { type: 'ALL', status: 'FINAL' })).toHaveLength(1);
    expect(filterInvoices(all, { type: 'NON_TAX', status: 'DRAFT' })).toHaveLength(1);
    expect(filterInvoices(all, { type: 'ALL', status: 'ALL' })).toHaveLength(3);
  });
  it('date filter is inclusive on both ends', () => {
    const out = filterInvoices(all, { type: 'ALL', status: 'ALL', from: '2026-10-10', to: '2026-10-15' });
    expect(out.map((i) => i.id).sort()).toEqual(['b', 'c']);
    expect(filterInvoices(all, { type: 'ALL', status: 'ALL', from: '2026-10-11', to: '' })).toHaveLength(2);
  });
});

describe('summaryRows', () => {
  it('maps CGST/SGST and non-tax zeros, in audit order', () => {
    const tax = inv({ invoiceNumber: 'INV-2026-0002', issueDate: '2026-10-20' });
    const nonTax = inv({
      invoiceNumber: 'INV-2026-0001', invoiceType: 'NON_TAX', issueDate: '2026-10-10',
      taxBreakdown: { kind: 'NONE', cgst: 0, sgst: 0, igst: 0, gst: 0 }, totalTax: 0, grandTotal: 100,
      additionalChargeLabel: 'Rent', additionalChargeAmount: 50,
    });
    const rows = summaryRows([tax, nonTax]);
    expect(rows[0][0]).toBe('INV-2026-0001'); // oldest first
    expect(rows[0][8]).toBe(0); // CGST
    expect(rows[0][13]).toBe(50); // additional charge amount
    expect(rows[1][8]).toBe(9); // CGST
    expect(rows[1][9]).toBe(9); // SGST
    expect(rows[1][10]).toBe(0); // IGST
    expect(rows[1][11]).toBe(0); // GST combined
  });
  it('maps IGST and combined GST', () => {
    const igst = inv({ taxBreakdown: { kind: 'IGST', cgst: 0, sgst: 0, igst: 18, gst: 0 } });
    const gst = inv({ taxBreakdown: { kind: 'GST', cgst: 0, sgst: 0, igst: 0, gst: 18 } });
    expect(summaryRows([igst])[0][10]).toBe(18);
    expect(summaryRows([gst])[0][11]).toBe(18);
  });
});

describe('itemRows', () => {
  it('does not export stale tax values from a bill without tax', () => {
    const row = itemRows([inv({ invoiceType: 'NON_TAX' })])[0];
    expect(row[11]).toBe(0);
    expect(row[12]).toBe(0);
  });
  it('emits one row per line, invoice order then line order', () => {
    const a = inv({
      invoiceNumber: 'INV-2026-0002', issueDate: '2026-10-20',
      lineItems: [line({ id: 'l1', productName: 'First' }), line({ id: 'l2', productName: 'Second', hsnSacCode: '6810' })],
    });
    const b = inv({ invoiceNumber: 'INV-2026-0001', issueDate: '2026-10-10', lineItems: [line({ productName: 'Earlier' })] });
    const rows = itemRows([a, b]);
    expect(rows.map((r) => r[4])).toEqual(['Earlier', 'First', 'Second']);
    expect(rows[2][5]).toBe('6810');
  });
});

describe('hsnRows', () => {
  it('excludes unknown-HSN tax instead of allocating it to a known HSN', () => {
    const rows = hsnRows([inv({ lineItems: [line({hsnSacCode: '6810'}), line({id: 'l2', productId: '', hsnSacCode: '', lineTaxable: 200, lineTax: 36})], taxBreakdown: {kind: 'CGST_SGST', cgst: 27, sgst: 27, igst: 0, gst: 0} })]);
    expect(rows).toEqual([{hsn: '6810', rate: 18, taxable: 100, cgst: 9, sgst: 9, igst: 0, gst: 0, totalTax: 18}]);
  });
  it('aggregates across two CGST_SGST invoices with exact column totals', () => {
    const mk = (hsn: string, taxable: number, tax: number, cgst: number, sgst: number): Invoice => inv({
      lineItems: [line({ hsnSacCode: hsn, lineTaxable: taxable, lineTax: tax })],
      taxableAmount: taxable, totalTax: tax,
      taxBreakdown: { kind: 'CGST_SGST', cgst, sgst, igst: 0, gst: 0 },
    });
    const rows = hsnRows([mk('6810', 1000, 180, 90, 90), mk('6810', 500, 90, 45, 45), mk('3824', 100, 18, 9, 9)]);
    expect(rows.map((r) => r.hsn)).toEqual(['3824', '6810']);
    const bricks = rows.find((r) => r.hsn === '6810')!;
    expect(bricks.taxable).toBe(1500);
    expect(bricks.cgst).toBe(135);
    expect(bricks.sgst).toBe(135);
    expect(bricks.totalTax).toBe(270);
    expect(rows.reduce((s, r) => s + r.cgst, 0)).toBe(144);
    expect(rows.reduce((s, r) => s + r.sgst, 0)).toBe(144);
  });
  it('excludes lines without HSN (and without a catalogue fallback)', () => {
    const noHsn = inv({ lineItems: [line({ hsnSacCode: '' })] });
    expect(hsnRows([noHsn])).toEqual([]);
  });
  it('includes non-tax bills with tax 0, grouped by HSN', () => {
    const bill = inv({
      invoiceType: 'NON_TAX', taxBreakdown: { kind: 'NONE', cgst: 0, sgst: 0, igst: 0, gst: 0 }, totalTax: 0,
      lineItems: [line({ hsnSacCode: '3824', lineTaxable: 100, lineTax: 0, lineTotal: 100 })],
    });
    const rows = hsnRows([bill]);
    expect(rows).toHaveLength(1);
    expect(rows[0].hsn).toBe('3824');
    expect(rows[0].rate).toBe(0);
    expect(rows[0].taxable).toBe(100);
    expect(rows[0].totalTax).toBe(0);
  });
  it('recovers an old invoice\'s HSN from the product catalogue', () => {
    const old = inv({ lineItems: [line({ productId: 'p1', hsnSacCode: '' })] });
    const rows = hsnRows([old], [{ id: 'p1', name: 'Widget', hsnSacCode: '6810' }]);
    expect(rows.map((r) => r.hsn)).toEqual(['6810']);
  });
  it('groups the same HSN at different tax rates separately, with exact totals', () => {
    const mixed = inv({
      lineItems: [
        line({ hsnSacCode: '6810', taxRate: 18, lineTaxable: 100, lineTax: 18, lineTotal: 118 }),
        line({ hsnSacCode: '6810', taxRate: 12, lineTaxable: 100, lineTax: 12, lineTotal: 112 }),
      ],
      taxableAmount: 200, totalTax: 30,
      taxBreakdown: { kind: 'CGST_SGST', cgst: 15, sgst: 15, igst: 0, gst: 0 },
    });
    const rows = hsnRows([mixed]);
    expect(rows.map((r) => r.rate)).toEqual([12, 18]);
    expect(rows.reduce((s, r) => s + r.cgst, 0)).toBe(15);
    expect(rows.reduce((s, r) => s + r.sgst, 0)).toBe(15);
    expect(rows.reduce((s, r) => s + r.totalTax, 0)).toBe(30);
  });
});

describe('netTotals', () => {
  it('sums counts and money, split by tax/non-tax grand total', () => {
    const t = netTotals([
      inv({ grandTotal: 118 }),
      inv({ invoiceType: 'NON_TAX', status: 'DRAFT', grandTotal: 100, subtotal: 100, taxableAmount: 100, taxBreakdown: { kind: 'NONE', cgst: 0, sgst: 0, igst: 0, gst: 0 }, totalTax: 0 }),
    ]);
    expect(t.invoiceCount).toBe(2);
    expect(t.taxInvoiceCount).toBe(1);
    expect(t.nonTaxCount).toBe(1);
    expect(t.draftCount).toBe(1);
    expect(t.finalCount).toBe(1);
    expect(t.grandTotal).toBe(218);
    expect(t.taxGrandTotal).toBe(118);
    expect(t.nonTaxGrandTotal).toBe(100);
    expect(t.cgst).toBe(9);
  });
});
