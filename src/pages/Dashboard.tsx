import { useStore } from '../lib/store';
import { fmtDate, inr, monthKey } from '../lib/format';
import { todayISO } from '../lib/types';
import { btnPrimary, btnSecondary, EmptyState, InstallCard, Money, StatusBadge } from '../components/ui';
import { Icon } from '../components/Icon';
import type { Route } from '../App';

export default function Dashboard({ navigate }: { navigate: (r: Route, id?: string) => void }) {
  const { profile, invoices } = useStore();
  const mk = monthKey(todayISO());
  const finals = invoices.filter((i) => i.status === 'FINAL');
  const monthInvoices = finals.filter((i) => monthKey(i.issueDate) === mk);
  const monthTotal = monthInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const outstanding = finals.filter((i) => i.dueDate).reduce((s, i) => s + i.grandTotal, 0);
  const hasOutstanding = finals.some((i) => i.dueDate);
  const recent = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const name = profile.businessName || 'Simple Bill';

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-slate-500 dark:text-slate-400">Welcome back</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{name}</h1>
        {profile.phone && <p className="text-sm text-slate-500 dark:text-slate-400">{profile.phone}</p>}
      </header>

      <button type="button" className={`${btnPrimary} w-full text-lg`} onClick={() => navigate('invoice-new')}>
        <Icon name="plus" /> Create Invoice
      </button>

      {invoices.length === 0 ? (
        <>
          <EmptyState
            title="No invoices yet"
            hint="Set up your business profile, add a product, then create your first invoice. It only takes a minute."
            action={<button type="button" className={btnPrimary} onClick={() => navigate('settings')}>Set up business profile</button>}
          />
          <InstallCard />
        </>
      ) : (
        <>
          <section aria-label="This month summary" className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">This month total</p>
              <p className="mt-1 text-xl font-bold"><Money value={monthTotal} /></p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">This month invoices</p>
              <p className="mt-1 text-xl font-bold">{monthInvoices.length}</p>
            </div>
            {hasOutstanding && (
              <div className="col-span-2 rounded-2xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/40 p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">Outstanding — final invoices with a due date</p>
                <p className="mt-1 text-xl font-bold text-amber-900 dark:text-amber-100">{inr(outstanding)}</p>
              </div>
            )}
          </section>

          <section aria-label="Quick actions" className="grid grid-cols-3 gap-3">
            <button type="button" className={btnSecondary} onClick={() => navigate('invoice-new')}><Icon name="plus" /> Invoice</button>
            <button type="button" className={btnSecondary} onClick={() => navigate('customers')}><Icon name="users" /> Customer</button>
            <button type="button" className={btnSecondary} onClick={() => navigate('products')}><Icon name="package" /> Product</button>
          </section>

          <section aria-label="Recent invoices">
            <h2 className="mb-2 text-lg font-bold">Recent invoices</h2>
            <div className="space-y-3">
              {recent.map((inv) => (
                <button key={inv.id} type="button" onClick={() => navigate('invoice-detail', inv.id)} className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{inv.invoiceNumber}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{inv.customerSnapshot.name} · {fmtDate(inv.issueDate)}</p>
                  <p className="mt-1 font-semibold"><Money value={inv.grandTotal} /></p>
                </button>
              ))}
            </div>
            <button type="button" className="mt-3 w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-semibold" onClick={() => navigate('invoices')}>View all invoices →</button>
          </section>
        </>
      )}
    </div>
  );
}
