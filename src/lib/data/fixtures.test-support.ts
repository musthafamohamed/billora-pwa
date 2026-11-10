import type { Customer, Invoice, Product } from '../types';
import { businessSnapshotOf, customerSnapshotOf, emptyProfile } from '../types';

export const timestamp = '2026-11-09T08:00:00.000Z';
export const product: Product = { id: 'p1', name: 'Item', description: '', unit: 'Piece', sellingPrice: 100,
  defaultTaxRate: 18, hsnSacCode: '', isActive: true, createdAt: timestamp, updatedAt: timestamp };
export const customer: Customer = { id: 'c1', name: 'Customer', phone: '', email: '', billingAddress: '',
  gstin: '', state: 'Kerala', notes: '', createdAt: timestamp, updatedAt: timestamp };
export function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return { id: 'i1', invoiceNumber: 'INV-2026-0001', invoiceType: 'TAX', status: 'FINAL', issueDate: '2026-11-09',
    dueDate: '', customerId: 'c1', customerSnapshot: customerSnapshotOf(customer),
    businessSnapshot: businessSnapshotOf({ ...emptyProfile(), businessName: 'Business', state: 'Kerala' }),
    lineItems: [{ id: 'l1', productId: 'p1', productName: 'Item', description: '', unit: 'Piece', quantity: 2,
      unitPrice: 100, discountType: 'PERCENTAGE', discountValue: 10, taxRate: 18,
      lineSubtotal: 200, lineDiscount: 20, lineTaxable: 180, lineTax: 32.4, lineTotal: 212.4 }],
    subtotal: 200, discountAmount: 20, taxableAmount: 180, totalTax: 32.4,
    taxBreakdown: { kind: 'CGST_SGST', cgst: 16.2, sgst: 16.2, igst: 0, gst: 0 }, grandTotal: 212.4,
    notes: '', termsAndConditions: '', createdAt: timestamp, updatedAt: timestamp, ...overrides };
}
export function backup() {
  return { app: 'simple-bill' as const, version: 1 as const, exportedAt: timestamp,
    profile: emptyProfile(), products: [{ ...product }], customers: [{ ...customer }], invoices: [invoice()] };
}
