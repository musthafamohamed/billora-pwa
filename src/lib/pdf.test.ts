import { describe, expect, it } from 'vitest';
import { buildInvoicePdf, hsnTaxSummary } from './pdf';
import type { Invoice } from './types';

function sample(type: 'TAX' | 'NON_TAX'): Invoice {
  return {
    id: 'i1', invoiceNumber: 'INV-2026-0001', invoiceType: type, status: 'FINAL',
    issueDate: '2026-10-28', dueDate: '', customerId: 'c1',
    customerSnapshot: { id: 'c1', name: 'Test Customer', phone: '9000000000', email: '', billingAddress: 'Kochi, Kerala', gstin: '', state: 'Kerala' },
    businessSnapshot: {
      businessName: 'Test Business', proprietorName: 'Owner', phone: '9000000001', email: '',
      address: 'Kochi', gstin: '', state: 'Kerala', stateCode: '32', logo: '',
      bankName: 'Test Bank', accountHolderName: 'Owner', accountNumber: '123', ifsc: 'TEST0001', upiId: 'test@upi',
    },
    lineItems: [{
      id: 'l1', productId: 'p1', productName: 'Widget', description: '', unit: 'Piece',
      quantity: 2, unitPrice: 500, discountType: 'NONE', discountValue: 0, taxRate: 18,
      lineSubtotal: 1000, lineDiscount: 0, lineTaxable: 1000, lineTax: type === 'TAX' ? 180 : 0, lineTotal: type === 'TAX' ? 1180 : 1000,
    }],
    subtotal: 1000, discountAmount: 0, taxableAmount: 1000,
    taxBreakdown: type === 'TAX'
      ? { kind: 'CGST_SGST', cgst: 90, sgst: 90, igst: 0, gst: 0 }
      : { kind: 'NONE', cgst: 0, sgst: 0, igst: 0, gst: 0 },
    totalTax: type === 'TAX' ? 180 : 0, grandTotal: type === 'TAX' ? 1180 : 1000,
    notes: '', termsAndConditions: '', createdAt: '', updatedAt: '',
  };
}

