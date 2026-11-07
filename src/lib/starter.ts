import { emptyProfile, MAX_ACTIVE_PRODUCTS, type BusinessProfile, type Product } from './types';

/**
 * PM Sons Enterprises — single-company starter data.
 *
 * Business facts taken ONLY from the user's own invoices
 * (Accounting_Voucher.pdf, Sep 2026 tax invoice, and
 * Accounting_Voucher__1.pdf, Oct 2026 bill of supply). Nothing else from
 * those documents — no other names, amounts or content — is used here.
 *
 * Readings / assumptions, all flagged in the README:
 * - The PDF text renders the town as "hanoor"; Thanur is the Malappuram
 *   town at PIN 676302, so the address uses Thanur.
 * - Tile-gum prices are DYNAMIC (the operator's later instruction): all
 *   three gums are seeded at ₹0 with a description telling the operator
 *   to enter the price on each invoice. Diamond's Sep/Oct PDF price was
 *   ₹350, but it is no longer fixed — do not reintroduce it as a fixed
 *   price. GOLD and SILVER prices were never in the PDFs. The user wrote
 *   "SLIVER"; the correct spelling SILVER is used.
 * - Tile-gum GST 18% is a standard-slab default, NOT from the PDFs: the
 *   Diamond bill was a non-tax Bill of Supply, so it states no tax rate.
 *   It is changeable in Products.
 * - Brick GST 18% IS from the Sep PDF: OUTPUT CGST 9% + OUTPUT SGST 9%.
 * - 6" hollow bricks: the Sep PDF showed ₹41, but the user's current
 *   price list says ₹42 — the user's list wins.
 * - Phone, email and bank details are NOT in the PDFs, so they are left
 *   blank here and are never invented.
 */

export const PM_SONS_PROFILE: BusinessProfile = {
  ...emptyProfile(),
  businessName: 'PM SONS ENTERPRISES',
  address: 'Ground Floor, 11/77B, Tirur Road, Vallikanjiram, Near Vallikanjiram Juma Masjid, Thanur, Malappuram, Kerala, 676302',
  gstin: '32ABCFP0332M1ZI',
  state: 'Kerala',
  stateCode: '32',
  invoicePrefix: 'INV',
  defaultTaxRate: 18,
};

export interface StarterProduct {
  name: string;
  description: string;
  unit: string;
  sellingPrice: number;
  defaultTaxRate: number;
  hsnSacCode: string;
}

const PRICE_DYNAMIC = 'Price is dynamic — enter the price on each invoice.';

// Display/seed order: the 4 hollow bricks first, then the 3 tile gums.
export const STARTER_PRODUCTS: StarterProduct[] = [
  { name: '4’’8"12 HOLLOW BRICKS', description: '', unit: 'NOS', sellingPrice: 33, defaultTaxRate: 18, hsnSacCode: '6810' },
  { name: '5’’8"12 HOLLOW BRICKS', description: '', unit: 'NOS', sellingPrice: 38, defaultTaxRate: 18, hsnSacCode: '6810' },
  { name: '6’’8"12 HOLLOW BRICKS', description: '', unit: 'NOS', sellingPrice: 42, defaultTaxRate: 18, hsnSacCode: '6810' },
  { name: '8’’8"12 HOLLOW BRICKS', description: '', unit: 'NOS', sellingPrice: 54, defaultTaxRate: 18, hsnSacCode: '6810' },
  { name: 'GRAND MIX TILE GUM DIAMOND', description: PRICE_DYNAMIC, unit: 'NOS', sellingPrice: 0, defaultTaxRate: 18, hsnSacCode: '3824' },
  { name: 'GRAND MIX TILE GUM GOLD', description: PRICE_DYNAMIC, unit: 'NOS', sellingPrice: 0, defaultTaxRate: 18, hsnSacCode: '3824' },
  { name: 'GRAND MIX TILE GUM SILVER', description: PRICE_DYNAMIC, unit: 'NOS', sellingPrice: 0, defaultTaxRate: 18, hsnSacCode: '3824' },
];

/** Deterministic ID for a starter product, so concurrent seeding runs
 *  (e.g. React StrictMode's double effect in dev) put the same row twice
 *  instead of creating two rows with different random IDs. */
export function starterIdFor(name: string): string {
  return `starter-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** Display order: starter-named products in STARTER_PRODUCTS order
 *  (bricks first, then gums), then everything else by createdAt. This
 *  applies to phones that seeded the old order without rewriting data. */
export function sortProductsForDisplay<T extends { name: string; createdAt: string }>(products: T[]): T[] {
  const order = new Map(STARTER_PRODUCTS.map((p, i) => [normName(p.name), i]));
  return [...products].sort((a, b) => {
    const ai = order.get(normName(a.name));
    const bi = order.get(normName(b.name));
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);
  });
}

const normName = (s: string) => s.trim().toLowerCase();

/**
 * Pure seeding logic (unit-tested, no Dexie involved):
 * - Never seed when any business data already exists or the seed flag is set.
 * - Otherwise add only starter products whose name is not already present
 *   (case-insensitive), and only while active products stay below the cap.
 */
export function shouldSeedStarter(args: {
  hasProfile: boolean; productCount: number; customerCount: number; invoiceCount: number; starterSeeded: boolean;
}): boolean {
  return !args.hasProfile && args.productCount === 0 && args.customerCount === 0 &&
    args.invoiceCount === 0 && !args.starterSeeded;
}

export interface PlannedAddition { product: StarterProduct; skipped: boolean; skipReason?: string }

export function planStarterAdditions(
  existing: Pick<Product, 'name' | 'isActive'>[],
  candidates: StarterProduct[] = STARTER_PRODUCTS,
): { toAdd: StarterProduct[]; skipped: PlannedAddition[] } {
  const present = new Set(existing.map((p) => normName(p.name)));
  let active = existing.filter((p) => p.isActive).length;
  const toAdd: StarterProduct[] = [];
  const skipped: PlannedAddition[] = [];
  for (const product of candidates) {
    if (present.has(normName(product.name))) {
      skipped.push({ product, skipped: true, skipReason: 'already exists' });
      continue;
    }
    if (active >= MAX_ACTIVE_PRODUCTS) {
      skipped.push({ product, skipped: true, skipReason: '7 active product limit reached' });
      continue;
    }
    toAdd.push(product);
    present.add(normName(product.name));
    active += 1;
  }
  return { toAdd, skipped };
}
