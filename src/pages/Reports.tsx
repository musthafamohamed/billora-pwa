import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { inr } from '../lib/format';
import { btnPrimary, btnSecondary, Field, inputCls } from '../components/ui';
import { Icon } from '../components/Icon';
import {
  describeFilters, filterInvoices, hsnRows, hsnRowsAsArrays, itemRows, netTotals,
  summaryRows, HSN_HEADERS, ITEM_HEADERS, SUMMARY_HEADERS,
  type ReportStatusFilter, type ReportTypeFilter,
} from '../lib/reports';
import {
  buildCsvBlob, buildReportPdfBlob, buildXlsxBlob, reportFilename, shareFile,
  type ReportRow,
} from '../lib/reportExport';
import { downloadBlob } from '../lib/pdf';

type ReportKind = 'summary' | 'items' | 'hsn';

const KIND_META: Record<ReportKind, { title: string; sheet: string; slug: string; label: string }> = {
  summary: { title: 'Invoice Summary Report', sheet: 'Invoices', slug: 'invoices', label: 'Invoice Summary' },
  items: { title: 'Item-wise Report', sheet: 'Items', slug: 'items', label: 'Item-wise' },
  hsn: { title: 'HSN-wise Report', sheet: 'HSN-wise', slug: 'hsn-wise', label: 'HSN-wise' },
};

