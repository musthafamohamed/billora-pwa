import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { buildBackup, parseBackup } from '../lib/backup';
import { backupReminderDue, exportBackup, getLastBackupExport } from '../lib/backupStatus';
import { clearInvoiceRecoveries } from '../lib/invoiceRecovery';
import { downloadBlob } from '../lib/pdf';
import { isValidGstin, MAX_ACTIVE_PRODUCTS, nowISO, uid, type BusinessProfile } from '../lib/types';
import { btnPrimary, btnSecondary, ConfirmDialog, Field, inputCls } from '../components/ui';
import { Icon } from '../components/Icon';
import InstallSection from '../components/InstallSection';
import { APP_BUILD, APP_VERSION } from '../lib/version';

const DEMO_PRODUCTS = [
  { name: 'Demo — Cotton Shirt', unit: 'Piece', sellingPrice: 499, defaultTaxRate: 5 },
  { name: 'Demo — Notebook Pack', unit: 'Pack', sellingPrice: 249, defaultTaxRate: 12 },
  { name: 'Demo — Repair Service', unit: 'Service', sellingPrice: 799, defaultTaxRate: 18 },
];

export default function Settings() {
  const { profile, products, customers, invoices, saveProfileState, replaceAll, upsertProduct, upsertCustomer, theme, setTheme } = useStore();
  const [form, setForm] = useState<BusinessProfile>(profile);
  const [dirty, setDirty] = useState(false);
  const editVersion = useRef(0);
  const saveInFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!dirty) setForm(profile); }, [profile, dirty]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseBackup>['data']>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [lastExport, setLastExport] = useState(getLastBackupExport);
  const reminderDue = backupReminderDue(lastExport);
  const revealField = (name: string) => {
    const field = formRef.current?.elements.namedItem(name);
    if (field instanceof HTMLElement) {
      const section = field.closest('details');
      if (section) section.open = true;
      field.focus();
    }
  };
  const set = (k: keyof BusinessProfile, v: string | number) => { editVersion.current += 1; setDirty(true); setForm((f) => ({ ...f, [k]: v })); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveInFlight.current) return;
    if (!form.businessName.trim()) { setErr('Business name is required.'); revealField('businessName'); return; }
    // Phone is optional — only the business name is required.
    if (!isValidGstin(form.gstin)) { setErr('GSTIN format looks invalid. Leave it blank if you do not have one.'); revealField('gstin'); return; }
    const version = editVersion.current;
    saveInFlight.current = true;
    setSaving(true);
    setErr(''); setMsg('');
    try {
      await saveProfileState({ ...form, gstin: form.gstin.trim().toUpperCase(), invoicePrefix: (form.invoicePrefix || 'INV').trim().toUpperCase() });
      if (editVersion.current === version) {
        setDirty(false);
        setMsg('Settings saved.');
      } else {
        setMsg('Earlier changes saved. Your latest edits are still unsaved.');
      }
    } catch {
      setErr('Could not save settings. Your edits are still here. Please try again.');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('logo', String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const exportJson = () => {
    try {
      const blob = new Blob([JSON.stringify(buildBackup(profile, products, customers, invoices), null, 2)], { type: 'application/json' });
      const requestedAt = exportBackup(() => downloadBlob(blob, `simple-bill-backup-${new Date().toISOString().slice(0, 10)}.json`));
      setLastExport(requestedAt);
      setErr('');
      setMsg('Backup download requested. Check your Downloads folder and keep the file somewhere safe.');
    } catch {
      setMsg('');
      setErr('Could not export the backup. Please try again.');
    }
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const { data, errors } = parseBackup(text);
    if (errors.length) { setErr(`Import rejected: ${errors.join(' ')} Nothing was changed.`); return; }
    setPendingImport(data);
  };

  const doImport = async () => {
    if (!pendingImport) return;
    await replaceAll(pendingImport.profile, pendingImport.products, pendingImport.customers, pendingImport.invoices);
    clearInvoiceRecoveries();
    setPendingImport(null);
    setMsg(`Backup restored: ${pendingImport.products.length} products, ${pendingImport.customers.length} customers, ${pendingImport.invoices.length} invoices.`);
  };

  const loadDemo = async () => {
    // Respect the 7-active-product cap and never duplicate a product name
    // (including the PM Sons starter products) or the demo customer phone.
    const existingNames = new Set(products.map((p) => p.name.trim().toLowerCase()));
    let active = products.filter((p) => p.isActive).length;
    let added = 0;
    let skipped = 0;
    for (const p of DEMO_PRODUCTS) {
      if (existingNames.has(p.name.trim().toLowerCase())) { skipped += 1; continue; }
      if (active >= MAX_ACTIVE_PRODUCTS) { skipped += 1; continue; }
      await upsertProduct({ id: uid(), name: p.name, description: 'Demo data — delete or deactivate when you no longer need it.', unit: p.unit, sellingPrice: p.sellingPrice, defaultTaxRate: p.defaultTaxRate, hsnSacCode: '', isActive: true, createdAt: nowISO(), updatedAt: nowISO() });
      existingNames.add(p.name.trim().toLowerCase());
      active += 1;
      added += 1;
    }
    if (!customers.some((c) => c.phone.replace(/\s/g, '') === '9000000001')) {
      await upsertCustomer({ id: uid(), name: 'Demo — Priya Nair', phone: '9000000001', email: '', billingAddress: 'Demo address, Kochi, Kerala', gstin: '', state: 'Kerala', notes: 'Demo data', createdAt: nowISO(), updatedAt: nowISO() });
    }
    setMsg(`Demo data: ${added} product(s) added, ${skipped} skipped (already present or the ${MAX_ACTIVE_PRODUCTS}-active-product limit). It is not loaded automatically on a fresh install.`);
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>
      {msg && <p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-900/40 p-3 text-sm font-medium text-emerald-900 dark:text-emerald-100">{msg}</p>}
      {err && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/40 p-3 text-sm font-medium text-red-800 dark:text-red-100">{err}</p>}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-lg font-bold">Appearance</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Saved on this device and applied immediately.</p>
        <div role="group" aria-label="Appearance" className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5">
          {(['light', 'dark'] as const).map((t) => (
            <button key={t} type="button" onClick={() => { void setTheme(t); }} aria-pressed={theme === t}
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-base font-semibold ${theme === t ? 'bg-teal-700 text-white' : 'text-slate-700 dark:text-slate-200'}`}>
              <Icon name={t === 'light' ? 'sun' : 'moon'} /> {t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </section>

      <form ref={formRef} onSubmit={save} onInvalidCapture={(e) => {
        const field = e.target as HTMLElement;
        const section = field.closest('details');
        if (section) section.open = true;
      }} className="space-y-4">
        <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <summary className="min-h-[44px] cursor-pointer text-lg font-bold">Business</summary>
          <div className="mt-3 space-y-4">
            <Field label="Business name *"><input name="businessName" required value={form.businessName} onChange={(e) => set('businessName', e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Proprietor name"><input value={form.proprietorName} onChange={(e) => set('proprietorName', e.target.value)} className={inputCls} /></Field>
              <Field label="Phone (optional)"><input value={form.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} /></Field>
            <Field label="Address"><textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="GSTIN (optional)"><input name="gstin" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} className={inputCls} /></Field>
              <Field label="State"><input value={form.state} onChange={(e) => set('state', e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="State code (optional)"><input value={form.stateCode} onChange={(e) => set('stateCode', e.target.value)} className={inputCls} /></Field>
            <Field label="Logo (optional, stored on this device)">
              <input type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm" />
            </Field>
            {form.logo && <img src={form.logo} alt="Business logo preview" className="h-20 w-auto rounded-lg border" />}
          </div>
        </details>

        <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <summary className="min-h-[44px] cursor-pointer text-lg font-bold">Invoice defaults</summary>
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice prefix"><input value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value)} className={inputCls} /></Field>
              <Field label="Default GST %"><input type="number" min="0" max="100" step="0.01" value={form.defaultTaxRate} onChange={(e) => set('defaultTaxRate', Number(e.target.value))} className={inputCls} /></Field>
            </div>
            <Field label="Default terms & conditions"><textarea rows={3} value={form.termsAndConditions} onChange={(e) => set('termsAndConditions', e.target.value)} className={inputCls} /></Field>
            <details className="text-sm text-slate-600 dark:text-slate-400">
              <summary className="min-h-[44px] cursor-pointer font-semibold">About GST calculations</summary>
              <p className="mt-2">Simple Bill calculates the GST breakdown you configure. It does not file returns or verify GSTINs against government records. Check your tax obligations with your accountant.</p>
            </details>
          </div>
        </details>

        <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <summary className="min-h-[44px] cursor-pointer text-lg font-bold">Payment details</summary>
          <div className="mt-3 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">These optional details are shown on invoices.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank name (optional)"><input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} className={inputCls} /></Field>
              <Field label="Account holder (optional)"><input value={form.accountHolderName} onChange={(e) => set('accountHolderName', e.target.value)} className={inputCls} /></Field>
              <Field label="Account number (optional)"><input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} className={inputCls} /></Field>
              <Field label="IFSC (optional)"><input value={form.ifsc} onChange={(e) => set('ifsc', e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="UPI ID (optional)"><input value={form.upiId} onChange={(e) => set('upiId', e.target.value)} className={inputCls} /></Field>
          </div>
        </details>
        <button type="submit" disabled={saving} className={`${btnPrimary} w-full`}><Icon name="save" /> {saving ? 'Saving settings…' : 'Save settings'}</button>
      </form>

      <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <summary className="min-h-[44px] cursor-pointer text-lg font-bold">
          Backup & restore
          <span className="mt-2 block text-sm font-normal text-slate-600 dark:text-slate-400">
            {lastExport ? `Last export requested: ${new Date(lastExport).toLocaleString()}.` : 'No backup export recorded on this device.'}
          </span>
          {reminderDue && <span className="mt-1 block text-sm font-normal text-slate-600 dark:text-slate-400">{lastExport ? 'It has been a while. Export a fresh backup to keep a recent copy.' : 'Export a backup to keep a copy outside this browser.'}</span>}
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">All data stays on this device. Clearing browser data or resetting your phone can remove it. An export request does not confirm that the file was saved; check Downloads and keep a copy somewhere safe.</p>
          <button type="button" className={btnPrimary} onClick={exportJson}><Icon name="download" /> Export backup (JSON)</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0])} />
          <button type="button" className={btnSecondary} onClick={() => fileRef.current?.click()}><Icon name="upload" /> Restore from backup (JSON)</button>
          <details>
            <summary className="min-h-[44px] cursor-pointer text-sm font-semibold">Demo data</summary>
            <button type="button" className={`${btnSecondary} mt-2`} onClick={loadDemo}><Icon name="flask" /> Load clearly-labelled demo data</button>
          </details>
        </div>
      </details>

      <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <summary className="min-h-[44px] cursor-pointer text-lg font-bold">Install app & troubleshooting</summary>
        <div className="mt-3"><InstallSection /></div>
      </details>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">Simple Bill v{APP_VERSION} — build {APP_BUILD}</p>

      {pendingImport && (
        <ConfirmDialog
          title="Replace all data with this backup?"
          message={`This backup contains ${pendingImport.products.length} products, ${pendingImport.customers.length} customers and ${pendingImport.invoices.length} invoices. Your current data will be replaced. Export a backup first if you want to keep it.`}
          confirmLabel="Yes, replace all data"
          onCancel={() => setPendingImport(null)}
          onConfirm={doImport}
        />
      )}
    </div>
  );
}
