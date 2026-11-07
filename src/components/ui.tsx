import React, { useEffect } from 'react';
import { inr } from '../lib/format';
import { useInstall } from '../lib/useInstall';
import type { InvoiceStatus } from '../lib/types';
import { Icon } from './Icon';

export function Money({ value, className = '' }: { value: number; className?: string }) {
  return <span className={className}>{inr(value)}</span>;
}

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const map: Record<InvoiceStatus, { label: string; cls: string; dot: string }> = {
    DRAFT: { label: 'Draft', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
    FINAL: { label: 'Final', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-600' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-100 border-red-300 dark:border-red-700', dot: 'bg-red-500' },
  };
  const m = map[status];
  return (
    <span className={`sb-status inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${m.cls}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="sb-page-card rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-6 text-center">
      <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputCls = 'sb-input w-full px-3.5 py-2.5 text-base';
export const btnPrimary = 'sb-btn-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-white disabled:opacity-50';
export const btnSecondary = 'sb-btn-secondary inline-flex items-center justify-center gap-2 px-4 py-3';
export const btnDanger = 'sb-btn-danger inline-flex items-center justify-center gap-2 px-4 py-3 text-white';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close dialog" className="sb-sheet-backdrop absolute inset-0" onClick={onClose} />
      <div className="sb-sheet relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} className={`${btnSecondary} min-w-[44px] px-3`} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, danger = true }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <p className="text-base text-slate-700 dark:text-slate-200">{message}</p>
      <div className="mt-5 flex gap-3">
        <button type="button" className={btnSecondary} onClick={onCancel}>Cancel</button>
        <button type="button" className={danger ? btnDanger : btnPrimary} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Sheet>
  );
}

export function InstallCard() {
  const { canInstall, isInstalled, installOutcome, promptInstall } = useInstall();
  return (
    <section aria-label="Install this app" className="rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/40 p-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-teal-900 dark:text-teal-100"><Icon name="smartphone" /> Install Simple Bill on your phone</h2>
      {isInstalled ? (
        <p role="status" className="mt-1 flex items-center gap-2 text-sm font-semibold text-teal-900 dark:text-teal-100"><Icon name="check" /> Already installed.</p>
      ) : canInstall ? (
        <>
          <button type="button" className={`${btnPrimary} mt-3 w-full`} onClick={() => { void promptInstall(); }}><Icon name="download" /> Install Simple Bill</button>
          {installOutcome && <p role="status" className="mt-2 text-sm text-teal-900 dark:text-teal-100">{installOutcome}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-teal-900 dark:text-teal-100">
          Use your browser&apos;s <strong>Add to Home Screen</strong> option to install it like an app.
          It then opens full-screen and works offline after the first load. See Settings → Install app for live install checks.
        </p>
      )}
      <p className="mt-2 text-sm text-teal-900 dark:text-teal-100">
        <strong>Android (Chrome):</strong> Menu ⋮ → Add to Home screen.
        {' '}<strong>iPhone (Safari):</strong> Share ⎋ → Add to Home Screen.
      </p>
      <p className="mt-1 text-xs text-teal-800 dark:text-teal-200">Installation depends on your phone and browser; it cannot be forced from inside the app, and it does not work from a plain-HTTP LAN address.</p>
    </section>
  );
}
