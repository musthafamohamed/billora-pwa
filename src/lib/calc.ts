import type { DiscountType, InvoiceLineItem, InvoiceType, TaxBreakdown, TaxSplit } from './types';
import { normaliseState } from './types';

/** Round half-up to 2 decimal places (money). The 1e-9 nudge only
 *  repairs binary float representation (e.g. 1.005 stored as 1.00499),
 *  it never moves a genuinely below-half value over the boundary. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

export interface DraftLine {
  productId?: string;
  productName: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
}

/** Pure per-line computation, shared by the editor and the tests. */
export function calcLine(line: DraftLine, invoiceType: InvoiceType): {
  lineSubtotal: number; lineDiscount: number; lineTaxable: number; lineTax: number; lineTotal: number;
} {
  const lineSubtotal = round2(line.quantity * line.unitPrice);
  let lineDiscount = 0;
  if (line.discountType === 'PERCENTAGE') {
    lineDiscount = round2((lineSubtotal * line.discountValue) / 100);
  } else if (line.discountType === 'FIXED') {
    lineDiscount = round2(line.discountValue);
  }
  if (lineDiscount > lineSubtotal) lineDiscount = lineSubtotal;
  if (lineDiscount < 0) lineDiscount = 0;
  const lineTaxable = round2(lineSubtotal - lineDiscount);
  const lineTax = invoiceType === 'TAX' ? round2((lineTaxable * line.taxRate) / 100) : 0;
  const lineTotal = round2(lineTaxable + lineTax);
  return { lineSubtotal, lineDiscount, lineTaxable, lineTax, lineTotal };
}

export interface InvoiceTotals<T extends DraftLine = DraftLine> {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxBreakdown: TaxBreakdown;
  totalTax: number;
  additionalChargeAmount: number;
  grandTotal: number;
  lines: (T & ReturnType<typeof calcLine>)[];
}

export interface CalcInvoiceOptions {
  /** Tax-split override; default 'AUTO' (state-based behaviour). */
  taxSplit?: TaxSplit;
  /** Invoice-level additional charge (Rent etc.), added to the grand total. */
  additionalChargeAmount?: number;
}

export function calcInvoice<T extends DraftLine>(
  lines: T[],
  invoiceType: InvoiceType,
  businessState: string,
  customerState: string,
  options: CalcInvoiceOptions = {},
): InvoiceTotals<T> {
  const computed = lines.map((l) => ({ ...l, ...calcLine(l, invoiceType) }));
  const subtotal = round2(computed.reduce((s, l) => s + l.lineSubtotal, 0));
  const discountAmount = round2(computed.reduce((s, l) => s + l.lineDiscount, 0));
  const taxableAmount = round2(computed.reduce((s, l) => s + l.lineTaxable, 0));
  const totalTax = round2(computed.reduce((s, l) => s + l.lineTax, 0));
  // Additional charge (Rent / Vehicle Charge): added after tax, so the
  // rule is exactly grand = (subtotal − discounts) + tax + charge for
  // TAX, and grand = subtotal − discounts + charge for NON_TAX (where
  // totalTax is 0 and taxableAmount already equals subtotal − discounts).
  const additionalChargeAmount = round2(Math.max(0, options.additionalChargeAmount ?? 0));
  const grandTotal = round2(taxableAmount + totalTax + additionalChargeAmount);

  const split = options.taxSplit ?? 'AUTO';
  let taxBreakdown: TaxBreakdown;
  if (invoiceType !== 'TAX') {
    taxBreakdown = { kind: 'NONE', cgst: 0, sgst: 0, igst: 0, gst: 0 };
  } else if (split === 'CGST_SGST') {
    // Forced split: CGST + SGST sum exactly to totalTax (no 1-paise drift).
    const cgst = round2(totalTax / 2);
    taxBreakdown = { kind: 'CGST_SGST', cgst, sgst: round2(totalTax - cgst), igst: 0, gst: 0 };
  } else if (split === 'IGST') {
    taxBreakdown = { kind: 'IGST', cgst: 0, sgst: 0, igst: totalTax, gst: 0 };
  } else if (split === 'GST') {
    taxBreakdown = { kind: 'GST', cgst: 0, sgst: 0, igst: 0, gst: totalTax };
  } else if (totalTax === 0) {
    taxBreakdown = { kind: 'GST', cgst: 0, sgst: 0, igst: 0, gst: 0 };
  } else if (businessState.trim() && customerState.trim()) {
    if (normaliseState(businessState) === normaliseState(customerState)) {
      const cgst = round2(totalTax / 2);
      taxBreakdown = { kind: 'CGST_SGST', cgst, sgst: round2(totalTax - cgst), igst: 0, gst: 0 };
    } else {
      taxBreakdown = { kind: 'IGST', cgst: 0, sgst: 0, igst: totalTax, gst: 0 };
    }
  } else {
    // AUTO with a missing state: one combined GST line — CGST/SGST are
    // never faked. The editor's Tax Split control can override this.
    taxBreakdown = { kind: 'GST', cgst: 0, sgst: 0, igst: 0, gst: totalTax };
  }
  return { subtotal, discountAmount, taxableAmount, taxBreakdown, totalTax, additionalChargeAmount, grandTotal, lines: computed };
}

