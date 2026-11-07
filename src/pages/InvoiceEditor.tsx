import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { calcInvoice, validateForFinalize, validateInvoiceDraft, type DraftLine } from '../lib/calc';
import { getLastTaxSplit, setLastTaxSplit } from '../lib/lastTaxSplit';
import { isSystemNote } from '../lib/systemNote';
import { nextInvoiceNumber } from '../lib/invoiceNumber';
import { fmtDate, inr } from '../lib/format';
import {
  businessSnapshotOf, customerSnapshotOf, nowISO, todayISO, uid,
  type Customer, type Invoice, type InvoiceLineItem, type TaxSplit,
} from '../lib/types';
import { btnPrimary, btnSecondary, ConfirmDialog, Field, inputCls, Sheet } from '../components/ui';
import { Icon } from '../components/Icon';
import { sortProductsForDisplay } from '../lib/starter';
import { CustomerForm } from './Customers';
import type { Route } from '../App';

interface EditorLine extends DraftLine { id: string; hsnSacCode?: string }

function lineFromProduct(p: { id: string; name: string; description: string; unit: string; sellingPrice: number; defaultTaxRate: number; hsnSacCode?: string }): EditorLine {
  // A product's system-note description ("Price is dynamic…") is a
  // Products-screen instruction — never copy it into an invoice line,
  // or it prints on the invoice PDF next to the product name.
  return { id: uid(), productId: p.id, productName: p.name, description: isSystemNote(p.description) ? '' : p.description, unit: p.unit, quantity: 1, unitPrice: p.sellingPrice, discountType: 'NONE', discountValue: 0, taxRate: p.defaultTaxRate, hsnSacCode: p.hsnSacCode ?? '' };
}

// Tapping a number field selects all its text (focus + click fallback for
// mobile browsers), so a leftover 0 can be replaced in one keystroke.
const selectAll = (e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>) => e.currentTarget.select();

