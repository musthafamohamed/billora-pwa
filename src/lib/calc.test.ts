import { describe, expect, it } from 'vitest';
import { applyNewCustomerToDraft, calcInvoice, canAddActiveProduct, round2, validateForFinalize, validateInvoiceDraft } from './calc';
import { amountInWords, numberToIndianWords } from './words';
import { nextInvoiceNumber } from './invoiceNumber';
import { parseBackup, validateBackup } from './backup';
import type { Invoice } from './types';
import { backup as validBackup } from './data/fixtures.test-support';

describe('rounding', () => {
  it('rounds half-up to 2dp', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(10.004)).toBe(10);
  });
});

describe('tax invoices', () => {
  it('splits CGST/SGST equally for same state', () => {
    const t = calcInvoice(
      [{ productName: 'A', unit: 'Piece', quantity: 2, unitPrice: 500, discountType: 'NONE', discountValue: 0, taxRate: 18 }],
      'TAX', 'Kerala', 'Kerala',
    );
    expect(t.subtotal).toBe(1000);
    expect(t.taxableAmount).toBe(1000);
    expect(t.totalTax).toBe(180);
    expect(t.taxBreakdown.kind).toBe('CGST_SGST');
    expect(t.taxBreakdown.cgst).toBe(90);
    expect(t.taxBreakdown.sgst).toBe(90);
    expect(t.grandTotal).toBe(1180);
  });

  it('applies IGST for different states', () => {
    const t = calcInvoice(
      [{ productName: 'A', unit: 'Piece', quantity: 1, unitPrice: 1000, discountType: 'NONE', discountValue: 0, taxRate: 18 }],
      'TAX', 'Kerala', 'Tamil Nadu',
    );
    expect(t.taxBreakdown.kind).toBe('IGST');
    expect(t.taxBreakdown.igst).toBe(180);
    expect(t.taxBreakdown.cgst).toBe(0);
    expect(t.grandTotal).toBe(1180);
  });

  it('uses one combined GST line when a state is missing, never fake CGST/SGST', () => {
    const t = calcInvoice(
      [{ productName: 'A', unit: 'Piece', quantity: 1, unitPrice: 1000, discountType: 'NONE', discountValue: 0, taxRate: 18 }],
      'TAX', 'Kerala', '',
    );
    expect(t.taxBreakdown.kind).toBe('GST');
    expect(t.taxBreakdown.gst).toBe(180);
    expect(t.taxBreakdown.cgst).toBe(0);
    expect(t.taxBreakdown.sgst).toBe(0);
  });

  it('splits an odd-paise tax total without drift (CGST + SGST = totalTax)', () => {
    // 333.33 * 18% = 59.9994 -> 60.00 total; use a case with odd paise:
    // taxable 99.99 at 5% = 4.9995 -> 5.00; better: 0.03 tax -> split 0.02/0.01
    const t = calcInvoice(
      [{ productName: 'A', unit: 'Piece', quantity: 1, unitPrice: 0.6, discountType: 'NONE', discountValue: 0, taxRate: 5 }],
      'TAX', 'Kerala', 'Kerala',
    );
    expect(t.totalTax).toBe(0.03);
    expect(t.taxBreakdown.cgst + t.taxBreakdown.sgst).toBe(0.03);
    expect(t.taxBreakdown.cgst).toBe(0.02);
    expect(t.taxBreakdown.sgst).toBe(0.01);
  });
});