export default function Reports() {
  const { invoices, profile, products } = useStore();
  const [type, setType] = useState<ReportTypeFilter>('ALL');
  const [status, setStatus] = useState<ReportStatusFilter>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<ReportKind>('summary');
  const [msg, setMsg] = useState('');
  const [showUnsupportedShare, setShowUnsupportedShare] = useState(false);
  // Native file sharing needs a secure context (HTTPS or localhost) —
  // same rule as invoice PDFs, so warn before tapping on plain HTTP.
  const isSecureContext = typeof window !== 'undefined' &&
    (window.location.protocol === 'https:' ||
      ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname.toLowerCase()));

  const filters = useMemo(() => ({ type, status, from, to }), [type, status, from, to]);
  const filtered = useMemo(() => filterInvoices(invoices, filters), [invoices, filters]);
  const totals = useMemo(() => netTotals(filtered), [filtered]);
  const filtersDescription = useMemo(() => describeFilters(filters), [filters]);

  // PDF-only layout: proportional column widths (scaled to the page in
  // reportExport) and abbreviated headers where the full header would
  // wrap to several lines. CSV/XLSX always use the full headers above.
  const { headers, rows, totalsRow, pdfHeaders, colWidths }: {
    headers: readonly string[]; rows: ReportRow[]; totalsRow: ReportRow;
    pdfHeaders: readonly string[]; colWidths: readonly number[];
  } = useMemo(() => {
    if (kind === 'summary') {
      const rows = summaryRows(filtered);
      return {
        headers: SUMMARY_HEADERS,
        rows,
        totalsRow: ['', '', '', '', 'TOTAL', totals.subtotal, totals.discount, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.gst, '', totals.additionalCharge, totals.grandTotal],
        pdfHeaders: ['Invoice No', 'Date', 'Type', 'Status', 'Customer', 'Subtotal', 'Discount', 'Taxable', 'CGST', 'SGST', 'IGST', 'GST', 'Add. Label', 'Add. Amt', 'Grand Total'],
        colWidths: [24, 20, 18, 16, 32, 19, 17, 19, 15, 15, 15, 15, 17, 17, 18],
      };
    }
    if (kind === 'items') {
      const rows = itemRows(filtered);
      const sumCol = (i: number) => Math.round(rows.reduce((s, r) => s + Number(r[i] ?? 0), 0) * 100) / 100;
      return {
        headers: ITEM_HEADERS,
        rows,
        totalsRow: ['', '', '', '', 'TOTAL', '', '', '', '', sumCol(9), sumCol(10), '', sumCol(12), sumCol(13)],
        pdfHeaders: ITEM_HEADERS,
        colWidths: [24, 20, 32, 16, 38, 14, 12, 12, 16, 16, 19, 13, 16, 19],
      };
    }
    const hsn = hsnRows(filtered, products);
    const rows = hsnRowsAsArrays(hsn);
    const sumCol = (i: number) => Math.round(rows.reduce((s, r) => s + Number(r[i] ?? 0), 0) * 100) / 100;
    return {
      headers: HSN_HEADERS,
      rows,
      totalsRow: ['TOTAL', '', sumCol(2), sumCol(3), sumCol(4), sumCol(5), sumCol(6), sumCol(7)],
      pdfHeaders: HSN_HEADERS,
      colWidths: [30, 22, 42, 36, 36, 36, 36, 39],
    };
  }, [kind, filtered, totals, products]);

  const meta = KIND_META[kind];

  const summarySheetRows: ReportRow[] = [
    ['Invoices', totals.invoiceCount],
    ['Tax invoices', totals.taxInvoiceCount],
    ['Bills (without tax)', totals.nonTaxCount],
    ['Draft', totals.draftCount],
    ['Final', totals.finalCount],
    ['Cancelled', totals.cancelledCount],
    ['Subtotal', totals.subtotal],
    ['Discount', totals.discount],
    ['Taxable Value', totals.taxable],
    ['CGST', totals.cgst],
    ['SGST', totals.sgst],
    ['IGST', totals.igst],
    ['GST (combined)', totals.gst],
    ['Additional Charges', totals.additionalCharge],
    ['Grand Total', totals.grandTotal],
    ['Tax invoices — Grand Total', totals.taxGrandTotal],
    ['Bills — Grand Total', totals.nonTaxGrandTotal],
  ];

  const exportCsv = () => {
    downloadBlob(buildCsvBlob(headers, rows), reportFilename(meta.slug, 'csv', filters));
    setMsg(`CSV exported: ${rows.length} row(s) for ${meta.label}.`);
  };
  const exportXlsx = () => {
    downloadBlob(
      buildXlsxBlob({ sheetName: meta.sheet, headers, rows, summaryRows: summarySheetRows, filtersDescription }),
      reportFilename(meta.slug, 'xlsx', filters),
    );
    setMsg(`XLSX exported: Summary sheet + ${meta.sheet} sheet (${rows.length} row(s)).`);
  };
  const exportPdf = () => {
    downloadBlob(
      buildReportPdfBlob({
        businessName: profile.businessName, reportTitle: meta.title, filtersDescription,
        headers, pdfHeaders, colWidths, rows, totalsRow: rows.length ? totalsRow : undefined,
      }),
      reportFilename(meta.slug, 'pdf', filters),
    );
    setMsg(`PDF exported: ${meta.label} (${rows.length} row(s)).`);
  };

  // Share buttons: same files as Export, via the native share sheet
  // (WhatsApp listed on Android over HTTPS). Cancelling downloads
  // nothing; genuinely unsupported sharing downloads the file and
  // shows the amber warning card, exactly like invoice PDFs.
  const shareBlob = async (blob: Blob, filename: string, mimeType: string, label: string) => {
    try {
      const r = await shareFile(blob, filename, mimeType);
      if (r === 'shared') { setShowUnsupportedShare(false); setMsg('Share sheet opened.'); }
      else if (r === 'cancelled') { setShowUnsupportedShare(false); setMsg('Sharing cancelled — nothing was downloaded.'); }
      else {
        downloadBlob(blob, filename);
        setMsg('');
        setShowUnsupportedShare(true);
      }
    } catch {
      setMsg(`Could not share the ${label} file. Please try again.`);
    }
  };
  const shareCsv = () => void shareBlob(buildCsvBlob(headers, rows), reportFilename(meta.slug, 'csv', filters), 'text/csv', 'CSV');
  const shareXlsx = () => void shareBlob(
    buildXlsxBlob({ sheetName: meta.sheet, headers, rows, summaryRows: summarySheetRows, filtersDescription }),
    reportFilename(meta.slug, 'xlsx', filters),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX');
  const sharePdf = () => void shareBlob(
    buildReportPdfBlob({
      businessName: profile.businessName, reportTitle: meta.title, filtersDescription,
      headers, pdfHeaders, colWidths, rows, totalsRow: rows.length ? totalsRow : undefined,
    }),
    reportFilename(meta.slug, 'pdf', filters), 'application/pdf', 'PDF');

  const clearFilters = () => { setType('ALL'); setStatus('ALL'); setFrom(''); setTo(''); };

  const tabCls = (active: boolean) => `min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold ${active ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`;

  const totalRow = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Icon name="chart" size={24} /> Reports</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Export invoice details for the auditing team. Exports use the invoice snapshots, so later edits to products or customers never change an exported report.
      </p>

      {/* Filters */}
      <section aria-label="Report filters" className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as ReportTypeFilter)} className={inputCls}>
              <option value="ALL">All types</option>
              <option value="TAX">Tax Invoice</option>
              <option value="NON_TAX">Without Tax</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as ReportStatusFilter)} className={inputCls}>
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="FINAL">Final</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From date (optional)">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </Field>
          <Field label="To date (optional)">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{filtered.length} invoice(s)</p>
          <button type="button" className={btnSecondary} onClick={clearFilters}>Clear filters</button>
        </div>
      </section>

      {/* Report selector */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose report">
        {(['summary', 'items', 'hsn'] as const).map((k) => (
          <button key={k} type="button" className={tabCls(kind === k)} onClick={() => setKind(k)}>{KIND_META[k].label}</button>
        ))}
      </div>

      {/* Net totals */}
      <section aria-label="Net totals for the selected filters" className="rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/40 p-4">
        <h2 className="text-base font-bold text-teal-900 dark:text-teal-100">Net totals for the selected filters</h2>
        <div className="mt-2 divide-y divide-teal-100 dark:divide-teal-800">
          {totalRow('Invoices', String(totals.invoiceCount))}
          {totalRow('Subtotal', inr(totals.subtotal))}
          {totalRow('Discount', inr(totals.discount))}
          {totalRow('Taxable Value', inr(totals.taxable))}
          {totalRow('CGST', inr(totals.cgst))}
          {totalRow('SGST', inr(totals.sgst))}
          {totalRow('IGST', inr(totals.igst))}
          {totalRow('GST (combined)', inr(totals.gst))}
          {totalRow('Additional Charges', inr(totals.additionalCharge))}
          {totalRow('Grand Total', inr(totals.grandTotal))}
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Tax invoices: {totals.taxInvoiceCount} · {inr(totals.taxGrandTotal)} — Bills: {totals.nonTaxCount} · {inr(totals.nonTaxGrandTotal)} — Draft: {totals.draftCount} · Final: {totals.finalCount} · Cancelled: {totals.cancelledCount}
        </p>
      </section>

      {/* Exports */}
      <section aria-label={`Export ${meta.label}`} className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={exportCsv}><Icon name="download" /> Export CSV</button>
        <button type="button" className={btnPrimary} onClick={exportXlsx}><Icon name="download" /> Export XLSX</button>
        <button type="button" className={btnPrimary} onClick={exportPdf}><Icon name="download" /> Export PDF</button>
      </section>
      {/* Share — same files as Export, via the native share sheet */}
      <section aria-label={`Share ${meta.label}`} className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={shareCsv}><Icon name="share" /> Share CSV</button>
        <button type="button" className={btnSecondary} onClick={shareXlsx}><Icon name="share" /> Share XLSX</button>
        <button type="button" className={btnSecondary} onClick={sharePdf}><Icon name="share" /> Share PDF</button>
      </section>
      {!isSecureContext && (
        <p className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/40 p-3 text-sm font-medium text-amber-900 dark:text-amber-100">
          Note: you are on a plain-HTTP address, so Share will download the file instead of opening the share sheet.
          Use an HTTPS URL (see Settings → Install app) for WhatsApp sharing.
        </p>
      )}
      {showUnsupportedShare && (
        <div role="alert" className="rounded-2xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/40 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-bold text-amber-900 dark:text-amber-100">Sharing is not available on this address</p>
            <button type="button" aria-label="Dismiss sharing warning" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100" onClick={() => setShowUnsupportedShare(false)}><Icon name="x" /></button>
          </div>
          <p className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-100">
            File sharing needs HTTPS or localhost. On this plain-HTTP address the file was downloaded instead.
          </p>
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
            To send it on WhatsApp: open WhatsApp → attach → Document → choose the downloaded file from Downloads → send.
          </p>
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
            To make Share open the share sheet (with WhatsApp listed), open the app over an HTTPS URL instead — see Settings → Install app.
          </p>
        </div>
      )}
      {msg && <p role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-900/40 p-3 text-sm font-medium text-emerald-900 dark:text-emerald-100">{msg}</p>}

      {/* Preview */}
      <section aria-label={`${meta.label} preview`}>
        <h2 className="mb-2 text-base font-bold">{meta.label} preview</h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No invoices match these filters. Exports will still include the headers and the net totals summary.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-teal-700 text-white">
                  {headers.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-t border-slate-200 dark:border-slate-700">
                    {row.map((cell, ci) => (
                      <td key={ci} className="whitespace-nowrap px-3 py-2 text-slate-800 dark:text-slate-100">
                        {typeof cell === 'number' ? inr(cell) : cell}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-teal-700 font-bold">
                  {totalsRow.map((cell, ci) => (
                    <td key={ci} className="whitespace-nowrap px-3 py-2">
                      {typeof cell === 'number' ? inr(cell) : cell}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Exports use the invoice snapshots, so later edits to products or customers never change an exported report.
          HSN-wise includes tax invoices and bills; tax columns are 0 for bills. Lines whose product has no HSN are excluded.
        </p>
      </section>
    </div>
  );
}
