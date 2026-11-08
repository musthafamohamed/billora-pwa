import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildReportPdfBlob, buildXlsxWorkbook, escapeCsvCell, reportFilename, toCsv } from './reportExport';

describe('printed report completeness', () => {
  it('includes the same net totals summary even when no rows match', async () => {
    const blob = buildReportPdfBlob({ businessName: 'Sample Business', reportTitle: 'Item-wise Report', filtersDescription: 'Type: Without Tax', headers: ['Item', 'Total'], rows: [], summaryRows: [['Invoices', '0'], ['Additional Charges', 0], ['Grand Total', 0]] });
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    expect(text).toContain('Net totals for the selected filters');
    expect(text).toContain('Additional Charges');
    expect(text).toContain('Grand Total');
    expect(text).toContain('No invoices match');
  });

  it('keeps a large grand total in one numeric cell instead of splitting its digits', async () => {
    const headers = ['Invoice No', 'Date', 'Type', 'Status', 'Customer', 'Subtotal', 'Discount', 'Taxable', 'CGST', 'SGST', 'IGST', 'GST', 'Add. Label', 'Add. Amt', 'Grand Total'];
    const blob = buildReportPdfBlob({ businessName: 'Sample', reportTitle: 'Invoice Summary', filtersDescription: 'All dates', headers, colWidths: [24,20,18,16,32,19,17,19,15,15,15,15,17,17,18], rows: [['INV-2026-0001', '', 'Bill', 'FINAL', 'Customer', 1347300, 1800, 1345500, 0, 0, 0, 0, 'Delivery', 1000, 1467595]], totalsRow: ['', '', '', '', 'TOTAL', 1347300, 1800, 1345500, 0, 0, 0, 0, '', 1000, 1467595] });
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    expect(text).toContain('(14,67,595.00) Tj');
  });

  it('continues an oversized text cell across pages without clipping it', async () => {
    const blob = buildReportPdfBlob({ businessName: 'Sample', reportTitle: 'Item-wise Report', filtersDescription: 'All dates', headers: ['Item', 'Total'], rows: [[Array.from({length: 100}, (_,i) => `Item description ${i + 1}`).join('\n'), 118]] });
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    expect(text).toContain('Item description 100');
    const ys = [...text.matchAll(/[-\d.]+ ([-\d.]+) Td/g)].map(m => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThan(15);
  });
});

describe('CSV', () => {
  it('escapes commas, quotes and newlines, and prefixes a BOM', () => {
    expect(escapeCsvCell('Acme, "Quoted"\nTraders')).toBe('"Acme, ""Quoted""\nTraders"');
    expect(escapeCsvCell('plain')).toBe('plain');
    const csv = toCsv(['Customer', 'Total'], [['Acme, "Quoted"\nTraders', 118]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Acme, ""Quoted""\nTraders",118');
  });
});

describe('XLSX', () => {
  it('has Summary + report sheets and round-trips rows', () => {
    const wb = buildXlsxWorkbook({
      sheetName: 'Invoices',
      headers: ['Invoice No', 'Grand Total'],
      rows: [['INV-2026-0001', 118]],
      summaryRows: [['Grand Total', 118]],
      filtersDescription: 'Type: All types',
    });
    expect(wb.SheetNames).toEqual(['Summary', 'Invoices']);
    const sheet = wb.Sheets['Invoices'];
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })).toEqual([
      ['Invoice No', 'Grand Total'],
      ['INV-2026-0001', 118],
    ]);
    // Full write/read round-trip through the real xlsx writer.
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const back = XLSX.read(buf, { type: 'array' });
    expect(back.SheetNames).toEqual(['Summary', 'Invoices']);
  });
});

describe('reportFilename', () => {
  it('encodes report, type, status and period so files can be told apart', () => {
    expect(reportFilename('invoices', 'pdf', { type: 'TAX', status: 'FINAL', from: '2026-10-01', to: '2026-10-28' }))
      .toMatch(/^simple-bill-invoices-tax-final-2026-10-01_to_2026-10-28-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(reportFilename('items', 'csv', { type: 'ALL', status: 'ALL', from: '', to: '' }))
      .toMatch(/^simple-bill-items-all-types-all-statuses-all-dates-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(reportFilename('hsn-wise', 'xlsx', { type: 'NON_TAX', status: 'DRAFT', from: '2026-10-01', to: '' }))
      .toMatch(/^simple-bill-hsn-wise-non-tax-draft-2026-10-01_to_open-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

describe('report PDF', () => {
  const args = {
    businessName: 'Test Business', reportTitle: 'Invoice Summary Report',
    filtersDescription: 'Type: All types · Status: All statuses · Period: All dates',
    headers: ['Invoice No', 'Customer', 'Grand Total'] as const,
    rows: [['INV-2026-0001', 'Acme Traders', 118]] as (string | number)[][],
    totalsRow: ['', 'TOTAL', 118] as (string | number)[],
  };
  it('returns a non-empty PDF blob for a small dataset', () => {
    const blob = buildReportPdfBlob(args);
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe('application/pdf');
  });
  it('returns a non-empty PDF blob for an empty dataset', () => {
    const blob = buildReportPdfBlob({ ...args, rows: [], totalsRow: undefined });
    expect(blob.size).toBeGreaterThan(500);
    expect(blob.type).toBe('application/pdf');
  });
  it('keeps invoice numbers whole, distinct Additional headers, and a separate TOTAL row', async () => {
    const headers = [
      'Invoice No', 'Date', 'Type', 'Status', 'Customer', 'Subtotal', 'Discount',
      'Taxable Value', 'CGST', 'SGST', 'IGST', 'GST',
      'Additional Charge Label', 'Additional Charge Amount', 'Grand Total',
    ] as const;
    const pdfHeaders = [
      'Invoice No', 'Date', 'Type', 'Status', 'Customer', 'Subtotal', 'Discount',
      'Taxable', 'CGST', 'SGST', 'IGST', 'GST', 'Add. Label', 'Add. Amt', 'Grand Total',
    ] as const;
    const row = ['INV-2026-0001', '2026-10-28', 'Tax Invoice', 'FINAL', 'DR ABDUL NASAR POOKAYIL',
      36900, 0, 36900, 0, 0, 0, 6642, '', 0, 43542] as (string | number)[];
    const blob = buildReportPdfBlob({
      businessName: 'PM SONS ENTERPRISES', reportTitle: 'Invoice Summary Report',
      filtersDescription: 'Type: All types · Status: All statuses · Period: All dates',
      headers, pdfHeaders, colWidths: [24, 20, 18, 16, 32, 19, 17, 19, 15, 15, 15, 15, 17, 17, 18],
      rows: [row],
      totalsRow: ['', '', '', '', 'TOTAL', 36900, 0, 36900, 0, 0, 0, 6642, '', 0, 43542],
    });
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    // Whole invoice number (the old equal-width layout wrapped it to two lines).
    expect(text).toContain('INV-2026-0001');
    // Both Additional headers are distinct in the PDF (old code drew
    // only the first wrapped line of each, so both read "Additional").
    expect(text).toContain('Add. Label');
    expect(text).toContain('Add. Amt');
    // Long customer name is present (wrapped over lines, not lost).
    expect(text).toContain('POOKAYIL');
    // Totals row is present as its own row.
    expect(text).toContain('TOTAL');
    expect(text).toContain('43,542.00');
  });
});
