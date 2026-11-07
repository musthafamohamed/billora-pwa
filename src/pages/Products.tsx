import { useState } from 'react';
import { useStore } from '../lib/store';
import { activeProductCount, canAddActiveProduct } from '../lib/calc';
import { planStarterAdditions, sortProductsForDisplay, starterIdFor, STARTER_PRODUCTS } from '../lib/starter';
import { inr } from '../lib/format';
import { nowISO, todayISO, uid, type Product } from '../lib/types';
import { btnPrimary, btnSecondary, EmptyState, Field, inputCls, Sheet } from '../components/ui';
import { Icon } from '../components/Icon';
import { MAX_ACTIVE_PRODUCTS } from '../lib/types';

const UNITS = ['Piece', 'Kg', 'Box', 'Service', 'Litre', 'Pack', 'Hour'];
const productActionCls = 'sb-btn-secondary inline-flex items-center justify-center gap-1.5 px-3 py-2';

export default function Products() {
  const { products, invoices, upsertProduct, deleteProduct } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [productMsg, setProductMsg] = useState('');
  const [starterMsg, setStarterMsg] = useState('');
  const sortedProducts = sortProductsForDisplay(products);

  const addStarter = async () => {
    const { toAdd, skipped } = planStarterAdditions(products, STARTER_PRODUCTS);
    for (const s of toAdd) {
      await upsertProduct({ id: starterIdFor(s.name), name: s.name, description: s.description, unit: s.unit, sellingPrice: s.sellingPrice, defaultTaxRate: s.defaultTaxRate, hsnSacCode: s.hsnSacCode, isActive: true, createdAt: nowISO(), updatedAt: nowISO() });
    }
    setStarterMsg(toAdd.length
      ? `${toAdd.length} PM Sons starter product(s) added${skipped.length ? `, ${skipped.length} skipped (${skipped.map((x) => x.skipReason).join(', ')})` : ''}.`
      : 'No starter products were added — they are already present or the 7-active-product limit is reached.');
  };
  const active = activeProductCount(products);
  const atLimit = active >= MAX_ACTIVE_PRODUCTS;

  const referenced = (id: string) => invoices.some((inv) => inv.lineItems.some((l) => l.productId === id));

  const openNew = () => { setEditing(null); setError(''); setShowForm(true); };
  const openEdit = (p: Product) => { setEditing(p); setError(''); setShowForm(true); };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const unit = String(fd.get('unit') || 'Piece');
    const price = Number(fd.get('price'));
    const tax = Number(fd.get('tax'));
    const isActive = fd.get('isActive') === 'on';
    if (!name) { setError('Product name is required.'); return; }
    if (!(price >= 0)) { setError('Price cannot be negative.'); return; }
    if (tax < 0 || tax > 100) { setError('Tax rate must be between 0 and 100.'); return; }
    // Add Product is never blocked: at the cap, a new product requested
    // as Active is saved as Inactive instead, so it can be activated
    // later after deactivating another product.
    let finalIsActive = isActive;
    let addedAsInactive = false;
    if (!editing && !canAddActiveProduct(active, isActive)) {
      finalIsActive = false;
      addedAsInactive = true;
    }
    if (editing && !editing.isActive && isActive && !canAddActiveProduct(active, true)) {
      setError(`You already have ${MAX_ACTIVE_PRODUCTS} active products. Deactivate one first.`);
      return;
    }
    const base: Product = editing ?? {
      id: uid(), createdAt: nowISO(), description: '', updatedAt: nowISO(),
      name: '', unit: 'Piece', sellingPrice: 0, defaultTaxRate: 0, hsnSacCode: '', isActive: true,
    };
    await upsertProduct({
      ...base, name, unit, sellingPrice: price, defaultTaxRate: tax,
      description: String(fd.get('description') || ''), hsnSacCode: String(fd.get('hsn') || ''),
      isActive: finalIsActive, updatedAt: nowISO(),
    });
    if (addedAsInactive) setProductMsg(`"${name}" was added as Inactive because ${MAX_ACTIVE_PRODUCTS} products are already active. Deactivate one product, then activate this one.`);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{active} of {MAX_ACTIVE_PRODUCTS} products active</p>
        </div>
        <button type="button" className={btnPrimary} onClick={openNew}>
          <Icon name="plus" /> Add Product
        </button>
      </header>
      {atLimit && (
        <div role="status" className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/40 p-3 text-sm text-amber-900 dark:text-amber-100">
          <p>{active}/{MAX_ACTIVE_PRODUCTS} active. New products will be inactive.</p>
          <details className="mt-1">
            <summary className="min-h-[44px] cursor-pointer content-center font-semibold">How to activate another product</summary>
            <p className="mt-1">Deactivate a product, then activate the one you want to use. Inactive products stay on old invoices but cannot be selected for new ones.</p>
          </details>
        </div>
      )}
      {productMsg && <p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-900/40 p-3 text-sm font-medium text-emerald-900 dark:text-emerald-100">{productMsg}</p>}
      {starterMsg && <p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-900/40 p-3 text-sm font-medium text-emerald-900 dark:text-emerald-100">{starterMsg}</p>}
      {products.length === 0 ? (
        <EmptyState title="No products yet" hint="Add up to 7 active products. They appear as quick picks when you create an invoice." action={<div className="flex flex-col items-center gap-3"><button type="button" className={btnPrimary} onClick={openNew}><Icon name="plus" /> Add first product</button><button type="button" className={btnSecondary} onClick={() => { void addStarter(); }}><Icon name="package" /> Add PM Sons starter products</button></div>} />
      ) : (
        <ul className="space-y-3">
          {sortedProducts.map((p) => (
            <li key={p.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold">{p.name} {!p.isActive && <span className="ml-1 rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Inactive</span>}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{p.unit} · GST {p.defaultTaxRate}%{p.hsnSacCode ? ` · HSN/SAC ${p.hsnSacCode}` : ''}</p>
                  {p.description && <p className="text-sm text-slate-600 dark:text-slate-400">{p.description}</p>}
                </div>
                <p className="shrink-0 whitespace-nowrap font-bold">{inr(p.sellingPrice)}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className={productActionCls} onClick={() => openEdit(p)}><Icon name="pencil" size={17} /> Edit</button>
                <button
                  type="button" className={`${productActionCls} disabled:opacity-50`}
                  onClick={() => upsertProduct({ ...p, isActive: !p.isActive, updatedAt: nowISO() })}
                  disabled={!p.isActive ? atLimit : false}
                >
                  <><Icon name={p.isActive ? 'pause' : 'play'} size={17} /> {p.isActive ? 'Deactivate' : 'Activate'}</>
                </button>
                {!referenced(p.id) && (
                  <details className="relative ml-auto">
                    <summary className={`${productActionCls} cursor-pointer list-none`} aria-label={`More actions for ${p.name}`}>
                      <span aria-hidden="true">⋯</span> More
                    </summary>
                    <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-xl border border-slate-200 bg-[var(--surface)] p-1 shadow-lg">
                      <button type="button" className="inline-flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300" onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        if (window.confirm(`Delete "${p.name}"? This cannot be undone.`)) void deleteProduct(p.id);
                      }}>
                        <Icon name="trash" size={17} /> Delete
                      </button>
                    </div>
                  </details>
                )}
              </div>
              {referenced(p.id) && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Used in an invoice — deactivate instead of deleting.</p>}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <Sheet title={editing ? 'Edit product' : 'Add product'} onClose={() => setShowForm(false)}>
          <form onSubmit={save} className="space-y-4">
            {error && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/40 p-3 text-sm font-medium text-red-800 dark:text-red-100">{error}</p>}
            {!editing && atLimit && (
              <p role="status" className="rounded-xl bg-amber-50 dark:bg-amber-900/40 p-3 text-sm text-amber-900 dark:text-amber-100">
                {MAX_ACTIVE_PRODUCTS} active products already — this product will be added as Inactive, or deactivate one first.
              </p>
            )}
            <Field label="Product name *"><input name="name" required defaultValue={editing?.name} className={inputCls} /></Field>
            <Field label="Description (optional)"><input name="description" defaultValue={editing?.description} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit">
                <select name="unit" defaultValue={editing?.unit ?? 'Piece'} className={inputCls}>
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Selling price (₹) *"><input name="price" type="number" min="0" step="0.01" required defaultValue={editing?.sellingPrice ?? ''} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default GST rate (%)"><input name="tax" type="number" min="0" max="100" step="0.01" defaultValue={editing?.defaultTaxRate ?? 18} className={inputCls} /></Field>
              <Field label="HSN / SAC code (optional)"><input name="hsn" defaultValue={editing?.hsnSacCode} className={inputCls} /></Field>
            </div>
            <label className="flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3">
              <input type="checkbox" name="isActive" defaultChecked={editing ? editing.isActive : true} className="h-5 w-5" />
              <span className="font-medium">Active (available for new invoices)</span>
            </label>
            <button type="submit" className={`${btnPrimary} w-full`}><Icon name="save" /> Save product</button>
            <p className="text-xs text-slate-500 dark:text-slate-400">Saved on {todayISO()}. Changing a product never changes an invoice already saved.</p>
          </form>
        </Sheet>
      )}
    </div>
  );
}
