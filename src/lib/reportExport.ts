import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { inrPlain } from './format';
import { todayISO } from './types';
import type { ReportFilters } from './reports';

export type ReportCell = string | number;
export type ReportRow = ReportCell[];

/** CSV with proper escaping and a UTF-8 BOM so Excel opens ₹ and
 *  non-ASCII names correctly. Numbers stay plain (no ₹, no thousands
 *  separators) so auditors can sum columns in Excel. */
export function escapeCsvCell(value: ReportCell): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: ReportRow[]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function buildCsvBlob(headers: readonly string[], rows: ReportRow[]): Blob {
  return new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
}

/** XLSX workbook: a "Summary" sheet (net totals + filters + date) and
 *  the report sheet itself. Returns the Blob for download. */
export function buildXlsxBlob(args: {
  sheetName: string; // max 31 chars
  headers: readonly string[];
  rows: ReportRow[];
  summaryRows: ReportRow[]; // label/value rows for the Summary sheet
  filtersDescription: string;
}): Blob {
  const wb = XLSX.utils.book_new();
  const summaryData: ReportRow[] = [
    ['Simple Bill — Report summary'],
    ...args.summaryRows,
    [],
    ['Filters', args.filtersDescription],
    ['Generated', todayISO()],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  const reportSheet = XLSX.utils.aoa_to_sheet([[...args.headers], ...args.rows]);
  XLSX.utils.book_append_sheet(wb, reportSheet, args.sheetName.slice(0, 31));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Helper for tests: build the workbook object without downloading. */
export function buildXlsxWorkbook(args: {
  sheetName: string;
  headers: readonly string[];
  rows: ReportRow[];
  summaryRows: ReportRow[];
  filtersDescription: string;
}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Simple Bill — Report summary'],
    ...args.summaryRows,
    [],
    ['Filters', args.filtersDescription],
    ['Generated', todayISO()],
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...args.headers], ...args.rows]), args.sheetName.slice(0, 31));
  return wb;
}

/**
 * Auditor report PDF — jsPDF, A4 landscape, manual table (no
 * jspdf-autotable, which is not installed). Header row repeats on each
 * new page; footer carries "Page N of M". Money columns are formatted
 * with inrPlain and right-aligned; text cells are left-aligned.
 *
 * Layout lessons from the first version (which used equal column
 * widths, drew only the first wrapped header line, left-aligned
 * numbers, and put the TOTAL row 1mm under its separator so the line
 * struck through the text):
 * - Column widths are proportional (colWidths, scaled to the usable
 *   width), so an invoice number fits on one line and the Customer
 *   column is the widest text column.
 * - The header row draws ALL wrapped lines of EVERY header, and its
 *   height is the tallest header's line count — so "Additional
 *   Charge Label" and "Additional Charge Amount" can never both
 *   collapse to "Additional". Callers may also pass shorter pdfHeaders
 *   (e.g. "Add. Label") — CSV/XLSX headers stay full.
 * - The totals row is separated from its rule by 5mm and gets a light
 *   teal background, so it is unmistakably its own row.
 */
