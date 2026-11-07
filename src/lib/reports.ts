import { round2 } from './calc';
import type { Invoice, InvoiceStatus, InvoiceType, Product } from './types';

/**
 * Reports (for auditing) — pure functions, no React/Dexie.
 * Everything is derived from stored invoice snapshots, so later edits
 * to products or customers never change an exported report.
 */

export type ReportTypeFilter = 'ALL' | InvoiceType;
export type ReportStatusFilter = 'ALL' | InvoiceStatus;

export interface ReportFilters {
  type: ReportTypeFilter;
  status: ReportStatusFilter;
  from?: string; // YYYY-MM-DD, inclusive; '' = unbounded
  to?: string; // YYYY-MM-DD, inclusive; '' = unbounded
}

export function filterInvoices(invoices: Invoice[], filters: ReportFilters): Invoice[] {
  const from = (filters.from ?? '').trim();
  const to = (filters.to ?? '').trim();
  return invoices.filter((inv) => {
    if (filters.type !== 'ALL' && inv.invoiceType !== filters.type) return false;
    if (filters.status !== 'ALL' && inv.status !== filters.status) return false;
    // issueDate is stored as YYYY-MM-DD, so lexicographic comparison
    // is chronological and inclusive on both ends.
    if (from && inv.issueDate < from) return false;
    if (to && inv.issueDate > to) return false;
    return true;
  });
}

