/** Deterministic, sequential invoice numbers per prefix + year.
 *  e.g. INV-2026-0001. Numbers are never reused: the next number is
 *  always max(existing for that prefix+year) + 1, even if an invoice
 *  was cancelled or a draft deleted. */
export function nextInvoiceNumber(
  existing: string[],
  prefix: string,
  year: number,
): string {
  const clean = (prefix || 'INV').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'INV';
  const re = new RegExp(`^${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${year}-(\\d+)$`);
  let max = 0;
  for (const n of existing) {
    const m = re.exec(n.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${clean}-${year}-${String(max + 1).padStart(4, '0')}`;
}
