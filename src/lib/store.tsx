import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { localRepository } from './data/dexieRepository';
import type { BillingRepository } from './data/repository';
import { buildBackup } from './backup';
import type { BusinessProfile, Customer, Invoice, Product } from './types';
import { emptyProfile, nowISO } from './types';
import { THEME_KEY, type Theme } from './theme';
import { planStarterAdditions, shouldSeedStarter, starterIdFor, STARTER_PRODUCTS } from './starter';

// In-memory guard so two concurrent reload() calls (e.g. StrictMode's
// double effect in dev) share one seeding run instead of each inserting
// a fresh copy of the starter catalogue (the old 7 → 14 duplication).
const seedingPromises = new WeakMap<BillingRepository, Promise<void>>();

export { THEME_KEY, type Theme } from './theme';

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

export function StoreProvider({ children, repository = localRepository }: { children: React.ReactNode; repository?: BillingRepository }) {
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
      repository.getProfile(),
      repository.listProducts(),
      repository.listCustomers(),
      repository.listInvoices(),
      repository.getMeta('welcomed'),
      repository.getMeta('theme'),
      repository.getMeta('starterSeeded'),
    ]);
    let prods = prods0;
    // PM Sons starter seeding: only on a completely empty database, never
    // overwriting user data, and never saving the business profile itself
    // (so the first-run Welcome screen still appears, pre-filled).
    if (shouldSeedStarter({ hasProfile: !!p, productCount: prods.length, customerCount: custs.length, invoiceCount: invs.length, starterSeeded: seededRow === '1' })) {
      let seedingPromise = seedingPromises.get(repository);
      if (!seedingPromise) {
        seedingPromise = (async () => {
          const { toAdd } = planStarterAdditions(await repository.listProducts(), STARTER_PRODUCTS);
          if (toAdd.length) {
            await Promise.all(toAdd.map((s) => repository.upsertProduct({
              id: starterIdFor(s.name), name: s.name, description: s.description, unit: s.unit,
              sellingPrice: s.sellingPrice, defaultTaxRate: s.defaultTaxRate,
              hsnSacCode: s.hsnSacCode, isActive: true, createdAt: nowISO(), updatedAt: nowISO(),
            })));
          }
          await repository.setMeta('starterSeeded', '1');
        })().finally(() => { seedingPromises.delete(repository); });
        seedingPromises.set(repository, seedingPromise);
      }
      await seedingPromise;
      prods = await repository.listProducts();
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
    setWelcomedState(w === '1');
    setLoaded(true);
  }, [repository]);

  useEffect(() => { reload().catch(() => setLoaded(true)); }, [reload]);

  const setTheme = useCallback(async (t: Theme) => {
    applyTheme(t);
    setThemeState(t);
    try { window.localStorage.setItem(THEME_KEY, t); } catch { /* storage may be unavailable */ }
    await repository.setMeta('theme', t);
  }, [repository]);

  const value = useMemo<Store>(() => ({
    loaded, theme, setTheme, profile, products, customers, invoices, welcomed, reload,
    saveProfileState: async (p) => { await repository.saveProfile(p); setProfile(p); },
    upsertProduct: async (p) => { await repository.upsertProduct(p); await reload(); },
    deleteProduct: async (id) => { await repository.deleteProduct(id); await reload(); },
    upsertCustomer: async (c) => { await repository.upsertCustomer(c); await reload(); return c; },
    upsertInvoice: async (inv) => {
      await repository.upsertInvoice(inv);
      await reload();
    },
    deleteInvoice: async (id) => { await repository.deleteInvoice(id); await reload(); },
    setWelcomed: async () => { await repository.setMeta('welcomed', '1'); setWelcomedState(true); },
    replaceAll: async (prof, prods, custs, invs) => {
      await repository.replaceAll(buildBackup(prof, prods, custs, invs));
      await reload();
    },
  }), [loaded, theme, setTheme, profile, products, customers, invoices, welcomed, reload, repository]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