/** Audit order: oldest first, then invoice number. */
export function sortAudit(invoices: Invoice[]): Invoice[] {
  return [...invoices].sort((a, b) =>
    a.issueDate.localeCompare(b.issueDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
}

export const SUMMARY_HEADERS = [
  'Invoice No', 'Date', 'Type', 'Status', 'Customer', 'Subtotal', 'Discount',
  'Taxable Value', 'CGST', 'SGST', 'IGST', 'GST',
  'Additional Charge Label', 'Additional Charge Amount', 'Grand Total',
] as const;

export type SummaryRow = (string | number)[];

export function summaryRows(filtered: Invoice[]): SummaryRow[] {
  return sortAudit(filtered).map((inv) => {
    const tb = inv.taxBreakdown;
    const isTax = inv.invoiceType === 'TAX';
    return [
      inv.invoiceNumber,
      inv.issueDate,
      isTax ? 'Tax Invoice' : 'Bill',
      inv.status,
      inv.customerSnapshot.name,
      inv.subtotal,
      inv.discountAmount,
      isTax ? inv.taxableAmount : round2(inv.subtotal - inv.discountAmount),
      isTax ? tb.cgst : 0,
      isTax ? tb.sgst : 0,
      isTax ? tb.igst : 0,
      isTax ? tb.gst : 0,
      inv.additionalChargeLabel ?? '',
      inv.additionalChargeAmount ?? 0,
      inv.grandTotal,
    ];
  });
}

export const ITEM_HEADERS = [
  'Invoice No', 'Date', 'Customer', 'Status', 'Item', 'HSN/SAC', 'Unit',
  'Qty', 'Rate', 'Discount', 'Taxable Value', 'Tax Rate %', 'Tax Amount', 'Line Total',
] as const;

export type ItemRow = (string | number)[];

export function itemRows(filtered: Invoice[]): ItemRow[] {
  const rows: ItemRow[] = [];
  for (const inv of sortAudit(filtered)) {
    for (const line of inv.lineItems) {
      rows.push([
        inv.invoiceNumber,
        inv.issueDate,
        inv.customerSnapshot.name,
        inv.status,
        line.productName,
        line.hsnSacCode ?? '',
        line.unit,
        line.quantity,
        line.unitPrice,
        line.lineDiscount,
        line.lineTaxable,
        line.taxRate,
        line.lineTax,
        line.lineTotal,
      ]);
    }
  }
  return rows;
}

export const HSN_HEADERS = [
  'HSN/SAC', 'Tax Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'GST', 'Total Tax',
] as const;

export interface HsnReportRow {
  hsn: string;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
  totalTax: number;
}

/**
 * HSN-wise report — includes TAX invoices AND bills (bills contribute
 * taxable value with all tax columns 0, so the auditor sees the full
 * HSN picture, not just the taxed part).
 *
 * Two gaps in the old version are fixed here:
 * - Invoices saved before lines carried an HSN get their HSNs back from
 *   the current product catalogue (by productId, falling back to an
 *   exact product-name match). Stored invoices are never mutated —
 *   enrichment happens on copies built for this report only.
 * - Grouping is by HSN + tax rate, so the same HSN at two rates is
 *   never merged into one misleading row.
 *
 * For a tax invoice, CGST/SGST are allocated per (HSN, rate) group so
 * the group's column totals match the invoice's own breakdown exactly:
 * each group takes half its tax as CGST (SGST = tax − CGST), except
 * the last group, which takes the remainder of the invoice's CGST and
 * SGST, so no paise drifts. IGST/GST groups take their full tax.
 */
export function hsnRows(filtered: Invoice[], products: Pick<Product, 'id' | 'name' | 'hsnSacCode'>[] = []): HsnReportRow[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
  const enrichHsn = (inv: Invoice, line: Invoice['lineItems'][number]): string => {
    const own = (line.hsnSacCode || '').trim();
    if (own) return own;
    const fromId = line.productId ? byId.get(line.productId) : undefined;
    const fromName = !fromId ? byName.get(line.productName.trim().toLowerCase()) : undefined;
    return (fromId?.hsnSacCode || fromName?.hsnSacCode || '').trim();
  };

  const byKey = new Map<string, HsnReportRow>();
  const add = (hsn: string, rate: number, taxable: number, cgst: number, sgst: number, igst: number, gst: number) => {
    const key = `${hsn}@@${rate}`;
    const cur = byKey.get(key) ?? { hsn, rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, totalTax: 0 };
    cur.taxable = round2(cur.taxable + taxable);
    cur.cgst = round2(cur.cgst + cgst);
    cur.sgst = round2(cur.sgst + sgst);
    cur.igst = round2(cur.igst + igst);
    cur.gst = round2(cur.gst + gst);
    cur.totalTax = round2(cur.totalTax + cgst + sgst + igst + gst);
    byKey.set(key, cur);
  };

  for (const inv of filtered) {
    // Group this invoice's lines by (HSN, rate) first, then allocate
    // the invoice-level breakdown across those groups.
    const groups = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
    for (const line of inv.lineItems) {
      const hsn = enrichHsn(inv, line);
      if (!hsn) continue;
      const rate = inv.invoiceType === 'TAX' ? line.taxRate : 0;
      const key = `${hsn}@@${rate}`;
      const g = groups.get(key) ?? { hsn, rate, taxable: 0, tax: 0 };
      g.taxable = round2(g.taxable + line.lineTaxable);
      g.tax = round2(g.tax + line.lineTax);
      groups.set(key, g);
    }
    if (groups.size === 0) continue;
    const entries = [...groups.values()];
    const kind = inv.taxBreakdown.kind;
    if (inv.invoiceType !== 'TAX') {
      for (const g of entries) add(g.hsn, 0, g.taxable, 0, 0, 0, 0);
      continue;
    }
    let cgstUsed = 0;
    let sgstUsed = 0;
    entries.forEach((g, idx) => {
      const last = idx === entries.length - 1;
      if (kind === 'CGST_SGST') {
        const cgst = last ? round2(inv.taxBreakdown.cgst - cgstUsed) : round2(g.tax / 2);
        const sgst = last ? round2(inv.taxBreakdown.sgst - sgstUsed) : round2(g.tax - cgst);
        cgstUsed = round2(cgstUsed + cgst);
        sgstUsed = round2(sgstUsed + sgst);
        add(g.hsn, g.rate, g.taxable, cgst, sgst, 0, 0);
      } else if (kind === 'IGST') {
        add(g.hsn, g.rate, g.taxable, 0, 0, g.tax, 0);
      } else {
        add(g.hsn, g.rate, g.taxable, 0, 0, 0, g.tax);
      }
    });
  }
  return [...byKey.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
}

export function hsnRowsAsArrays(rows: HsnReportRow[]): (string | number)[][] {
  return rows.map((r) => [r.hsn, r.rate, r.taxable, r.cgst, r.sgst, r.igst, r.gst, r.totalTax]);
}

export interface NetTotals {
  invoiceCount: number;
  taxInvoiceCount: number;
  nonTaxCount: number;
  draftCount: number;
  finalCount: number;
  cancelledCount: number;
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
  additionalCharge: number;
  grandTotal: number;
  taxGrandTotal: number;
  nonTaxGrandTotal: number;
}

const sum = (nums: number[]): number => round2(nums.reduce((s, n) => s + n, 0));

export function netTotals(filtered: Invoice[]): NetTotals {
  const tax = filtered.filter((i) => i.invoiceType === 'TAX');
  const nonTax = filtered.filter((i) => i.invoiceType === 'NON_TAX');
  const taxableOf = (inv: Invoice): number =>
    inv.invoiceType === 'TAX' ? inv.taxableAmount : round2(inv.subtotal - inv.discountAmount);
  return {
    invoiceCount: filtered.length,
    taxInvoiceCount: tax.length,
    nonTaxCount: nonTax.length,
    draftCount: filtered.filter((i) => i.status === 'DRAFT').length,
    finalCount: filtered.filter((i) => i.status === 'FINAL').length,
    cancelledCount: filtered.filter((i) => i.status === 'CANCELLED').length,
    subtotal: sum(filtered.map((i) => i.subtotal)),
    discount: sum(filtered.map((i) => i.discountAmount)),
    taxable: sum(filtered.map(taxableOf)),
    cgst: sum(tax.map((i) => i.taxBreakdown.cgst)),
    sgst: sum(tax.map((i) => i.taxBreakdown.sgst)),
    igst: sum(tax.map((i) => i.taxBreakdown.igst)),
    gst: sum(tax.map((i) => i.taxBreakdown.gst)),
    additionalCharge: sum(filtered.map((i) => i.additionalChargeAmount ?? 0)),
    grandTotal: sum(filtered.map((i) => i.grandTotal)),
    taxGrandTotal: sum(tax.map((i) => i.grandTotal)),
    nonTaxGrandTotal: sum(nonTax.map((i) => i.grandTotal)),
  };
}

export function describeFilters(filters: ReportFilters): string {
  const type = filters.type === 'ALL' ? 'All types' : filters.type === 'TAX' ? 'Tax Invoice' : 'Without Tax';
  const status = filters.status === 'ALL' ? 'All statuses' : filters.status[0] + filters.status.slice(1).toLowerCase();
  const from = (filters.from ?? '').trim();
  const to = (filters.to ?? '').trim();
  const period = !from && !to ? 'All dates' : `${from || '…'} to ${to || '…'}`;
  return `Type: ${type} · Status: ${status} · Period: ${period}`;
}
