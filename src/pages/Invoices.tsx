import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { fmtDate, inr } from '../lib/format';
import { StatusBadge, EmptyState } from '../components/ui';
import type { Route } from '../App';
import type { InvoiceStatus, InvoiceType } from '../lib/types';

export default function Invoices({ navigate }: { navigate: (r: Route, id?: string) => void }) {
  const { invoices } = useStore();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'ALL' | InvoiceType>('ALL');
  const [status, setStatus] = useState<'ALL' | InvoiceStatus>('ALL');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return invoices
      .filter((i) => (type === 'ALL' || i.invoiceType === type) && (status === 'ALL' || i.status === status))
      .filter((i) => !s || i.invoiceNumber.toLowerCase().includes(s) || i.customerSnapshot.name.toLowerCase().includes(s))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [invoices, q, type, status]);

  const chip = (active: boolean) => `min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold ${active ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Invoices</h1>
      <label className="block">
        <span className="sr-only">Search invoices by number or customer</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice number or customer…" className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-base" />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by invoice type">
        {(['ALL', 'TAX', 'NON_TAX'] as const).map((t) => (
          <button key={t} type="button" className={chip(type === t)} onClick={() => setType(t)}>{t === 'ALL' ? 'All types' : t === 'TAX' ? 'Tax' : 'Non-Tax'}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(['ALL', 'DRAFT', 'FINAL', 'CANCELLED'] as const).map((s) => (
          <button key={s} type="button" className={chip(status === s)} onClick={() => setStatus(s)}>{s === 'ALL' ? 'All statuses' : s[0] + s.slice(1).toLowerCase()}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No invoices found" hint="Try a different search or filter, or create your first invoice." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((inv) => (
            <li key={inv.id}>
              <button type="button" onClick={() => navigate('invoice-detail', inv.id)} className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{inv.invoiceNumber}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{inv.customerSnapshot.name} · {fmtDate(inv.issueDate)} · {inv.invoiceType === 'TAX' ? 'Tax Invoice' : 'Bill (without tax)'}</p>
                <p className="mt-1 text-lg font-bold">{inr(inv.grandTotal)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