export function buildReportPdfBlob(args: {
  businessName: string;
  reportTitle: string;
  filtersDescription: string;
  headers: readonly string[];
  /** Shorter headers for the PDF only (same length as headers). */
  pdfHeaders?: readonly string[];
  /** Proportional column widths (same length as headers); scaled to fit. */
  colWidths?: readonly number[];
  rows: ReportRow[];
  totalsRow?: ReportRow; // aligned to headers; '' for non-total columns
}): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297;
  const H = 210;
  const M = 10;
  const right = W - M;
  const usable = right - M;
  const nCols = args.headers.length;
  const pdfHeaders = args.pdfHeaders ?? args.headers;
  // Proportional widths, scaled so they sum exactly to the usable width.
  const rawWidths = args.colWidths && args.colWidths.length === nCols
    ? args.colWidths
    : args.headers.map(() => 1);
  const rawTotal = rawWidths.reduce((s, w) => s + w, 0) || 1;
  const colWidths = rawWidths.map((w) => (w / rawTotal) * usable);
  const colX: number[] = [];
  colWidths.reduce((x, w, i) => { colX[i] = x; return x + w; }, M);
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(args.businessName || 'Simple Bill', M, y);
  y += 7;
  doc.setFontSize(11);
  doc.text(args.reportTitle, M, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  for (const line of doc.splitTextToSize(args.filtersDescription, usable)) { doc.text(line, M, y); y += 4; }
  doc.text(`Generated: ${todayISO()}`, M, y);
  y += 4;
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.6);
  doc.line(M, y, right, y);
  y += 6;

  const drawHeaderRow = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const wrapped: string[][] = pdfHeaders.map((h, i) => {
      const parts = doc.splitTextToSize(h, Math.max(8, colWidths[i] - 2));
      return parts.length ? parts : [''];
    });
    const maxLines = Math.max(1, ...wrapped.map((w) => w.length));
    const headerH = maxLines * 4 + 3;
    doc.setFillColor(15, 118, 110);
    doc.rect(M, y - 4, usable, headerH, 'F');
    doc.setTextColor(255, 255, 255);
    wrapped.forEach((lines, i) => {
      lines.forEach((line, li) => doc.text(line, colX[i] + 1, y + 1 + li * 4));
    });
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    y += headerH + 1;
  };

  const drawRow = (row: ReportRow, bold = false, highlight = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    const wrapped: string[][] = row.map((cell, i) => {
      const s = typeof cell === 'number' ? inrPlain(cell) : String(cell);
      const parts = doc.splitTextToSize(s, Math.max(8, colWidths[i] - 2));
      return parts.length ? parts : [''];
    });
    const lines = Math.max(1, ...wrapped.map((w) => w.length));
    const rowH = lines * 4 + 1;
    if (y + rowH > H - 14) {
      doc.addPage();
      y = 14;
      drawHeaderRow();
      // Recompute after the page break (header changed y, not rowH).
    }
    if (highlight) {
      doc.setFillColor(204, 251, 241); // light teal, totals row only
      doc.rect(M, y - 4, usable, rowH + 2, 'F');
    }
    wrapped.forEach((w, i) => {
      w.forEach((line, li) => {
        if (typeof row[i] === 'number') {
          doc.text(line, colX[i] + colWidths[i] - 1, y + li * 4, { align: 'right' });
        } else {
          doc.text(line, colX[i] + 1, y + li * 4);
        }
      });
    });
    y += rowH;
  };

  if (args.rows.length === 0) {
    doc.setFontSize(10);
    doc.text('No invoices match these filters.', M, y);
  } else {
    drawHeaderRow();
    for (const row of args.rows) drawRow(row);
    if (args.totalsRow) {
      // Separator, then a clear gap before the totals row — the old
      // 1mm gap let the rule strike through the totals text.
      if (y > H - 24) { doc.addPage(); y = 14; drawHeaderRow(); }
      doc.setDrawColor(15, 118, 110);
      doc.setLineWidth(0.6);
      doc.line(M, y, right, y);
      y += 5;
      drawRow(args.totalsRow, true, true);
    }
  }

  // Footer page numbers, added after the whole document is built.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Page ${i} of ${pages}`, right, H - 6, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  return doc.output('blob');
}

/**
 * Detailed export filename so files from different reports, filters
 * and periods can be told apart at a glance:
 * simple-bill-<report>-<type>-<status>-<period>-<generated>.<ext>
 * e.g. simple-bill-invoices-tax-final-2026-10-01_to_2026-10-28.pdf
 * Lowercase, hyphens only, no spaces. Invoice PDFs (INV-....pdf) are
 * untouched by this — it applies to report exports only.
 */
export function reportFilename(
  report: string,
  ext: 'csv' | 'xlsx' | 'pdf',
  filters: ReportFilters,
): string {
  const typeSlug = filters.type === 'ALL' ? 'all-types' : filters.type === 'TAX' ? 'tax' : 'non-tax';
  const statusSlug = filters.status === 'ALL' ? 'all-statuses' : filters.status.toLowerCase();
  const from = (filters.from ?? '').trim();
  const to = (filters.to ?? '').trim();
  const period = !from && !to ? 'all-dates' : `${from || 'open'}_to_${to || 'open'}`;
  return `simple-bill-${report}-${typeSlug}-${statusSlug}-${period}-${todayISO()}.${ext}`;
}

/**
 * Generic file sharing (native share sheet — on Android this lists
 * WhatsApp and other installed apps). Mirrors pdf.ts's sharePdf
 * contract: 'cancelled' (AbortError) downloads nothing; anything else
 * unsupported is left to the caller (download + explanation). A wa.me
 * link cannot attach files, so it is deliberately not used.
 */
export async function shareFile(
  blob: Blob,
  filename: string,
  mimeType: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const file = new File([blob], filename, { type: mimeType });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[] }) => Promise<void> };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      return 'unsupported';
    }
  }
  return 'unsupported';
}
