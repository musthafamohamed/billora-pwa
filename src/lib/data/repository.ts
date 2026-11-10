import type { BackupData, BusinessProfile, Customer, Invoice, Product } from '../../../shared/billing/types';

// One repository instance owns one workspace. No global tenant selector or
// Firebase concepts belong in these application-facing persistence contracts.
export interface ProductRepository {
  listProducts(): Promise<Product[]>;
  upsertProduct(product: Product): Promise<void>;
  deleteProduct(id: string): Promise<void>;
}
export interface CustomerRepository {
  listCustomers(): Promise<Customer[]>;
  upsertCustomer(customer: Customer): Promise<void>;
}
export interface InvoiceRepository {
  listInvoices(): Promise<Invoice[]>;
  /** Must atomically read, validate the status transition and write. */
  upsertInvoice(invoice: Invoice): Promise<void>;
  deleteInvoice(id: string): Promise<void>;
}
export interface ProfileRepository {
  getProfile(): Promise<BusinessProfile | null>;
  saveProfile(profile: BusinessProfile): Promise<void>;
}
export interface MetadataRepository {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}
export interface BillingRepository extends ProductRepository, CustomerRepository, InvoiceRepository, ProfileRepository, MetadataRepository {
  /** Explicit user restore only. Preflight before any writes; all tables and
   * profile must either commit together or remain unchanged. */
  replaceAll(data: BackupData): Promise<void>;
}