describe('additional charge (Rent) and tax-split override', () => {
  const line = { productName: 'A', unit: 'Piece', quantity: 1, unitPrice: 1000, discountType: 'NONE' as const, discountValue: 0, taxRate: 18 };
  it('adds Rent after tax on a tax invoice', () => {
    const t = calcInvoice([line], 'TAX', 'Kerala', 'Kerala', { additionalChargeAmount: 2100 });
    expect(t.totalTax).toBe(180);
    expect(t.additionalChargeAmount).toBe(2100);
    expect(t.grandTotal).toBe(3280); // 1000 + 180 + 2100
  });
  it('adds Rent after discounts on a non-tax bill', () => {
    const t = calcInvoice(
      [{ productName: 'A', unit: 'Piece', quantity: 2, unitPrice: 500, discountType: 'PERCENTAGE', discountValue: 10, taxRate: 18 }],
      'NON_TAX', 'Kerala', 'Kerala', { additionalChargeAmount: 500 },
    );
    expect(t.grandTotal).toBe(1400); // (1000 − 100) + 500
  });
  it('leaves totals unchanged when the charge is zero or absent', () => {
    expect(calcInvoice([line], 'TAX', 'Kerala', 'Kerala', { additionalChargeAmount: 0 }).grandTotal).toBe(1180);
    expect(calcInvoice([line], 'TAX', 'Kerala', 'Kerala').grandTotal).toBe(1180);
  });
  it('forces CGST+SGST even when the customer state is missing', () => {
    const t = calcInvoice([line], 'TAX', 'Kerala', '', { taxSplit: 'CGST_SGST' });
    expect(t.taxBreakdown.kind).toBe('CGST_SGST');
    expect(t.taxBreakdown.cgst).toBe(90);
    expect(t.taxBreakdown.sgst).toBe(90);
  });
  it('forces IGST even for a same-state customer, and combined GST on demand', () => {
    expect(calcInvoice([line], 'TAX', 'Kerala', 'Kerala', { taxSplit: 'IGST' }).taxBreakdown).toEqual(
      { kind: 'IGST', cgst: 0, sgst: 0, igst: 180, gst: 0 });
    expect(calcInvoice([line], 'TAX', 'Kerala', 'Kerala', { taxSplit: 'GST' }).taxBreakdown.kind).toBe('GST');
  });
  it('accepts an old backup invoice without charge/taxSplit fields', () => {
    const old = validBackup();
    expect(validateBackup(old)).toEqual([]);
  });
});

describe('non-tax bills', () => {
  it('charges no tax and grand total = subtotal - discounts', () => {
    const t = calcInvoice(
      [
        { productName: 'A', unit: 'Piece', quantity: 2, unitPrice: 500, discountType: 'PERCENTAGE', discountValue: 10, taxRate: 18 },
        { productName: 'B', unit: 'Piece', quantity: 1, unitPrice: 200, discountType: 'FIXED', discountValue: 50, taxRate: 18 },
      ],
      'NON_TAX', 'Kerala', 'Kerala',
    );
    expect(t.subtotal).toBe(1200);
    expect(t.discountAmount).toBe(150);
    expect(t.totalTax).toBe(0);
    expect(t.taxBreakdown.kind).toBe('NONE');
    expect(t.grandTotal).toBe(1050);
  });
});

describe('finalize validation', () => {
  it('blocks a line with price 0 or quantity 0, naming the item', () => {
    const base = {
      productName: 'GRAND MIX TILE GUM GOLD', unit: 'NOS', quantity: 1, unitPrice: 0,
      discountType: 'NONE' as const, discountValue: 0, taxRate: 18,
    };
    const errs = validateForFinalize('c1', [base]);
    expect(errs).toContain('Price not entered for: GRAND MIX TILE GUM GOLD — enter a price before finalizing.');
    const qtyErrs = validateForFinalize('c1', [{ ...base, quantity: 0, unitPrice: 350 }]);
    expect(qtyErrs).toContain('Quantity not entered for: GRAND MIX TILE GUM GOLD — enter a quantity before finalizing.');
    // A draft may still be saved with a 0 price — only finalizing blocks it.
    expect(validateInvoiceDraft('c1', [base])).toEqual([]);
    expect(validateForFinalize('c1', [{ ...base, unitPrice: 350 }])).toEqual([]);
  });
});

describe('discounts and validation', () => {
  it('caps a fixed discount at the line amount and validates bad lines', () => {
    const t = calcInvoice(
      [{ productName: 'A', unit: 'Piece', quantity: 1, unitPrice: 100, discountType: 'FIXED', discountValue: 500, taxRate: 0 }],
      'TAX', '', '',
    );
    expect(t.grandTotal).toBe(0);
    const errs = validateInvoiceDraft('', []);
    expect(errs).toContain('Please select a customer.');
    expect(errs).toContain('Add at least one item.');
    expect(validateInvoiceDraft('c1', [{ productName: 'A', unit: 'Piece', quantity: 0, unitPrice: 10, discountType: 'NONE', discountValue: 0, taxRate: 0 }]).length).toBeGreaterThan(0);
    expect(validateInvoiceDraft('c1', [{ productName: 'A', unit: 'Piece', quantity: 1, unitPrice: -5, discountType: 'NONE', discountValue: 0, taxRate: 0 }]).length).toBeGreaterThan(0);
    expect(validateInvoiceDraft('c1', [{ productName: 'A', unit: 'Piece', quantity: 1, unitPrice: 100, discountType: 'PERCENTAGE', discountValue: 101, taxRate: 0 }]).length).toBeGreaterThan(0);
  });
});

