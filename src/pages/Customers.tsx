import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { isValidGstin, nowISO, uid, type Customer } from '../lib/types';
import { btnPrimary, btnSecondary, EmptyState, Field, inputCls, Sheet } from '../components/ui';
import { Icon } from '../components/Icon';
import { fmtDate, inr } from '../lib/format';
import type { Route } from '../App';

export function CustomerForm({ initial, onSaved, onCancel }: {
  initial: Customer | null; onSaved: (c: Customer) => void; onCancel: () => void;
}) {
  const { customers } = useStore();
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const phone = String(fd.get('phone') || '').trim();
    const gstin = String(fd.get('gstin') || '').trim().toUpperCase();
    if (!name) { setError('Customer name is required.'); return; }
    // Phone is optional — only the name is required. The duplicate-phone
    // warning only runs when a phone number was actually supplied.
    if (!isValidGstin(gstin)) { setError('GSTIN format looks invalid. Leave it blank if you do not have one.'); return; }
    const dup = phone ? customers.find((c) => c.phone.replace(/\s/g, '') === phone.replace(/\s/g, '') && c.id !== initial?.id) : undefined;
    if (dup && !warning) { setWarning(`A customer with this phone number already exists: ${dup.name}. Tap Save again to add anyway.`); return; }
    const c: Customer = {
      id: initial?.id ?? uid(), name, phone,
      email: String(fd.get('email') || ''), billingAddress: String(fd.get('address') || ''),
      gstin, state: String(fd.get('state') || ''), notes: String(fd.get('notes') || ''),
      createdAt: initial?.createdAt ?? nowISO(), updatedAt: nowISO(),
    };
    onSaved(c);
  };
  return (
    <form onSubmit={save} className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/40 p-3 text-sm font-medium text-red-800 dark:text-red-100">{error}</p>}
      {warning && <p role="status" className="rounded-xl bg-amber-50 dark:bg-amber-900/40 p-3 text-sm font-medium text-amber-900 dark:text-amber-100">{warning}</p>}
      <Field label="Name *"><input name="name" required defaultValue={initial?.name} className={inputCls} autoFocus /></Field>
      <Field label="Phone (optional)"><input name="phone" inputMode="tel" defaultValue={initial?.phone} className={inputCls} /></Field>
      <Field label="Email (optional)"><input name="email" type="email" defaultValue={initial?.email} className={inputCls} /></Field>
      <Field label="Billing address (optional)"><textarea name="address" rows={2} defaultValue={initial?.billingAddress} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="GSTIN (optional)"><input name="gstin" defaultValue={initial?.gstin} className={inputCls} /></Field>
        <Field label="State (optional)"><input name="state" defaultValue={initial?.state} className={inputCls} /></Field>
      </div>
      <Field label="Notes (optional)"><textarea name="notes" rows={2} defaultValue={initial?.notes} className={inputCls} /></Field>
      <div className="flex gap-3">
        <button type="button" className={btnSecondary} onClick={onCancel}>Cancel</button>
        <button type="submit" className={`${btnPrimary} flex-1`}><Icon name="save" /> Save customer</button>
      </div>
    </form>
  );
}

export default function Customers({ navigate }: { navigate: (r: Route, id?: string) => void }) {
  const { customers, invoices, upsertCustomer } = useStore();
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s));
  }, [customers, q]);

  const summary = (id: string) => {
    const list = invoices.filter((i) => i.customerId === id && i.status === 'FINAL');
    return { count: list.length, total: list.reduce((s, i) => s + i.grandTotal, 0) };
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button type="button" className={btnPrimary} onClick={() => { setEditing(null); setShowForm(true); }}><Icon name="plus" /> Add Customer</button>
      </header>
      <label className="block">
        <span className="sr-only">Search customers by name or phone</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone…" className={inputCls} />
      </label>
      {filtered.length === 0 ? (
        <EmptyState title={customers.length ? 'No matching customers' : 'No customers yet'} hint="Add a customer here, or add one while creating an invoice." action={<button type="button" className={btnPrimary} onClick={() => setShowForm(true)}><Icon name="plus" /> Add customer</button>} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => {
            const s = summary(c.id);
            return (
              <li key={c.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <button type="button" className="w-full text-left" onClick={() => setDetail(c)}>
                  <p className="font-bold">{c.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{[c.phone, c.gstin ? `GSTIN ${c.gstin}` : ''].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {s.count ? `${s.count} final invoice${s.count > 1 ? 's' : ''} · ${inr(s.total)}` : 'No final invoices yet'}
                  </p>
                </button>
                <button type="button" className={`${btnSecondary} mt-3`} onClick={() => { setEditing(c); setShowForm(true); }}><Icon name="pencil" /> Edit</button>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <Sheet title={editing ? 'Edit customer' : 'Add customer'} onClose={() => setShowForm(false)}>
          <CustomerForm
            initial={editing}
            onCancel={() => setShowForm(false)}
            onSaved={async (c) => { await upsertCustomer(c); setShowForm(false); }}
          />
        </Sheet>
      )}

      {detail && (
        <Sheet title={detail.name} onClose={() => setDetail(null)}>
          <div className="space-y-2 text-base">
            {detail.phone && <p className="flex items-center gap-2"><Icon name="phone" /> {detail.phone}</p>}
            {detail.email && <p className="flex items-center gap-2"><Icon name="mail" /> {detail.email}</p>}
            {detail.billingAddress && <p className="flex items-center gap-2"><Icon name="mapPin" /> {detail.billingAddress}</p>}
            {detail.gstin && <p>GSTIN: {detail.gstin}</p>}
            {detail.state && <p>State: {detail.state}</p>}
            {detail.notes && <p className="text-slate-600 dark:text-slate-400">{detail.notes}</p>}
          </div>
          <h3 className="mt-5 text-lg font-bold">Invoice history</h3>
          <div className="mt-2 space-y-2">
            {invoices.filter((i) => i.customerId === detail.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((inv) => (
              <button key={inv.id} type="button" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-left" onClick={() => { setDetail(null); navigate('invoice-detail', inv.id); }}>
                <span className="font-semibold">{inv.invoiceNumber}</span>
                <span className="float-right font-semibold">{inr(inv.grandTotal)}</span>
                <span className="block text-sm text-slate-500 dark:text-slate-400">{fmtDate(inv.issueDate)} · {inv.status}</span>
              </button>
            ))}
            {!invoices.some((i) => i.customerId === detail.id) && <p className="text-sm text-slate-500 dark:text-slate-400">No invoices for this customer yet.</p>}
          </div>
          <button type="button" className={`${btnPrimary} mt-5 w-full`} onClick={() => { setDetail(null); navigate('invoice-new'); }}><Icon name="plus" /> Create invoice</button>
        </Sheet>
      )}
    </div>
  );
}