export function validateLine(line: DraftLine): string[] {
  const errors: string[] = [];
  if (!line.productName.trim()) errors.push('Item name is required.');
  if (!(line.quantity > 0)) errors.push(`"${line.productName || 'Item'}" quantity must be greater than zero.`);
  if (line.unitPrice < 0 || !Number.isFinite(line.unitPrice)) errors.push(`"${line.productName || 'Item'}" price cannot be negative.`);
  const amount = line.quantity * line.unitPrice;
  if (line.discountType === 'PERCENTAGE' && (line.discountValue < 0 || line.discountValue > 100)) {
    errors.push(`"${line.productName || 'Item'}" percentage discount must be between 0 and 100.`);
  }
  if (line.discountType === 'FIXED' && line.discountValue > amount) {
    errors.push(`"${line.productName || 'Item'}" discount cannot exceed the item amount.`);
  }
  if (line.taxRate < 0 || line.taxRate > 100) errors.push(`"${line.productName || 'Item'}" tax rate must be between 0 and 100.`);
  return errors;
}

export function validateInvoiceDraft(customerId: string, lines: DraftLine[]): string[] {
  const errors: string[] = [];
  if (!customerId) errors.push('Please select a customer.');
  if (lines.length === 0) errors.push('Add at least one item.');
  lines.forEach((l) => errors.push(...validateLine(l)));
  return errors;
}

/**
 * Finalize-time validation. Drafts may be saved incomplete, but a line
 * with quantity or price 0 must never be finalized — a 0 price means
 * the price was never entered (dynamic-price gums start at ₹0, so the
 * operator must type a price on each invoice). Each offending item is
 * named so the operator knows exactly what to fix. The generic
 * quantity message from validateLine is replaced with the same
 * "not entered" wording so the finalize list reads consistently.
 */
export function validateForFinalize(customerId: string, lines: DraftLine[]): string[] {
  const errors = validateInvoiceDraft(customerId, lines)
    .filter((e) => !e.includes('quantity must be greater than zero'));
  for (const l of lines) {
    const name = l.productName.trim() || 'Item';
    if (!(l.quantity > 0)) errors.push(`Quantity not entered for: ${name} — enter a quantity before finalizing.`);
    if (!(l.unitPrice > 0)) errors.push(`Price not entered for: ${name} — enter a price before finalizing.`);
  }
  return errors;
}

/**
 * Pure draft-merge used by the "add customer from invoice" flow and its
 * test: the new customer is attached, every other draft field is
 * returned untouched (same object references for lines/notes/etc.).
 */
export function applyNewCustomerToDraft<T extends { customerId: string }>(
  draft: T,
  newCustomerId: string,
): T {
  return { ...draft, customerId: newCustomerId };
}

/** Service-layer guard for the 7-active-product business rule. */
export function canAddActiveProduct(activeCount: number, isNewActive: boolean): boolean {
  if (!isNewActive) return true;
  return activeCount < 7;
}

export function activeProductCount(products: { isActive: boolean }[]): number {
  return products.filter((p) => p.isActive).length;
}