export default function InvoiceEditor({ id, navigate }: { id?: string; navigate: (r: Route, id?: string) => void }) {
  const { profile, customers, products, invoices, upsertInvoice, upsertCustomer } = useStore();
  const existing = id ? invoices.find((i) => i.id === id) : undefined;

  const [invoiceId] = useState(() => existing?.id ?? uid());
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceType, setInvoiceType] = useState<'TAX' | 'NON_TAX'>(existing?.invoiceType ?? 'TAX');
  const [issueDate, setIssueDate] = useState(existing?.issueDate ?? todayISO());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [customerId, setCustomerId] = useState(existing?.customerId ?? '');
  const [lines, setLines] = useState<EditorLine[]>(() =>
    existing ? existing.lineItems.map((l) => ({ ...l })) : [],
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [terms, setTerms] = useState(existing?.termsAndConditions ?? profile.termsAndConditions);
  // Invoice-level additional charge (Rent by default, editable label).
  const [chargeLabel, setChargeLabel] = useState(existing?.additionalChargeLabel ?? 'Rent');
  const [chargeAmount, setChargeAmount] = useState(existing?.additionalChargeAmount ?? 0);
  // Tax-split override, TAX invoices only; AUTO = state-based default.
  // New invoices start with the last split the operator chose (kept in
  // localStorage); editing an existing invoice always starts from that
  // invoice's own stored split, never from the remembered one.
  const [taxSplit, setTaxSplit] = useState<TaxSplit>(existing?.taxSplit ?? getLastTaxSplit());
  const onTaxSplitChange = (v: TaxSplit) => {
    setTaxSplit(v);
    setLastTaxSplit(v); // remembered immediately, even if this draft is discarded
  };
  const [errors, setErrors] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState('');
  const [showCustomers, setShowCustomers] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [showProducts, setShowProducts] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [confirmZero, setConfirmZero] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assign a deterministic number once (new drafts), or repair a
  // duplicated draft's number (e.g. a -COPY) so numbers stay unique.
  useEffect(() => {
    if (existing) {
      const collides = invoices.some((i) => i.id !== existing.id && i.invoiceNumber === existing.invoiceNumber);
      if (collides || existing.invoiceNumber.endsWith('-COPY')) {
        setInvoiceNumber(nextInvoiceNumber(invoices.map((i) => i.invoiceNumber), profile.invoicePrefix || 'INV', new Date(existing.issueDate).getFullYear()));
      } else {
        setInvoiceNumber(existing.invoiceNumber);
      }
    } else {
      setInvoiceNumber((prev) => prev || nextInvoiceNumber(invoices.map((i) => i.invoiceNumber), profile.invoicePrefix || 'INV', new Date().getFullYear()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const totals = useMemo(
    () => calcInvoice(lines, invoiceType, profile.state, customer?.state ?? '',
      { taxSplit: invoiceType === 'TAX' ? taxSplit : 'AUTO', additionalChargeAmount: chargeAmount }),
    [lines, invoiceType, profile.state, customer, taxSplit, chargeAmount],
  );

  const buildInvoice = (status: 'DRAFT' | 'FINAL'): Invoice | null => {
    if (!customer) return null;
    const items: InvoiceLineItem[] = totals.lines.map((l) => ({
      id: l.id, productId: l.productId ?? '', productName: l.productName, hsnSacCode: l.hsnSacCode ?? '', description: l.description ?? '',
      unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, discountType: l.discountType,
      discountValue: l.discountValue, taxRate: invoiceType === 'TAX' ? l.taxRate : 0,
      lineSubtotal: l.lineSubtotal, lineDiscount: l.lineDiscount, lineTaxable: l.lineTaxable,
      lineTax: l.lineTax, lineTotal: l.lineTotal,
    }));
    return {
      id: invoiceId, invoiceNumber, invoiceType, status, issueDate, dueDate, customerId: customer.id,
      customerSnapshot: customerSnapshotOf(customer), businessSnapshot: businessSnapshotOf(profile),
      lineItems: items, subtotal: totals.subtotal, discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount, taxBreakdown: totals.taxBreakdown, totalTax: totals.totalTax,
      additionalChargeLabel: chargeLabel.trim(), additionalChargeAmount: totals.additionalChargeAmount,
      taxSplit: invoiceType === 'TAX' ? taxSplit : 'AUTO',
      grandTotal: totals.grandTotal, notes, termsAndConditions: terms,
      createdAt: existing?.createdAt ?? nowISO(), updatedAt: nowISO(),
    };
  };

  // Autosave drafts (never autosaves a FINAL invoice).
  useEffect(() => {
    if (existing && existing.status !== 'DRAFT') return;
    if (!invoiceNumber || !customerId || lines.length === 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const inv = buildInvoice('DRAFT');
      if (inv) { await upsertInvoice(inv); setSavedOnce(true); setSavedAt(new Date().toLocaleTimeString('en-IN')); }
    }, 900);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, lines, notes, terms, invoiceType, issueDate, dueDate, invoiceNumber, chargeLabel, chargeAmount, taxSplit]);

  if (existing && existing.status !== 'DRAFT') {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          This invoice is <strong>{existing.status.toLowerCase()}</strong> and cannot be edited.
          Duplicate it from the invoice view to make a corrected copy.
        </p>
        <button type="button" className={btnPrimary} onClick={() => navigate('invoice-detail', existing.id)}>View invoice</button>
      </div>
    );
  }

  const saveDraft = async () => {
    const errs = validateInvoiceDraft(customerId, lines);
    if (errs.length) { setErrors(errs); return; }
    const inv = buildInvoice('DRAFT');
    if (!inv) return;
    await upsertInvoice(inv);
    setSavedOnce(true);
    setErrors([]);
    navigate('invoices');
  };

  const finalize = async () => {
    // Finalize is stricter than Save Draft: a line with quantity or
    // price 0 (a price never entered) must not become a final invoice.
    // Drafts may still be saved incomplete.
    const errs = validateForFinalize(customerId, lines);
    if (errs.length) { setErrors(errs); return; }
    if (totals.grandTotal === 0) { setConfirmZero(true); return; }
    await doFinalize();
  };
  const doFinalize = async () => {
    const inv = buildInvoice('FINAL');
    if (!inv) return;
    await upsertInvoice(inv);
    navigate('invoice-detail', inv.id);
  };

  const updateLine = (lineId: string, patch: Partial<EditorLine>) => {
    // Switching a line's discount off clears its amount immediately, so a
    // stale Discount ₹ value is never left behind to reappear later.
    const effective = patch.discountType === 'NONE' ? { ...patch, discountValue: 0 } : patch;
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...effective } : l)));
  };

  const activeProducts = sortProductsForDisplay(products.filter((p) => p.isActive));
  const customerMatches = customers.filter((c) => {
    const s = customerQuery.trim().toLowerCase();
    return !s || c.name.toLowerCase().includes(s) || c.phone.includes(s);
  });
  const productMatches = activeProducts.filter((p) => {
    const s = productQuery.trim().toLowerCase();
    return !s || p.name.toLowerCase().includes(s);
  });

  // Adding a customer from the invoice screen: the editor's state
  // (lines, dates, notes, type) lives in this component, so it is
  // untouched; only the customer selection changes.
  const onCustomerSaved = async (c: Customer) => {
    await upsertCustomer(c);
    setCustomerId(c.id);
    setShowAddCustomer(false);
    setShowCustomers(false);
  };

  return (
    <div className="space-y-4 pb-2">
      <header className="flex items-center justify-between gap-2">
        <button type="button" className="inline-flex min-h-[44px] items-center gap-1 px-2 font-semibold text-teal-700 dark:text-teal-300" onClick={() => navigate('invoices')}><Icon name="chevronLeft" /> Back</button>
        <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-semibold text-amber-900 dark:text-amber-100">● Draft{savedOnce && savedAt ? ` · Autosaved ${savedAt}` : ''}</span>
        <button type="button" className={btnSecondary} onClick={saveDraft}>Save draft</button>
      </header>

      {errors.length > 0 && (
        <div role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/40 p-3 text-sm font-medium text-red-800 dark:text-red-100">
          {errors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}

      <div role="group" aria-label="Invoice type" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5">
        {(['TAX', 'NON_TAX'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setInvoiceType(t)} aria-pressed={invoiceType === t}
            className={`min-h-[44px] rounded-xl text-base font-semibold ${invoiceType === t
              ? (t === 'TAX' ? 'bg-teal-700 text-white' : 'bg-amber-400 text-slate-900')
              : 'text-slate-700 dark:text-slate-200'}`}>
            {t === 'TAX' ? 'Tax Invoice' : 'Without Tax'}
          </button>
        ))}
      </div>
      <p role="status" className={`text-sm font-semibold ${invoiceType === 'TAX' ? 'text-teal-700 dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}`}>
        {invoiceType === 'TAX' ? '● Tax Invoice — GST will be added (CGST + SGST, or IGST).' : '● Bill without tax — no GST will be added.'}
      </p>

      {invoiceType === 'TAX' && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <Field label="Tax split — how GST is shown">
            <select value={taxSplit} onChange={(e) => onTaxSplitChange(e.target.value as TaxSplit)} className={inputCls}>
              <option value="AUTO">Auto — from business &amp; customer states</option>
              <option value="CGST_SGST">CGST + SGST (separate rows)</option>
              <option value="IGST">IGST</option>
              <option value="GST">Combined GST (one row)</option>
            </select>
          </Field>
          {taxSplit === 'CGST_SGST' && <p className="mt-2 text-sm font-semibold text-teal-700 dark:text-teal-300">CGST + SGST shown separately, as selected.</p>}
          {taxSplit === 'AUTO' && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Auto: same state → CGST + SGST, different states → IGST, missing state → one combined GST line. Use CGST + SGST above to force the separate rows even when a state is missing.</p>}
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Remembered for new invoices — change it here and the next new invoice will start with this choice.</p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Invoice number</p>
        <p className="text-lg font-bold">{invoiceNumber || '…'}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Date *"><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Due date (optional)"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} /></Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="font-bold">Customer *</h2>
        {customer ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <div><p className="font-semibold">{customer.name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{[customer.phone, customer.state].filter(Boolean).join(' · ')}</p></div>
            <button type="button" className={btnSecondary} onClick={() => setShowCustomers(true)}>Change</button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No customer selected yet.</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={btnSecondary} onClick={() => setShowCustomers(true)}><Icon name="search" /> Select customer</button>
          <button type="button" className={btnSecondary} onClick={() => setShowAddCustomer(true)}><Icon name="plus" /> Add new customer</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Items</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">{lines.length} item{lines.length === 1 ? '' : 's'}</span>
        </div>
        {lines.length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-center text-sm text-slate-500 dark:text-slate-400">No items yet. Add a product from your catalogue, or add a one-off item.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {lines.map((l) => (
              <li key={l.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{l.productName}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{l.unit} · {inr(l.unitPrice)} each</p>
                  </div>
                  <button type="button" aria-label={`Remove ${l.productName}`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300" onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}><Icon name="x" /></button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" aria-label="Decrease quantity" className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-300 dark:border-slate-600 text-xl" onClick={() => updateLine(l.id, { quantity: Math.max(0.01, Number((l.quantity - 1).toFixed(2))) })}>−</button>
                  <label className="flex-1"><span className="sr-only">Quantity for {l.productName}</span>
                    <input type="number" min="0" step="0.01" value={l.quantity} onFocus={selectAll} onClick={selectAll} onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })} className={inputCls} /></label>
                  <button type="button" aria-label="Increase quantity" className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-300 dark:border-slate-600 text-xl" onClick={() => updateLine(l.id, { quantity: Number((l.quantity + 1).toFixed(2)) })}>+</button>
                </div>
                {!(l.quantity > 0) && <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">Quantity not entered — enter a quantity before finalizing.</p>}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Price (₹)"><input type="number" min="0" step="0.01" value={l.unitPrice} onFocus={selectAll} onClick={selectAll} onChange={(e) => updateLine(l.id, { unitPrice: Number(e.target.value) })} className={inputCls} /></Field>
                  {invoiceType === 'TAX' && (
                    <Field label="GST rate (%)"><input type="number" min="0" max="100" step="0.01" value={l.taxRate} onChange={(e) => updateLine(l.id, { taxRate: Number(e.target.value) })} className={inputCls} /></Field>
                  )}
                </div>
                {!(l.unitPrice > 0) && <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">Price not entered — enter a price before finalizing.</p>}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Discount type">
                    <select value={l.discountType} onChange={(e) => updateLine(l.id, { discountType: e.target.value as EditorLine['discountType'] })} className={inputCls}>
                      <option value="NONE">No discount</option><option value="PERCENTAGE">Percent %</option><option value="FIXED">Fixed ₹</option>
                    </select>
                  </Field>
                  <Field label={l.discountType === 'PERCENTAGE' ? 'Discount %' : 'Discount ₹'}>
                    <input type="number" min="0" step="0.01" disabled={l.discountType === 'NONE'} value={l.discountValue} onFocus={selectAll} onClick={selectAll} onChange={(e) => updateLine(l.id, { discountValue: Number(e.target.value) })} className={inputCls} />
                  </Field>
                </div>
                <p className="mt-2 text-right text-sm font-semibold">Line total: {inr(calcInvoice([l], invoiceType, profile.state, customer?.state ?? '').grandTotal)}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={btnSecondary} onClick={() => setShowProducts(true)}><Icon name="package" /> Add product</button>
          <button type="button" className={btnSecondary} onClick={() => setShowCustom(true)}><Icon name="pencil" /> Custom item</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h2 className="font-bold">Additional charges</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Added to the grand total after tax (tax invoices) or after discounts (bills without tax). Leave the amount at 0 to skip it.</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Charge label"><input value={chargeLabel} onChange={(e) => setChargeLabel(e.target.value)} placeholder="Rent" className={inputCls} /></Field>
          <Field label="Amount (₹)"><input type="number" min="0" step="0.01" value={chargeAmount} onFocus={selectAll} onClick={selectAll} onChange={(e) => setChargeAmount(Math.max(0, Number(e.target.value)))} className={inputCls} /></Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <Field label="Notes (optional)"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field>
        <Field label="Terms & conditions (optional)"><textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} className={inputCls} /></Field>
      </section>

      {/* Totals in normal flow at the end of the form (never sticky or
          floating): accent follows the invoice type — teal for Tax
          Invoice, amber for Without Tax (labels stay, colour is never
          the only signal). */}
      <section className={`rounded-2xl border bg-white dark:bg-slate-900 p-4 ${invoiceType === 'TAX' ? 'border-teal-200 dark:border-teal-800' : 'border-amber-300 dark:border-amber-700'}`}>
        <p className={`text-sm font-semibold ${invoiceType === 'TAX' ? 'text-teal-700 dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}`}>
          {invoiceType === 'TAX' ? 'Tax Invoice' : 'Bill — Without Tax'}
        </p>
        <dl className="mt-1 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(totals.subtotal)}</dd></div>
          {totals.discountAmount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>− {inr(totals.discountAmount)}</dd></div>}
          {invoiceType === 'TAX' && (
            <>
              <div className="flex justify-between"><dt>Taxable Value</dt><dd>{inr(totals.taxableAmount)}</dd></div>
              {totals.taxBreakdown.kind === 'CGST_SGST' && (<>
                <div className="flex justify-between"><dt>CGST</dt><dd>{inr(totals.taxBreakdown.cgst)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd>{inr(totals.taxBreakdown.sgst)}</dd></div>
              </>)}
              {totals.taxBreakdown.kind === 'IGST' && <div className="flex justify-between"><dt>IGST</dt><dd>{inr(totals.taxBreakdown.igst)}</dd></div>}
              {totals.taxBreakdown.kind === 'GST' && <div className="flex justify-between"><dt>GST</dt><dd>{inr(totals.taxBreakdown.gst)}</dd></div>}
            </>
          )}
          {totals.additionalChargeAmount > 0 && <div className="flex justify-between"><dt>{chargeLabel.trim() || 'Additional charge'}</dt><dd>{inr(totals.additionalChargeAmount)}</dd></div>}
          <div className="flex justify-between border-t pt-2 text-lg font-bold"><dt>Grand Total</dt><dd>{inr(totals.grandTotal)}</dd></div>
        </dl>
        {invoiceType === 'TAX' && totals.taxBreakdown.kind === 'GST' && totals.totalTax > 0 && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">State is missing for the business or the customer, so tax is shown as one combined GST amount.</p>
        )}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Totals are calculated from the items above. {fmtDate(issueDate)}</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btnSecondary} onClick={saveDraft}><Icon name="save" /> Save Draft</button>
        <button type="button" className={btnPrimary} onClick={finalize}><Icon name="check" /> Finalize Invoice</button>
      </div>

      {showCustomers && (
        <Sheet title="Select customer" onClose={() => setShowCustomers(false)}>
          <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Search by name or phone…" className={inputCls} />
          <ul className="mt-3 space-y-2">
            {customerMatches.map((c) => (
              <li key={c.id}><button type="button" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-left" onClick={() => { setCustomerId(c.id); setShowCustomers(false); }}>
                <span className="font-semibold">{c.name}</span><span className="block text-sm text-slate-500 dark:text-slate-400">{[c.phone, c.state].filter(Boolean).join(' · ')}</span>
              </button></li>
            ))}
            {customerMatches.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">No matching customers.</li>}
          </ul>
          <button type="button" className={`${btnPrimary} mt-4 w-full`} onClick={() => { setShowCustomers(false); setShowAddCustomer(true); }}><Icon name="plus" /> Add new customer</button>
        </Sheet>
      )}

      {showAddCustomer && (
        <Sheet title="Add new customer" onClose={() => setShowAddCustomer(false)}>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">After saving, this customer is selected automatically and your invoice draft stays exactly as it is.</p>
          <CustomerForm initial={null} onCancel={() => setShowAddCustomer(false)} onSaved={onCustomerSaved} />
        </Sheet>
      )}

      {showProducts && (
        <Sheet title="Add product" onClose={() => setShowProducts(false)}>
          <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search products…" className={inputCls} />
          <ul className="mt-3 space-y-2">
            {productMatches.map((p) => (
              <li key={p.id}><button type="button" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-left" onClick={() => { setLines((prev) => [...prev, lineFromProduct(p)]); setShowProducts(false); }}>
                <span className="font-semibold">{p.name}</span><span className="float-right font-semibold">{inr(p.sellingPrice)}</span>
                <span className="block text-sm text-slate-500 dark:text-slate-400">{p.unit} · GST {p.defaultTaxRate}%{p.hsnSacCode ? ` · HSN ${p.hsnSacCode}` : ''}</span>
              </button></li>
            ))}
            {productMatches.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">No active products match. Add one from the Products tab, or use a custom item.</li>}
          </ul>
        </Sheet>
      )}

      {showCustom && (
        <Sheet title="Custom one-off item" onClose={() => setShowCustom(false)}>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">This item is only for this invoice. It is not added to your 7-product catalogue.</p>
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setLines((prev) => [...prev, {
              id: uid(), productId: '', productName: String(fd.get('name') || '').trim(),
              description: '', unit: String(fd.get('unit') || 'Piece'),
              quantity: Number(fd.get('qty') || 1), unitPrice: Number(fd.get('price') || 0),
              discountType: 'NONE', discountValue: 0, taxRate: profile.defaultTaxRate,
              hsnSacCode: String(fd.get('hsn') || ''),
            }]);
            setShowCustom(false);
          }}>
            <Field label="Item name *"><input name="name" required className={inputCls} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Unit"><input name="unit" defaultValue="Piece" className={inputCls} /></Field>
              <Field label="Qty"><input name="qty" type="number" min="0" step="0.01" defaultValue={1} onFocus={selectAll} onClick={selectAll} className={inputCls} /></Field>
              <Field label="Price (₹)"><input name="price" type="number" min="0" step="0.01" required onFocus={selectAll} onClick={selectAll} className={inputCls} /></Field>
            </div>
            <Field label="HSN / SAC (optional)"><input name="hsn" className={inputCls} /></Field>
            <button type="submit" className={`${btnPrimary} w-full`}>Add item</button>
          </form>
        </Sheet>
      )}

      {confirmZero && (
        <ConfirmDialog
          title="Finalize a zero-total invoice?"
          message="The grand total is ₹0.00. Are you sure you want to finalize this invoice?"
          confirmLabel="Yes, finalize"
          danger={false}
          onCancel={() => setConfirmZero(false)}
          onConfirm={async () => { setConfirmZero(false); await doFinalize(); }}
        />
      )}
    </div>
  );
}
