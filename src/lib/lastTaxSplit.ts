import type { TaxSplit } from './types';

const KEY = 'simple-bill-last-tax-split';

const VALID: TaxSplit[] = ['AUTO', 'CGST_SGST', 'IGST', 'GST'];

/**
 * The Tax Split last chosen in the invoice editor, remembered across
 * new invoices. Editing an existing invoice never reads this — it
 * starts from that invoice's own stored split — but every dropdown
 * change writes here, so the next new invoice starts with the same
 * choice even if the current draft is discarded.
 */
export function getLastTaxSplit(): TaxSplit {
  try {
    const v = window.localStorage.getItem(KEY);
    return (VALID as string[]).includes(v ?? '') ? (v as TaxSplit) : 'AUTO';
  } catch {
    return 'AUTO';
  }
}

export function setLastTaxSplit(split: TaxSplit): void {
  try {
    window.localStorage.setItem(KEY, split);
  } catch {
    // Storage unavailable (private mode etc.) — the current invoice is
    // unaffected; only the remembering is lost.
  }
}