describe('PDF generation', () => {
  it.each(['TAX', 'NON_TAX'] as const)('prints the stored document status on a %s document', async (type) => {
    const inv = { ...sample(type), status: 'CANCELLED' as const };
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    expect(text).toContain('Status: CANCELLED');
  });

  it('paginates notes longer than a page without drawing text below the printable area', async () => {
    const inv = sample('TAX');
    inv.notes = Array.from({ length: 100 }, (_, i) => `Delivery instruction ${i + 1}`).join('\n');
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    expect(text).toContain('Delivery instruction 100');
    const ys = [...text.matchAll(/[-\d.]+ ([-\d.]+) Td/g)].map(m => Number(m[1]));
    expect(ys.length).toBeGreaterThan(100);
    expect(Math.min(...ys)).toBeGreaterThan(35);
    expect(text).toContain('Page 1 of');
  });

  it('does not attribute tax from an item without an HSN to the last known HSN', () => {
    const inv = sample('TAX');
    inv.lineItems = [
      { ...inv.lineItems[0], id: 'known', hsnSacCode: '6810', lineTaxable: 100, lineTax: 18 },
      { ...inv.lineItems[0], id: 'unknown', hsnSacCode: '', lineTaxable: 200, lineTax: 36 },
    ];
    inv.taxBreakdown = { kind: 'CGST_SGST', cgst: 27, sgst: 27, igst: 0, gst: 0 };
    expect(hsnTaxSummary(inv)).toEqual([{ hsn: '6810', taxable: 100, cgst: 9, sgst: 9, igst: 0, gst: 0 }]);
  });
  it('produces a non-empty PDF blob for a tax invoice', () => {
    const blob = buildInvoicePdf(sample('TAX'));
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe('application/pdf');
  });
  it('produces a non-empty PDF blob for a non-tax bill', () => {
    const blob = buildInvoicePdf(sample('NON_TAX'));
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe('application/pdf');
  });
  it('groups an HSN tax summary whose CGST+SGST match the invoice breakdown exactly', () => {
    const inv = sample('TAX');
    inv.lineItems = [
      { ...inv.lineItems[0], id: 'l1', productName: 'Brick A', hsnSacCode: '6810', quantity: 10, unitPrice: 42, lineSubtotal: 420, lineTaxable: 420, lineTax: 75.6, lineTotal: 495.6 },
      { ...inv.lineItems[0], id: 'l2', productName: 'Brick B', hsnSacCode: '6810', quantity: 10, unitPrice: 42, lineSubtotal: 420, lineTaxable: 420, lineTax: 75.6, lineTotal: 495.6 },
      { ...inv.lineItems[0], id: 'l3', productName: 'Gum', hsnSacCode: '3824', quantity: 1, unitPrice: 100, lineSubtotal: 100, lineTaxable: 100, lineTax: 18, lineTotal: 118 },
    ];
    inv.subtotal = 940; inv.taxableAmount = 940; inv.totalTax = 169.2; inv.grandTotal = 1109.2;
    inv.taxBreakdown = { kind: 'CGST_SGST', cgst: 84.6, sgst: 84.6, igst: 0, gst: 0 };
    const rows = hsnTaxSummary(inv);
    expect(rows.map((r) => r.hsn)).toEqual(['6810', '3824']);
    expect(rows.reduce((s, r) => s + r.cgst, 0)).toBeCloseTo(84.6, 2);
    expect(rows.reduce((s, r) => s + r.sgst, 0)).toBeCloseTo(84.6, 2);
    expect(rows.reduce((s, r) => s + r.taxable, 0)).toBeCloseTo(940, 2);
  });
  it('returns no HSN summary for invoices without HSNs, and the PDF renders without an HSN table', async () => {
    expect(hsnTaxSummary(sample('TAX'))).toEqual([]);
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(sample('TAX')).arrayBuffer());
    expect(text).not.toContain('HSN-wise');
  });
  it('renders the HSN tax table in the PDF when lines carry HSNs', async () => {
    const inv = sample('TAX');
    inv.lineItems = [{ ...inv.lineItems[0], hsnSacCode: '6810' }];
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    expect(text).toContain('HSN-wise');
    expect(text).toContain('6810');
    expect(text).toContain('CGST');
    expect(text).toContain('SGST');
  });
  it('wraps the full PM Sons address without overlapping header lines, and omits dummy phones', async () => {
    const inv = sample('TAX');
    inv.businessSnapshot.address = 'Ground Floor, 11/77B, Tirur Road, Vallikanjiram, Near Vallikanjiram Juma Masjid, Tanur, Malappuram, Kerala, 676302';
    inv.businessSnapshot.gstin = '32ABCFP0332M1ZI';
    inv.businessSnapshot.phone = '';
    // Dummy phone values seen on real invoices must not print as "Ph: 0".
    inv.customerSnapshot.phone = '0';
    inv.customerSnapshot.billingAddress = 'A very long customer address, House No 12, Main Road, Near the Old Mosque, Some Town, Malappuram, Kerala, 676302';
    inv.customerSnapshot.state = ''; // no state: stored breakdown still drives the PDF
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    for (const frag of ['Ground Floor', 'Vallikanjiram', 'Juma Masjid', 'Malappuram', '676302', 'GSTIN: 32ABCFP0332M1ZI', 'Main Road', 'Old Mosque']) {
      expect(text).toContain(frag);
    }
    // No two header fragments run together without a separator (the old
    // overlap bug printed address, phone and GSTIN on top of each other).
    expect(text).not.toContain('676302GSTIN');
    expect(text).not.toContain('Ph: 0');
    expect(text).not.toContain('Ph: 1');
    // The stored CGST_SGST breakdown is used as-is, not recomputed from states.
    expect(text).toContain('CGST');
    expect(text).toContain('SGST');
  });
  it('shows the Rent row and the new grand total in the PDF', async () => {
    const inv = sample('TAX');
    inv.additionalChargeLabel = 'Rent';
    inv.additionalChargeAmount = 100;
    inv.grandTotal = 1280;
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    expect(text).toContain('Rent');
    expect(text).toContain('1,280.00');
    expect(text).toContain('One Thousand Two Hundred Eighty Rupees Only');
  });
  it('wraps a long address in a non-tax PDF without any tax wording', async () => {
    const inv = sample('NON_TAX');
    inv.businessSnapshot.address = 'Ground Floor, 11/77B, Tirur Road, Vallikanjiram, Near Vallikanjiram Juma Masjid, Tanur, Malappuram, Kerala, 676302';
    inv.customerSnapshot.phone = '1';
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    for (const frag of ['Ground Floor', 'Vallikanjiram', 'Malappuram', '676302']) expect(text).toContain(frag);
    expect(text).not.toContain('Ph: 1');
    for (const word of ['GSTIN', 'CGST', 'SGST', 'IGST', 'Taxable']) expect(text).not.toContain(word);
  });
  it('uses Total / Net Total item columns (renamed from Qty×Rate / Amount)', async () => {
    const inv = sample('TAX');
    inv.lineItems = [{
      ...inv.lineItems[0], quantity: 10, unitPrice: 42, lineSubtotal: 420,
      lineTaxable: 420, lineTax: 75.6, lineTotal: 495.6,
    }];
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    expect(text).toContain('Total');
    expect(text).toContain('Net Total');
    expect(text).toContain('420.00');
    // The old items-header name must be gone (the word "Amount" may
    // still appear in totals/amount-in-words, so assert on the old
    // column name specifically, not on "Amount").
    expect(text).not.toContain('Qty×Rate');
  });
  it('does not overlap Tax and Net Total — the exact failing case from INV-2026-0005', async () => {
    const inv = sample('TAX');
    const base = inv.lineItems[0];
    inv.lineItems = [
      { ...base, id: 'l1', productName: 'GRAND MIX TILE GUM GOLD', quantity: 75, unitPrice: 350, lineSubtotal: 26250, lineTaxable: 26250, lineTax: 4725, lineTotal: 30975 },
      { ...base, id: 'l2', productName: 'GRAND MIX TILE GUM SILVER', quantity: 1, unitPrice: 350, lineSubtotal: 350, lineTaxable: 350, lineTax: 63, lineTotal: 413 },
      { ...base, id: 'l3', productName: 'GRAND MIX TILE GUM DIAMOND', quantity: 50, unitPrice: 350, lineSubtotal: 17500, lineTaxable: 17500, lineTax: 3150, lineTotal: 20650 },
    ];
    inv.subtotal = 44100; inv.taxableAmount = 44100; inv.totalTax = 7938; inv.grandTotal = 52038;
    inv.taxBreakdown = { kind: 'CGST_SGST', cgst: 3969, sgst: 3969, igst: 0, gst: 0 };
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    // Each amount must survive as its own fragment: Tax and Net Total
    // were previously drawn into the same gap, so the old layout's
    // extraction glued them together.
    for (const frag of ['4,725.00', '30,975.00', '3,150.00', '20,650.00', '26,250.00', '17,500.00']) {
      expect(text).toContain(frag);
    }
    expect(text).not.toContain('4,725.0030,975.00');
    expect(text).not.toContain('3,150.0020,650.00');
    expect(text).not.toContain('4,725.00 30,975.00');
  });
  it('keeps large amounts separate (qty 900 × rate 54, and a 1,00,000+ line)', async () => {
    const inv = sample('TAX');
    const base = inv.lineItems[0];
    inv.lineItems = [
      { ...base, id: 'l1', productName: 'HOLLOW BRICKS', quantity: 900, unitPrice: 54, lineSubtotal: 48600, lineTaxable: 48600, lineTax: 8748, lineTotal: 57348 },
      { ...base, id: 'l2', productName: 'BULK ORDER', quantity: 2000, unitPrice: 54, lineSubtotal: 108000, lineTaxable: 108000, lineTax: 19440, lineTotal: 127440 },
    ];
    inv.subtotal = 156600; inv.taxableAmount = 156600; inv.totalTax = 28188; inv.grandTotal = 184788;
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    for (const frag of ['48,600.00', '8,748.00', '57,348.00', '1,08,000.00', '19,440.00', '1,27,440.00']) {
      expect(text).toContain(frag);
    }
    expect(text).not.toContain('8,748.0057,348.00');
    expect(text).not.toContain('19,440.001,27,440.00');
  });
  it('wraps a very long item name without losing any column', async () => {
    const inv = sample('TAX');
    inv.lineItems = [{
      ...inv.lineItems[0],
      productName: 'GRAND MIX TILE GUM SUPER EXTRA LONG PRODUCT NAME FOR TESTING WRAPPING BEHAVIOUR XYZ',
      quantity: 2, unitPrice: 500, lineSubtotal: 1000, lineTaxable: 1000, lineTax: 180, lineTotal: 1180,
    }];
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    expect(text).toContain('GRAND MIX');
    expect(text).toContain('WRAPPING');
    expect(text).toContain('BEHAVIOUR');
    for (const frag of ['Total', 'Net Total', '1,000.00', '180.00', '1,180.00']) expect(text).toContain(frag);
  });
  it('non-tax bill uses Total / Net Total with no Tax column', async () => {
    const inv = sample('NON_TAX');
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    expect(text).toContain('Total');
    expect(text).toContain('Net Total');
    expect(text).not.toContain('Qty×Rate');
    expect(text).not.toContain('Tax');
  });
  it('discount line sits below a wrapped name and does not collide with the next row', async () => {
    const inv = sample('TAX');
    const base = inv.lineItems[0];
    inv.lineItems = [
      { ...base, id: 'l1', productName: 'GRAND MIX TILE GUM SUPER EXTRA LONG PRODUCT NAME FOR TESTING WRAPPING', quantity: 2, unitPrice: 500, discountType: 'FIXED', discountValue: 100, lineSubtotal: 1000, lineDiscount: 100, lineTaxable: 900, lineTax: 162, lineTotal: 1062 },
      { ...base, id: 'l2', productName: 'NEXT ITEM', quantity: 1, unitPrice: 100, lineSubtotal: 100, lineTaxable: 100, lineTax: 18, lineTotal: 118 },
    ];
    const text = new TextDecoder('latin1').decode(await buildInvoicePdf(inv).arrayBuffer());
    expect(text).toContain('Discount:');
    expect(text).toContain('100.00');
    expect(text).toContain('NEXT ITEM');
    expect(text).toContain('118.00');
  });
  it('omits system-note descriptions from the invoice PDF but keeps genuine ones', async () => {
    const sys = sample('TAX');
    sys.lineItems = [{ ...sys.lineItems[0], productName: 'GRAND MIX TILE GUM GOLD', description: 'Price is dynamic — enter the price on each invoice.' }];
    const sysText = new TextDecoder('latin1').decode(await buildInvoicePdf(sys).arrayBuffer());
    expect(sysText).toContain('GRAND MIX TILE GUM GOLD');
    expect(sysText).not.toContain('Price is dynamic');
    const old = sample('TAX');
    old.lineItems = [{ ...old.lineItems[0], description: 'Selling price not supplied — set the price in Products before invoicing.' }];
    const oldText = new TextDecoder('latin1').decode(await buildInvoicePdf(old).arrayBuffer());
    expect(oldText).not.toContain('Selling price not supplied');
    const real = sample('TAX');
    real.lineItems = [{ ...real.lineItems[0], description: 'Special order, delivered on site' }];
    const realText = new TextDecoder('latin1').decode(await buildInvoicePdf(real).arrayBuffer());
    expect(realText).toContain('Special order');
  });
  it('non-tax PDF contains no GST/CGST/SGST/IGST/Taxable wording even when GSTINs exist', async () => {
    const inv = sample('NON_TAX');
    inv.businessSnapshot.gstin = '32ABCDE1234F1Z5';
    inv.customerSnapshot.gstin = '32ABCDE1234F1Z5';
    const blob = buildInvoicePdf(inv);
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    for (const word of ['GSTIN', 'CGST', 'SGST', 'IGST', 'Taxable', 'GST filing']) {
      expect(text).not.toContain(word);
    }
    expect(text).toContain('BILL');
  });
});
