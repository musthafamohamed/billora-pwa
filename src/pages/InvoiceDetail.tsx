import { useState } from 'react';
import { useStore } from '../lib/store';
import { fmtDate, inr } from '../lib/format';
import { amountInWords } from '../lib/words';
import { buildInvoicePdf, downloadBlob, sharePdf } from '../lib/pdf';
import { nowISO, uid, type Invoice } from '../lib/types';
import { btnPrimary, btnSecondary, ConfirmDialog, StatusBadge } from '../components/ui';
import { Icon } from '../components/Icon';
import type { Route } from '../App';

export default function InvoiceDetail({ id, navigate }: { id: string; navigate: (r: Route, id?: string) => void }) {
  const { invoices, upsertInvoice } = useStore();
  const [msg, setMsg] = useState('');
  const [showUnsupportedShare, setShowUnsupportedShare] = useState(false);
  const [err, setErr] = useState('');
  // Native file sharing needs a secure context (HTTPS or localhost). On a
  // plain-HTTP LAN address it is unavailable, so Share falls back to a
  // download — warn about that before the user taps, not only after.
  const isSecureContext = typeof window !== 'undefined' &&
    (window.location.protocol === 'https:' ||
      ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname.toLowerCase()));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const inv = invoices.find((i) => i.id === id);
  if (!inv) return <p className="text-slate-600 dark:text-slate-400">Invoice not found. <button className="font-semibold text-teal-700 dark:text-teal-300" onClick={() => navigate('invoices')}>Back to invoices</button></p>;

  const isTax = inv.invoiceType === 'TAX';
  const download = () => {
    try { downloadBlob(buildInvoicePdf(inv), `${inv.invoiceNumber}.pdf`); setMsg('PDF downloaded.'); setErr(''); }
    catch { setErr('Could not generate the PDF. Please try again.'); }
  };
  const share = async () => {
    try {
      const r = await sharePdf(inv);
      setErr('');
      if (r === 'shared') { setShowUnsupportedShare(false); setMsg('Share sheet opened.'); }
      else if (r === 'cancelled') { setShowUnsupportedShare(false); setMsg('Sharing cancelled — nothing was downloaded.'); }
      else {
        // Genuinely unsupported (e.g. plain-HTTP address, where file
        // sharing needs a secure context): download instead, and show a
        // prominent amber warning card (not a small green line) that
        // stays until dismissed, so the fallback cannot be missed.
        downloadBlob(buildInvoicePdf(inv), `${inv.invoiceNumber}.pdf`);
        setMsg('');
        setShowUnsupportedShare(true);
      }
    }
    catch { setErr('Could not generate the PDF. Please try again.'); }
  };
  const duplicate = async () => {
    const copy: Invoice = {
      ...inv, id: uid(), invoiceNumber: `${inv.invoiceNumber}-COPY`, status: 'DRAFT',
      lineItems: inv.lineItems.map((l) => ({ ...l, id: uid() })),
      createdAt: nowISO(), updatedAt: nowISO(),
    };
    // A duplicated draft gets a fresh number when it is opened for editing
    // only if the operator saves it as a new invoice; the -COPY suffix
    // keeps it visibly distinct until then. To avoid number collisions on
    // finalise, the editor re-numbers drafts whose number is not unique.
    await upsertInvoice(copy);
    navigate('invoice-new', copy.id);
  };
  const cancel = async () => {
    await upsertInvoice({ ...inv, status: 'CANCELLED', updatedAt: nowISO() });
    setConfirmCancel(false);
    setMsg('Invoice cancelled.');
  };

  return (
    <div className="space-y-4">
      <button type="button" className="min-h-[44px] font-semibold text-teal-700 dark:text-teal-300" onClick={() => navigate('invoices')}>← Back to invoices</button>
      {msg && <p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-900/40 p-3 text-sm font-medium text-emerald-900 dark:text-emerald-100">{msg}</p>}
      {showUnsupportedShare && (
        <div role="alert" className="rounded-2xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/40 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-bold text-amber-900 dark:text-amber-100">Sharing is not available on this address</p>
            <button type="button" aria-label="Dismiss sharing warning" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100" onClick={() => setShowUnsupportedShare(false)}><Icon name="x" /></button>
          </div>
          <p className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-100">
            File sharing needs HTTPS or localhost. On this plain-HTTP address the PDF was downloaded instead.
          </p>
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
            To send it on WhatsApp: open WhatsApp → attach → Document → choose the downloaded PDF from Downloads → send.
          </p>
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
            To make Share open the share sheet (with WhatsApp listed), open the app over an HTTPS URL instead — see Settings → Install app.
          </p>
        </div>
      )}
      {err && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/40 p-3 text-sm font-medium text-red-800 dark:text-red-100">{err}</p>}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5" aria-label="Invoice preview">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{inv.businessSnapshot.businessName || 'Simple Bill'}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{inv.businessSnapshot.address} {inv.businessSnapshot.phone ? `· ${inv.businessSnapshot.phone}` : ''}</p>
            {isTax && inv.businessSnapshot.gstin && <p className="text-sm text-slate-500 dark:text-slate-400">GSTIN: {inv.businessSnapshot.gstin}</p>}
          </div>
          <StatusBadge status={inv.status} />
        </div>
        <h2 className="mt-4 text-lg font-bold">
          <span className={isTax ? 'text-teal-800 dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}>{isTax ? 'TAX INVOICE' : 'BILL'}</span>{' '}
          <span className={`ml-1 rounded-full px-2.5 py-1 text-xs font-semibold ${isTax ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-900 dark:text-teal-100' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100'}`}>
            {isTax ? 'Tax Invoice' : 'Without Tax'}
          </span>
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">No: {inv.invoiceNumber} · Date: {fmtDate(inv.issueDate)}{inv.dueDate ? ` · Due: ${fmtDate(inv.dueDate)}` : ''}</p>

        <h3 className="mt-4 font-bold">Bill To</h3>
        <p className="text-sm text-slate-700 dark:text-slate-200">{inv.customerSnapshot.name}<br />{inv.customerSnapshot.billingAddress}<br />{[inv.customerSnapshot.phone, inv.customerSnapshot.email].filter(Boolean).join(' ')}<br />{isTax && inv.customerSnapshot.gstin ? `GSTIN: ${inv.customerSnapshot.gstin}` : ''}</p>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500 dark:text-slate-400">
              <th className="py-2">Item</th><th className="py-2">Qty</th>{isTax && <th className="py-2">Tax</th>}<th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lineItems.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800 align-top">
                <td className="py-2 pr-2">{l.productName}<br /><span className="text-xs text-slate-500 dark:text-slate-400">{l.description}{l.lineDiscount > 0 ? ` · Discount ${inr(l.lineDiscount)}` : ''}</span></td>
                <td className="py-2">{l.quantity} {l.unit}</td>
                {isTax && <td className="py-2">{inr(l.lineTax)} ({l.taxRate}%)</td>}
                <td className="py-2 text-right font-medium">{inr(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(inv.subtotal)}</dd></div>
          {inv.discountAmount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>− {inr(inv.discountAmount)}</dd></div>}
          {isTax && (
            <>
              <div className="flex justify-between"><dt>Taxable Value</dt><dd>{inr(inv.taxableAmount)}</dd></div>
              {inv.taxBreakdown.kind === 'CGST_SGST' && (<>
                <div className="flex justify-between"><dt>CGST</dt><dd>{inr(inv.taxBreakdown.cgst)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd>{inr(inv.taxBreakdown.sgst)}</dd></div>
              </>)}
              {inv.taxBreakdown.kind === 'IGST' && <div className="flex justify-between"><dt>IGST</dt><dd>{inr(inv.taxBreakdown.igst)}</dd></div>}
              {inv.taxBreakdown.kind === 'GST' && <div className="flex justify-between"><dt>GST</dt><dd>{inr(inv.taxBreakdown.gst)}</dd></div>}
            </>
          )}
          {(inv.additionalChargeAmount ?? 0) > 0 && <div className="flex justify-between"><dt>{inv.additionalChargeLabel?.trim() || 'Additional charge'}</dt><dd>{inr(inv.additionalChargeAmount ?? 0)}</dd></div>}
          <div className="flex justify-between border-t pt-2 text-base font-bold"><dt>Grand Total</dt><dd>{inr(inv.grandTotal)}</dd></div>
        </dl>
        <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">{amountInWords(inv.grandTotal)}</p>
        {isTax && inv.taxSplit && inv.taxSplit !== 'AUTO' && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tax split shown as selected: {inv.taxSplit === 'CGST_SGST' ? 'CGST + SGST' : inv.taxSplit}.</p>
        )}
        {inv.notes && <p className="mt-3 text-sm"><strong>Notes:</strong> {inv.notes}</p>}
        {inv.termsAndConditions && <p className="mt-2 text-sm"><strong>Terms:</strong> {inv.termsAndConditions}</p>}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={btnPrimary} onClick={download}><Icon name="download" /> Download PDF</button>
        <button type="button" className={btnSecondary} onClick={share}><Icon name="share" /> Share PDF</button>
        <button type="button" className={btnSecondary} onClick={() => { try { downloadBlob(buildInvoicePdf(inv), `${inv.invoiceNumber}.pdf`); window.print(); } catch { setErr('Could not generate the PDF. Please try again.'); } }}><Icon name="printer" /> Print PDF</button>
        {inv.status === 'DRAFT' && <button type="button" className={btnSecondary} onClick={() => navigate('invoice-new', inv.id)}><Icon name="pencil" /> Edit draft</button>}
        <button type="button" className={btnSecondary} onClick={duplicate}>⧉ Duplicate as draft</button>
        {!isSecureContext && (
          <p className="col-span-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/40 p-3 text-sm font-medium text-amber-900 dark:text-amber-100">
            Note: you are on a plain-HTTP address, so Share PDF will download the PDF instead of opening the share sheet.
            Use an HTTPS URL (see Settings → Install app) for WhatsApp sharing.
          </p>
        )}
        <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">
          On Android over HTTPS, Share opens your phone&apos;s share sheet — WhatsApp and other installed apps are listed there.
          A wa.me link cannot attach files, so the app uses the native share sheet instead.
        </p>
        {inv.status === 'FINAL' && <button type="button" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-slate-900 px-4 py-3 font-semibold text-red-700 dark:text-red-300" onClick={() => setConfirmCancel(true)}><Icon name="x" /> Cancel invoice</button>}
      </div>
      {inv.status === 'FINAL' && <p className="text-sm text-slate-500 dark:text-slate-400">Final invoices cannot be edited. Duplicate it to make a corrected copy, or cancel it with confirmation.</p>}

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this invoice?"
          message={`Invoice ${inv.invoiceNumber} will be marked Cancelled. This does not delete it, and its number will not be reused.`}
          confirmLabel="Yes, cancel invoice"
          onCancel={() => setConfirmCancel(false)}
          onConfirm={cancel}
        />
      )}
    </div>
  );
}
