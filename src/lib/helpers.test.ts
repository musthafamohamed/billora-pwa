import { describe, expect, it, beforeEach } from 'vitest';
import { isSystemNote } from './systemNote';
import { getLastTaxSplit, setLastTaxSplit } from './lastTaxSplit';

describe('isSystemNote', () => {
  it('matches the two known Products-screen notes, case-insensitively', () => {
    expect(isSystemNote('Price is dynamic — enter the price on each invoice.')).toBe(true);
    expect(isSystemNote('Selling price not supplied — set the price in Products before invoicing.')).toBe(true);
    expect(isSystemNote('PRICE IS DYNAMIC — ENTER THE PRICE')).toBe(true);
  });
  it('leaves genuine descriptions alone', () => {
    expect(isSystemNote('Special order, delivered on site')).toBe(false);
    expect(isSystemNote('')).toBe(false);
    expect(isSystemNote(undefined)).toBe(false);
  });
});

describe('remembered Tax Split', () => {
  beforeEach(() => { window.localStorage.clear(); });
  it('defaults to AUTO, round-trips a choice, and rejects junk', () => {
    expect(getLastTaxSplit()).toBe('AUTO');
    setLastTaxSplit('CGST_SGST');
    expect(getLastTaxSplit()).toBe('CGST_SGST');
    window.localStorage.setItem('simple-bill-last-tax-split', 'BOGUS');
    expect(getLastTaxSplit()).toBe('AUTO');
  });
});
