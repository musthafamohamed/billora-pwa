import { describe, expect, it } from 'vitest';
import { planStarterAdditions, PM_SONS_PROFILE, shouldSeedStarter, sortProductsForDisplay, starterIdFor, STARTER_PRODUCTS } from './starter';

describe('PM Sons starter data', () => {
  it('has exactly 7 starter products and the profile facts from the PDFs', () => {
    expect(STARTER_PRODUCTS).toHaveLength(7);
    expect(PM_SONS_PROFILE.businessName).toBe('PM SONS ENTERPRISES');
    expect(PM_SONS_PROFILE.gstin).toBe('32ABCFP0332M1ZI');
    expect(PM_SONS_PROFILE.state).toBe('Kerala');
    expect(PM_SONS_PROFILE.stateCode).toBe('32');
    expect(PM_SONS_PROFILE.phone).toBe('');
    expect(PM_SONS_PROFILE.bankName).toBe('');
  });
  it('lists bricks first, then gums, with all gum prices dynamic (0)', () => {
    expect(STARTER_PRODUCTS.map((p) => p.name)).toEqual([
      '4’’8"12 HOLLOW BRICKS', '5’’8"12 HOLLOW BRICKS', '6’’8"12 HOLLOW BRICKS', '8’’8"12 HOLLOW BRICKS',
      'GRAND MIX TILE GUM DIAMOND', 'GRAND MIX TILE GUM GOLD', 'GRAND MIX TILE GUM SILVER',
    ]);
    const byName = Object.fromEntries(STARTER_PRODUCTS.map((p) => [p.name, p]));
    // Diamond's old PDF price (350) is no longer fixed: gum prices vary
    // per sale, so all three gums are dynamic (0) with a note to enter
    // the price on each invoice.
    for (const gum of ['GRAND MIX TILE GUM DIAMOND', 'GRAND MIX TILE GUM GOLD', 'GRAND MIX TILE GUM SILVER']) {
      expect(byName[gum].sellingPrice).toBe(0);
      expect(byName[gum].hsnSacCode).toBe('3824');
      expect(byName[gum].description).toContain('dynamic');
    }
    expect(byName['4’’8"12 HOLLOW BRICKS'].sellingPrice).toBe(33);
    expect(byName['6’’8"12 HOLLOW BRICKS'].sellingPrice).toBe(42);
    expect(byName['6’’8"12 HOLLOW BRICKS'].hsnSacCode).toBe('6810');
    expect(byName['8’’8"12 HOLLOW BRICKS'].sellingPrice).toBe(54);
  });
  it('sorts starter products bricks-first regardless of stored order, and gives deterministic starter IDs', () => {
    expect(starterIdFor('GRAND MIX TILE GUM DIAMOND')).toBe(starterIdFor('GRAND MIX TILE GUM DIAMOND'));
    const shuffled = [
      { name: 'GRAND MIX TILE GUM SILVER', createdAt: '2026-01-01T00:00:00.000Z' },
      { name: 'Other Product', createdAt: '2026-01-01T00:00:00.000Z' },
      { name: '6’’8"12 HOLLOW BRICKS', createdAt: '2026-01-02T00:00:00.000Z' },
      { name: 'GRAND MIX TILE GUM DIAMOND', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(sortProductsForDisplay(shuffled).map((p) => p.name)).toEqual([
      '6’’8"12 HOLLOW BRICKS', 'GRAND MIX TILE GUM DIAMOND', 'GRAND MIX TILE GUM SILVER', 'Other Product',
    ]);
  });
  it('seeds only on a completely empty database', () => {
    expect(shouldSeedStarter({ hasProfile: false, productCount: 0, customerCount: 0, invoiceCount: 0, starterSeeded: false })).toBe(true);
    expect(shouldSeedStarter({ hasProfile: true, productCount: 0, customerCount: 0, invoiceCount: 0, starterSeeded: false })).toBe(false);
    expect(shouldSeedStarter({ hasProfile: false, productCount: 1, customerCount: 0, invoiceCount: 0, starterSeeded: false })).toBe(false);
    expect(shouldSeedStarter({ hasProfile: false, productCount: 0, customerCount: 0, invoiceCount: 0, starterSeeded: true })).toBe(false);
  });
  it('adds all 7 on an empty catalogue', () => {
    const { toAdd, skipped } = planStarterAdditions([]);
    expect(toAdd).toHaveLength(7);
    expect(skipped).toHaveLength(0);
  });
  it('deduplicates by name, case-insensitively, and respects the 7-active cap', () => {
    const existing = [
      { name: 'grand mix tile gum diamond', isActive: true },
      { name: 'Other Product', isActive: true },
      { name: 'Second', isActive: true },
      { name: 'Third', isActive: true },
      { name: 'Fourth', isActive: true },
      { name: 'Fifth', isActive: true },
    ];
    // 6 active already: only 1 more starter fits, the rest are cap-skipped.
    // Bricks come first in the new order, so the one that fits is a brick.
    const { toAdd, skipped } = planStarterAdditions(existing);
    expect(toAdd).toHaveLength(1);
    expect(toAdd[0].name).toBe('4’’8"12 HOLLOW BRICKS');
    expect(skipped.some((s) => s.skipReason === '7 active product limit reached')).toBe(true);
    // Inactive products do not consume the cap.
    const withInactive = [{ name: 'Old', isActive: false }];
    expect(planStarterAdditions(withInactive).toAdd).toHaveLength(7);
  });
});
