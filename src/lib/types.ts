export type InvoiceType = 'TAX' | 'NON_TAX';
export type InvoiceStatus = 'DRAFT' | 'FINAL' | 'CANCELLED';
export type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED';
export type TaxBreakdownKind = 'CGST_SGST' | 'IGST' | 'GST' | 'NONE';
/** Per-invoice tax-split choice. AUTO = state-based default (same state
 *  → CGST+SGST, different states → IGST, missing state → combined GST). */
export type TaxSplit = 'AUTO' | 'CGST_SGST' | 'IGST' | 'GST';

export interface BusinessProfile {
  businessName: string;
  proprietorName: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  state: string;
  stateCode: string;
  invoicePrefix: string;
  defaultTaxRate: number;
  logo: string; // data URL, or '' when none
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  termsAndConditions: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  unit: string;
  sellingPrice: number;
  defaultTaxRate: number;
  hsnSacCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  billingAddress: string;
  gstin: string;
  state: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  id: string;
  productId: string;
  productName: string;
  hsnSacCode?: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTaxable: number;
  lineTax: number;
  lineTotal: number;
}

export interface TaxBreakdown {
  kind: TaxBreakdownKind;
  cgst: number;
  sgst: number;
  igst: number;
  gst: number;
}

/** Snapshots: plain copies taken at save time. Later edits to the
 *  source product / customer / business profile never touch these. */
export interface CustomerSnapshot {
  id: string;
  name: string;
  phone: string;
  email: string;
  billingAddress: string;
  gstin: string;
  state: string;
}

export interface BusinessSnapshot {
  businessName: string;
  proprietorName: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  state: string;
  stateCode: string;
  logo: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;
  customerId: string;
  customerSnapshot: CustomerSnapshot;
  businessSnapshot: BusinessSnapshot;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxBreakdown: TaxBreakdown;
  totalTax: number;
  /** Invoice-level additional charge, e.g. Rent / Vehicle Charge.
   *  Optional for backward compatibility: old invoices and old backups
   *  without these fields are treated as label "" / amount 0. */
  additionalChargeLabel?: string;
  additionalChargeAmount?: number;
  /** Tax-split override chosen in the editor; absent = AUTO. */
  taxSplit?: TaxSplit;
  grandTotal: number;
  notes: string;
  termsAndConditions: string;
  createdAt: string;
  updatedAt: string;
}

export const MAX_ACTIVE_PRODUCTS = 7;

export const emptyProfile = (): BusinessProfile => ({
  businessName: '',
  proprietorName: '',
  phone: '',
  email: '',
  address: '',
  gstin: '',
  state: '',
  stateCode: '',
  invoicePrefix: 'INV',
  defaultTaxRate: 18,
  logo: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifsc: '',
  upiId: '',
  termsAndConditions: '',
});

export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const todayISO = (): string => {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const nowISO = (): string => new Date().toISOString();

export function customerSnapshotOf(c: Customer): CustomerSnapshot {
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    billingAddress: c.billingAddress, gstin: c.gstin, state: c.state,
  };
}

export function businessSnapshotOf(p: BusinessProfile): BusinessSnapshot {
  return {
    businessName: p.businessName, proprietorName: p.proprietorName, phone: p.phone,
    email: p.email, address: p.address, gstin: p.gstin, state: p.state,
    stateCode: p.stateCode, logo: p.logo, bankName: p.bankName,
    accountHolderName: p.accountHolderName, accountNumber: p.accountNumber,
    ifsc: p.ifsc, upiId: p.upiId,
  };
}

/** GSTIN format check, only applied when a value is supplied. */
export function isValidGstin(gstin: string): boolean {
  if (!gstin.trim()) return true;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase());
}

export function normaliseState(s: string): string {
  return s.trim().toLowerCase();
}
