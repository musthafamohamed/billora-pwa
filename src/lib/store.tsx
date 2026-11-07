import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db, getMeta, getProfile, saveProfile, setMeta } from './db';
import type { BusinessProfile, Customer, Invoice, Product } from './types';
import { emptyProfile, nowISO } from './types';
import { assertInvoiceWrite } from './invoiceSaving';
import { planStarterAdditions, shouldSeedStarter, starterIdFor, STARTER_PRODUCTS } from './starter';

// In-memory guard so two concurrent reload() calls (e.g. StrictMode's
// double effect in dev) share one seeding run instead of each inserting
// a fresh copy of the starter catalogue (the old 7 → 14 duplication).
let seedingPromise: Promise<void> | null = null;
const normName = (s: string) => s.trim().toLowerCase();

export type Theme = 'light' | 'dark';
export const THEME_KEY = 'simple-bill-theme';

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}

interface Store {
  loaded: boolean;
  theme: Theme;
  setTheme: (t: Theme) => Promise<void>;
  profile: BusinessProfile;
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  welcomed: boolean;
  reload: () => Promise<void>;
  saveProfileState: (p: BusinessProfile) => Promise<void>;
  upsertProduct: (p: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  upsertCustomer: (c: Customer) => Promise<Customer>;
  upsertInvoice: (inv: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  setWelcomed: () => Promise<void>;
  replaceAll: (profile: BusinessProfile | null, products: Product[], customers: Customer[], invoices: Invoice[]) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store not available');
  return s;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile>(emptyProfile());
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [welcomed, setWelcomedState] = useState(false);
  const [theme, setThemeState] = useState<Theme>(() =>
    (typeof window !== 'undefined' && window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'));

  const reload = useCallback(async () => {
    const [p, prods0, custs, invs, w, themeRow, seededRow] = await Promise.all([
      getProfile(),
      db.products.orderBy('createdAt').toArray(),
      db.customers.orderBy('createdAt').toArray(),
      db.invoices.orderBy('issueDate').reverse().toArray(),
      db.meta.get('welcomed'),
      getMeta('theme'),
      getMeta('starterSeeded'),
    ]);
    let prods = prods0;
    // Heal a catalogue that was duplicated by the old concurrent-seeding
    // race (14 products = the same 7 starter names twice): for starter
    // names only, keep the first copy and delete the rest. Non-starter
    // duplicates are left alone — they may be intentional.
    {
      const starterNames = new Set(STARTER_PRODUCTS.map((s) => normName(s.name)));
      const seen = new Set<string>();
      const dupIds: string[] = [];
      for (const prod of prods) {
        const n = normName(prod.name);
        if (!starterNames.has(n)) continue;
        if (seen.has(n)) dupIds.push(prod.id);
        else seen.add(n);
      }
      if (dupIds.length) {
        await db.products.bulkDelete(dupIds);
        prods = prods.filter((prod) => !dupIds.includes(prod.id));
      }
    }
    // PM Sons starter seeding: only on a completely empty database, never
    // overwriting user data, and never saving the business profile itself
    // (so the first-run Welcome screen still appears, pre-filled).
    if (shouldSeedStarter({ hasProfile: !!p, productCount: prods.length, customerCount: custs.length, invoiceCount: invs.length, starterSeeded: seededRow === '1' })) {
      if (!seedingPromise) {
        seedingPromise = (async () => {
          const { toAdd } = planStarterAdditions(await db.products.orderBy('createdAt').toArray(), STARTER_PRODUCTS);
          if (toAdd.length) {
            await db.products.bulkPut(toAdd.map((s) => ({
              id: starterIdFor(s.name), name: s.name, description: s.description, unit: s.unit,
              sellingPrice: s.sellingPrice, defaultTaxRate: s.defaultTaxRate,
              hsnSacCode: s.hsnSacCode, isActive: true, createdAt: nowISO(), updatedAt: nowISO(),
            })));
          }
          await setMeta('starterSeeded', '1');
        })().finally(() => { seedingPromise = null; });
      }
      await seedingPromise;
      prods = await db.products.orderBy('createdAt').toArray();
    }
    // Theme: localStorage wins for first paint (index.html already applied
    // it); the IndexedDB value reconciles only when localStorage is unset.
    const stored = window.localStorage.getItem(THEME_KEY);
    const resolved: Theme = stored === 'dark' || stored === 'light' ? stored : (themeRow === 'dark' ? 'dark' : 'light');
    applyTheme(resolved);
    setThemeState(resolved);
    setProfile(p ?? emptyProfile());
    setProducts(prods);
    setCustomers(custs);
    setInvoices(invs);
    setWelcomedState(w?.value === '1');
    setLoaded(true);
  }, []);

  useEffect(() => { reload().catch(() => setLoaded(true)); }, [reload]);

  const setTheme = useCallback(async (t: Theme) => {
    applyTheme(t);
    setThemeState(t);
    try { window.localStorage.setItem(THEME_KEY, t); } catch { /* storage may be unavailable */ }
    await setMeta('theme', t);
  }, []);

  const value = useMemo<Store>(() => ({
    loaded, theme, setTheme, profile, products, customers, invoices, welcomed, reload,
    saveProfileState: async (p) => { await saveProfile(p); setProfile(p); },
    upsertProduct: async (p) => { await db.products.put(p); await reload(); },
    deleteProduct: async (id) => { await db.products.delete(id); await reload(); },
    upsertCustomer: async (c) => { await db.customers.put(c); await reload(); return c; },
    upsertInvoice: async (inv) => {
      // Read/check/write atomically: a stale editor in another tab must never
      // downgrade a final/cancelled invoice after its own autosave delay.
      await db.transaction('rw', db.invoices, async () => {
        assertInvoiceWrite(await db.invoices.get(inv.id), inv);
        await db.invoices.put(inv);
      });
      await reload();
    },
    deleteInvoice: async (id) => { await db.invoices.delete(id); await reload(); },
    setWelcomed: async () => { await db.meta.put({ key: 'welcomed', value: '1' }); setWelcomedState(true); },
    replaceAll: async (prof, prods, custs, invs) => {
      await db.transaction('rw', [db.products, db.customers, db.invoices, db.meta], async () => {
        await db.products.clear(); await db.customers.clear(); await db.invoices.clear();
        await db.products.bulkPut(prods); await db.customers.bulkPut(custs); await db.invoices.bulkPut(invs);
        if (prof) await saveProfile(prof); else await db.meta.delete('profile');
      });
      await reload();
    },
  }), [loaded, theme, setTheme, profile, products, customers, invoices, welcomed, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
