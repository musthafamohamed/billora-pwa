import { useState } from 'react';
import { useStore } from '../lib/store';
import { PM_SONS_PROFILE } from '../lib/starter';
import { btnPrimary, btnSecondary, Field, inputCls } from '../components/ui';
import type { Route } from '../App';

export default function Welcome({ navigate }: { navigate: (r: Route) => void }) {
  const { saveProfileState, setWelcomed } = useStore();
  // Pre-filled with the PM Sons Enterprises details from the user's own
  // invoices — editable before saving, or skipped entirely.
  const [form, setForm] = useState({ ...PM_SONS_PROFILE });
  const [err, setErr] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessName.trim()) { setErr('Business name is needed to start. Everything else can be added later in Settings.'); return; }
    await saveProfileState(form);
    await setWelcomed();
    navigate('home');
  };
  const skip = async () => { await setWelcomed(); navigate('home'); };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Welcome to Simple Bill</h1>
        <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
          Create tax invoices and bills on your phone, offline. Your data stays on this device.
          Add your business details now, or skip and explore first — nothing is forced.
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          PM Sons Enterprises details are pre-filled below from your invoices — edit them or skip.
        </p>
      </header>
      <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        {err && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/40 p-3 text-sm font-medium text-red-800 dark:text-red-100">{err}</p>}
        <Field label="Business name *"><input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className={inputCls} autoFocus /></Field>
        <Field label="Phone (optional)"><input value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
        <Field label="GSTIN (optional)"><input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} className={inputCls} /></Field>
        <Field label="Address (optional)"><textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="State (optional)"><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputCls} /></Field>
          <Field label="State code (optional)"><input value={form.stateCode} onChange={(e) => setForm({ ...form, stateCode: e.target.value })} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice prefix"><input value={form.invoicePrefix} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })} className={inputCls} /></Field>
          <Field label="Default GST rate % (optional)"><input type="number" min="0" max="100" step="0.01" value={form.defaultTaxRate} onChange={(e) => setForm({ ...form, defaultTaxRate: Number(e.target.value) })} className={inputCls} /></Field>
        </div>
        <button type="submit" className={`${btnPrimary} w-full`}>Save & start billing →</button>
        <button type="button" className={`${btnSecondary} w-full`} onClick={skip}>Skip for now — explore the app</button>
      </form>
      <p className="text-sm text-slate-500 dark:text-slate-400">Next step after setup: add your first product (up to 7 active), then tap Create Invoice.</p>
    </div>
  );
}