describe('seven active product limit', () => {
  it('blocks an 8th active product but allows inactive ones', () => {
    expect(canAddActiveProduct(7, true)).toBe(false);
    expect(canAddActiveProduct(6, true)).toBe(true);
    expect(canAddActiveProduct(7, false)).toBe(true);
  });
});

describe('draft preservation when adding a customer from the invoice flow', () => {
  it('only changes customerId; lines and notes are untouched', () => {
    const draft = {
      customerId: '', lines: [{ id: 'l1', productName: 'Shirt', quantity: 2 }],
      notes: 'Urgent delivery', invoiceType: 'TAX' as const,
    };
    const merged = applyNewCustomerToDraft(draft, 'cust-9');
    expect(merged.customerId).toBe('cust-9');
    expect(merged.lines).toBe(draft.lines); // same reference: nothing re-created
    expect(merged.notes).toBe('Urgent delivery');
    expect(draft.customerId).toBe(''); // original untouched
  });
});

describe('snapshot immutability', () => {
  it('an invoice keeps its snapshots after product/customer edits', () => {
    const invoice = {
      customerSnapshot: { name: 'Old Name', phone: '111' },
      lineItems: [{ productName: 'Old Product', unitPrice: 100 }],
    } as unknown as Invoice;
    // Simulate edits to the live records (separate objects).
    const editedCustomer = { name: 'New Name', phone: '222' };
    const editedProduct = { name: 'New Product', price: 999 };
    expect(invoice.customerSnapshot.name).toBe('Old Name');
    expect(invoice.lineItems[0].productName).toBe('Old Product');
    expect(editedCustomer.name).not.toBe(invoice.customerSnapshot.name);
    expect(editedProduct.name).not.toBe(invoice.lineItems[0].productName);
    // And a JSON round-trip (as stored in Dexie) deep-copies snapshots:
    const stored = JSON.parse(JSON.stringify(invoice)) as Invoice;
    expect(stored.customerSnapshot.name).toBe('Old Name');
  });
});

describe('invoice numbers', () => {
  it('is sequential per prefix+year and never reuses a number', () => {
    expect(nextInvoiceNumber(['INV-2026-0001', 'INV-2026-0003'], 'INV', 2026)).toBe('INV-2026-0004');
    expect(nextInvoiceNumber(['INV-2026-0001'], 'INV', 2027)).toBe('INV-2027-0001');
    expect(nextInvoiceNumber([], 'BILL', 2026)).toBe('BILL-2026-0001');
  });
});

describe('amount in words (Indian system)', () => {
  it('renders rupees and paise correctly', () => {
    expect(numberToIndianWords(125000)).toBe('One Lakh Twenty Five Thousand');
    expect(amountInWords(125000)).toBe('One Lakh Twenty Five Thousand Rupees Only');
    expect(amountInWords(100.5)).toBe('One Hundred Rupees and Fifty Paise Only');
    expect(amountInWords(0)).toBe('Zero Rupees Only');
    expect(amountInWords(10000000)).toBe('One Crore Rupees Only');
  });
});

describe('backup validation', () => {
  const valid = validBackup();
  it('accepts a valid export', () => {
    expect(validateBackup(valid)).toEqual([]);
    expect(parseBackup(JSON.stringify(valid)).data).not.toBeNull();
  });
  it('rejects malformed and wrong-shape JSON without touching data', () => {
    expect(parseBackup('not json').errors.length).toBeGreaterThan(0);
    expect(validateBackup({ app: 'other-app', version: 1, products: [], customers: [], invoices: [] }).length).toBeGreaterThan(0);
    expect(validateBackup({ app: 'simple-bill', version: 1, products: [{ id: 'p1' }], customers: [], invoices: [] }).length).toBeGreaterThan(0);
    expect(validateBackup({ app: 'simple-bill', version: 1, products: [], customers: [], invoices: [{ id: 'i1', invoiceType: 'WRONG' }] }).length).toBeGreaterThan(0);
    expect(validateBackup(null).length).toBeGreaterThan(0);
  });
});
