import type { DraftLine } from './calc';
import type { Invoice, InvoiceType, TaxSplit } from './types';

export interface InvoiceRecovery {
  invoiceId: string; invoiceNumber: string; invoiceType: InvoiceType;
  issueDate: string; dueDate: string; customerId: string;
  lines: (DraftLine & { id: string; hsnSacCode?: string })[];
  notes: string; terms: string; chargeLabel: string; chargeAmount: number; taxSplit: TaxSplit;
  createdAt: string; updatedAt: string; baseUpdatedAt: string;
}

const PREFIX = 'simple-bill-invoice-recovery:v1:';
// Keeps SPA navigation recoverable even when the browser denies persistent storage.
// The editor still warns that this fallback will not survive closing the page.
const memory = new Map<string, string>();
const keyFor = (id: string | undefined) => PREFIX + (id ?? 'new');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));

function validDraft(v: unknown): v is InvoiceRecovery {
  if (!object(v) || !['invoiceId', 'invoiceNumber', 'customerId', 'notes', 'terms', 'chargeLabel', 'baseUpdatedAt'].every(k => typeof v[k] === 'string')
    || !v.invoiceId || !v.invoiceNumber || !['TAX', 'NON_TAX'].includes(String(v.invoiceType))
    || !['AUTO', 'CGST_SGST', 'IGST', 'GST'].includes(String(v.taxSplit))
    || (v.issueDate !== '' && !date(v.issueDate)) || (v.dueDate !== '' && !date(v.dueDate))
    || !timestamp(v.createdAt) || !timestamp(v.updatedAt) || (v.baseUpdatedAt !== '' && !timestamp(v.baseUpdatedAt))
    || !finite(v.chargeAmount) || !Array.isArray(v.lines)) return false;
  return v.lines.every(l => object(l) && typeof l.id === 'string' && !!l.id
    && ['productName', 'unit'].every(k => typeof l[k] === 'string')
    && ['productId', 'description', 'hsnSacCode'].every(k => l[k] === undefined || typeof l[k] === 'string')
    && ['quantity', 'unitPrice', 'discountValue', 'taxRate'].every(k => finite(l[k]))
    && ['NONE', 'PERCENTAGE', 'FIXED'].includes(String(l.discountType)));
}

export function writeInvoiceRecovery(id: string | undefined, draft: InvoiceRecovery): boolean {
  const key = keyFor(id);
  const raw = JSON.stringify(draft);
  try { localStorage.setItem(key, raw); memory.delete(key); return true; }
  catch { memory.set(key, raw); return false; }
}

export function readInvoiceRecovery(id: string | undefined, invoices: Invoice[]): InvoiceRecovery | null {
  const key = keyFor(id);
  let raw = memory.get(key);
  try { raw ??= localStorage.getItem(key) ?? undefined; } catch { /* use the in-memory working copy */ }
  if (!raw) return null;
  try {
    const draft: unknown = JSON.parse(raw);
    if (!validDraft(draft) || (id && draft.invoiceId !== id)) throw new Error('Invalid working copy');
    const saved = invoices.find(i => i.id === draft.invoiceId);
    if ((id && !saved) || (!saved && draft.baseUpdatedAt)
      || (saved && (saved.status !== 'DRAFT' || (saved.updatedAt !== draft.baseUpdatedAt && saved.updatedAt > draft.updatedAt)))) {
      throw new Error('Working copy was superseded');
    }
    return draft;
  } catch { clearInvoiceRecovery(id); return null; }
}

export function clearInvoiceRecovery(id: string | undefined): void {
  const key = keyFor(id);
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
}

export function clearInvoiceRecoveries(): void {
  memory.clear();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch { /* storage may be unavailable */ }
}
