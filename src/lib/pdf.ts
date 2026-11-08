import { jsPDF } from 'jspdf';
import type { Invoice } from './types';
import { inrPlain } from './format';
import { fmtDate } from './format';
import { amountInWords } from './words';
import { isSystemNote } from './systemNote';
import { PRINT_INK } from './printStyles';

/**
 * A4 invoice PDF via jsPDF. Tax wording/columns appear ONLY for TAX
 * invoices; non-tax bills contain no GST/CGST/SGST/IGST/taxable text.
 * Throws on failure so the caller can show a recoverable error.
 */
/**
 * A phone value that is really "no phone": an empty field, or a dummy
 * "0"/"1" typed in by mistake (seen on real invoices). Display-only:
 * the stored value is never deleted or changed by the PDF.
 */
function displayPhone(phone: string | undefined): string {
  const p = (phone ?? '').trim();
  return p === '' || p === '0' || p === '1' ? '' : p;
}

export function buildInvoicePdf(invoice: Invoice): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 14;
  const right = W - M;
  const maxW = right - M;
  let y = 16;
  const b = invoice.businessSnapshot;
  const c = invoice.customerSnapshot;
  const isTax = invoice.invoiceType === 'TAX';

  // Every free-text block goes through writeWrapped: split on embedded
  // newlines first, then wrap each line to the page width, advancing y
  // by the wrapped line count. The old code drew each block with one
  // doc.text() and a fixed y += 4.5, so a long address, phone and GSTIN
  // printed on top of each other. A page break is taken before a block
  // whenever the next line would run past the bottom of the page.
  const ensurePage = (needed: number) => {
    if (y + needed > 265) { doc.addPage(); y = 16; }
  };
  const wrappedLines = (text: string, width = maxW): string[] => {
    const out: string[] = [];
    for (const raw of text.split('\n')) {
      const parts = doc.splitTextToSize(raw, width);
      // splitTextToSize returns [''] for an empty line; keep one blank line.
      out.push(...(parts.length ? parts : ['']));
    }
    return out;
  };
  const writeWrapped = (text: string, lineHeight = 4.5, width = maxW) => {
    for (const l of wrappedLines(text, width)) {
      ensurePage(lineHeight);
      doc.text(l, M, y); y += lineHeight;
    }
  };
  const writeBlock = (texts: string[], lineHeight = 4.5, width = maxW) => {
    for (const t of texts) {
      if (t) writeWrapped(t, lineHeight, width);
    }
  };

  // Header
  let headerWidth = maxW;
  if (b.logo) {
    try {
      const image = doc.getImageProperties(b.logo);
      const scale = Math.min(28 / image.width, 20 / image.height);
      doc.addImage(b.logo, image.fileType, right - image.width * scale, y - 3, image.width * scale, image.height * scale);
      headerWidth -= 34;
    } catch { /* An unsupported decorative logo must not prevent invoice printing. */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  writeWrapped(b.businessName || 'Simple Bill', 7, headerWidth);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const headerLines: string[] = [];
  if (b.proprietorName) headerLines.push(`Proprietor: ${b.proprietorName}`);
  if (b.address) headerLines.push(b.address);
  const bPhone = displayPhone(b.phone);
  const contact = [bPhone ? `Ph: ${bPhone}` : '', b.email].filter(Boolean).join('  |  ');
  if (contact) headerLines.push(contact);
  if (isTax && b.gstin) headerLines.push(`GSTIN: ${b.gstin}`);
  writeBlock(headerLines, 4.5, headerWidth);
  y += 2;
  doc.setDrawColor(...PRINT_INK);
  doc.setLineWidth(0.8);
  doc.line(M, y, right, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(isTax ? 'TAX INVOICE' : 'BILL', M, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Status: ${invoice.status}`, right, y, { align: 'right' });
  y += 6;
  writeBlock([`Invoice No: ${invoice.invoiceNumber}`, `Date: ${fmtDate(invoice.issueDate)}`, invoice.dueDate ? `Due: ${fmtDate(invoice.dueDate)}` : '']);
  y += 4;

  // Customer block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  ensurePage(10);
  doc.text('Bill To', M, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const cPhone = displayPhone(c.phone);
  const custLines = [c.name, c.billingAddress, cPhone ? `Ph: ${cPhone}` : '', c.email,
    isTax && c.gstin ? `GSTIN: ${c.gstin}` : '', c.state ? `State: ${c.state}` : ''].filter(Boolean);
  writeBlock(custLines);
  y += 4;

  // Items table (manual, page-break aware). Column order, as the
  // operator asked: # | Item | Qty | Rate | Total | Tax | Net Total
  // (tax invoices) and # | Item | Qty | Rate | Total | Net Total
  // (bills). Total is lineSubtotal — qty × unit price, before discount
  // and tax — and Net Total is lineTotal, so a line reconciles visibly:
  // Total − Discount + Tax = Net Total. A4 portrait, M=14, right=196.
  //
  // Geometry (all in mm, right edges for numeric columns):
  //   # left 15, Item left 22 width 70 (22–92), Qty left 92 width 18
  //   (92–110, fits "1000 NOS" at 9pt).
  //   TAX: Rate right 132 (22 wide), Total right 154 (22 wide),
  //        Tax right 176 (22 wide), Net Total right 196 (20 wide).
  //   NON_TAX: Rate right 132 (22 wide), Total right 164 (32 wide),
  //        Net Total right 196 (32 wide).
  // Every numeric cell AND its header is right-aligned to its column's
  // right edge. The previous layout left-aligned Tax while right-aligning
  // Amount into the same ~24mm gap, so e.g. Tax "4,725.00" (starting at
  // 172) and Net Total "30,975.00" (ending at 196, starting ~181)
  // printed on top of each other. With right edges, each amount lives
  // inside its own column: e.g. for qty 900 × rate 54, Total "48,600.00"
  // (~15mm) occupies 139–154, Tax "8,748.00" (~13mm) occupies 163–176,
  // Net "57,348.00" (~14mm) occupies 182–196 — gaps of 9mm and 6mm.
  // Even a 1,00,000+ net ("1,00,000.00", ~17mm at 9pt) occupies only
  // 179–196, leaving a ~3mm gap from Tax's right edge at 176.
  // The Item wrap width (68 = 70 − 2 padding) MUST match the Item
  // column width; the old hardcoded 88/100mm wrap let long names run
  // into Qty once the Item column was narrowed.
  const ITEM_X = 22;
  const ITEM_W = 70;
  const QTY_X = 92;
  const TAX_RIGHTS = { rate: 132, total: 154, tax: 176, net: 196 };
  const NOTAX_RIGHTS = { rate: 132, total: 164, net: 196 };
  const numberCell = (text: string, edge: number, width: number, size = 9) => {
    doc.setFontSize(size);
    const textWidth = doc.getTextWidth(text);
    doc.setFontSize(Math.min(size, size * (width - 2) / Math.max(textWidth, 1)));
    doc.text(text, edge, y, { align: 'right' });
    doc.setFontSize(size);
  };
  const drawHeader = () => {
    ensurePage(12);
    doc.setFillColor(...PRINT_INK);
    doc.rect(M, y - 4, right - M, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('#', M + 1, y + 1);
    doc.text('Item', ITEM_X, y + 1);
    doc.text('Qty', QTY_X, y + 1);
    if (isTax) {
      doc.text('Rate', TAX_RIGHTS.rate, y + 1, { align: 'right' });
      doc.text('Total', TAX_RIGHTS.total, y + 1, { align: 'right' });
      doc.text('Tax', TAX_RIGHTS.tax, y + 1, { align: 'right' });
      doc.text('Net Total', TAX_RIGHTS.net, y + 1, { align: 'right' });
    } else {
      doc.text('Rate', NOTAX_RIGHTS.rate, y + 1, { align: 'right' });
      doc.text('Total', NOTAX_RIGHTS.total, y + 1, { align: 'right' });
      doc.text('Net Total', NOTAX_RIGHTS.net, y + 1, { align: 'right' });
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    y += 8;
  };
  drawHeader();
  invoice.lineItems.forEach((item, i) => {
    doc.setFontSize(9);
    // System-note descriptions ("Price is dynamic…", "Selling price
    // not supplied…") are Products-screen instructions, not invoice
    // content: omit them here so already-saved invoices with the old
    // note also print cleanly. Genuine descriptions still print.
    const desc = item.description && !isSystemNote(item.description) ? item.description : '';
    const name = desc ? `${item.productName} - ${desc}` : item.productName;
    const wrapped: string[] = doc.splitTextToSize(name, ITEM_W - 2);
    if (isTax) wrapped.push(...doc.splitTextToSize([item.hsnSacCode ? `HSN/SAC: ${item.hsnSacCode}` : '', `GST: ${item.taxRate}%`].filter(Boolean).join(' | '), ITEM_W - 2));
    const quantity: string[] = doc.splitTextToSize(`${item.quantity} ${item.unit}`, 16);
    const lineCount = Math.max(wrapped.length, quantity.length);
    const rowH = Math.max(6, lineCount * 4.5);
    const extraH = item.lineDiscount > 0 ? 4.5 : 0;
    // Keep ordinary rows whole, but continue exceptionally long descriptions
    // across pages. Monetary values print exactly once, in the first segment.
    if (y + rowH + extraH > 265 && rowH + extraH < 241) { doc.addPage(); y = 16; drawHeader(); }
    let offset = 0;
    while (offset < lineCount) {
      if (y + 4.5 > 265) { doc.addPage(); y = 16; drawHeader(); }
      const count = Math.min(lineCount - offset, Math.max(1, Math.floor((265 - y) / 4.5)));
      doc.text(String(i + 1), M + 1, y);
      wrapped.slice(offset, offset + count).forEach((text, n) => doc.text(text, ITEM_X, y + n * 4.5));
      quantity.slice(offset, offset + count).forEach((text, n) => doc.text(text, QTY_X, y + n * 4.5));
      if (offset === 0) {
        const edges = isTax ? TAX_RIGHTS : NOTAX_RIGHTS;
        numberCell(inrPlain(item.unitPrice), edges.rate, 22);
        numberCell(inrPlain(item.lineSubtotal), edges.total, isTax ? 22 : 32);
        if (isTax) numberCell(inrPlain(item.lineTax), TAX_RIGHTS.tax, 22);
        numberCell(inrPlain(item.lineTotal), right, isTax ? 20 : 32);
      }
      y += Math.max(6, count * 4.5);
      offset += count;
    }
    if (item.lineDiscount > 0) {
      // Drawn on its own line BELOW the row (y has already advanced past
      // the wrapped name) and y advances again, so it can never overlap
      // the next row. The old code drew it at y - 1 without advancing y,
      // which put it 1mm above the next row's baseline.
      if (y + extraH > 265) { doc.addPage(); y = 16; drawHeader(); }
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Discount: ${inrPlain(item.lineDiscount)}`, ITEM_X, y);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      y += extraH;
    }
  });
  // HSN-wise tax summary (tax invoices only, only when some line has an
  // HSN) — mirrors the printed HSN tax table: taxable value with the
  // Central/State tax split, or IGST for inter-state invoices.
  const hsnRows = hsnTaxSummary(invoice);
  if (hsnRows.length) {
    if (y > 240) { doc.addPage(); y = 16; }
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('HSN-wise Tax Summary', M, y);
    y += 6;
    const kind = invoice.taxBreakdown.kind;
    const drawHsnHeader = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(...PRINT_INK);
      doc.rect(M, y - 4, right - M, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8.5);
      doc.text('HSN/SAC', M + 1, y + 1);
      doc.text('Taxable Value', 118, y + 1, { align: 'right' });
      if (kind === 'CGST_SGST') {
        doc.text('CGST', 152, y + 1, { align: 'right' });
        doc.text('SGST', right, y + 1, { align: 'right' });
      } else if (kind === 'IGST') {
        doc.text('IGST', right, y + 1, { align: 'right' });
      } else {
        doc.text('GST', right, y + 1, { align: 'right' });
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      y += 8;
    };
    drawHsnHeader();
    for (const row of hsnRows) {
      if (y + 5.5 > 265) { doc.addPage(); y = 16; drawHsnHeader(); }
      doc.text(row.hsn, M + 1, y);
      doc.text(inrPlain(row.taxable), 118, y, { align: 'right' });
      if (kind === 'CGST_SGST') {
        doc.text(inrPlain(row.cgst), 152, y, { align: 'right' });
        doc.text(inrPlain(row.sgst), right, y, { align: 'right' });
      } else if (kind === 'IGST') {
        doc.text(inrPlain(row.igst), right, y, { align: 'right' });
      } else {
        doc.text(inrPlain(row.gst), right, y, { align: 'right' });
      }
      y += 5.5;
    }
    y += 2;
  }
  y += 2;
  ensurePage(65);
  doc.setDrawColor(200, 200, 200);
  doc.line(M, y, right, y);
  y += 7;

  // Totals
  doc.setFontSize(9);
  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const size = doc.getFontSize();
    const labelLines: string[] = doc.splitTextToSize(label, 58);
    labelLines.forEach((text, i) => {
      ensurePage(5.5);
      doc.text(text, right - 90, y);
      if (i === 0) numberCell(value, right, 30, size);
      y += 5.5;
    });
  };
  totalRow('Subtotal', inrPlain(invoice.subtotal));
  if (invoice.discountAmount > 0) totalRow('Discount', `- ${inrPlain(invoice.discountAmount)}`);
  if (isTax) {
    totalRow('Taxable Value', inrPlain(invoice.taxableAmount));
    const tb = invoice.taxBreakdown;
    if (tb.kind === 'CGST_SGST') {
      totalRow('CGST', inrPlain(tb.cgst));
      totalRow('SGST', inrPlain(tb.sgst));
    } else if (tb.kind === 'IGST') {
      totalRow('IGST', inrPlain(tb.igst));
    } else if (tb.kind !== 'NONE') {
      totalRow('GST', inrPlain(tb.gst));
    }
  }
  const charge = invoice.additionalChargeAmount ?? 0;
  if (charge > 0) totalRow(invoice.additionalChargeLabel?.trim() || 'Additional charge', inrPlain(charge));
  doc.setDrawColor(...PRINT_INK);
  doc.setLineWidth(0.6);
  doc.line(right - 70, y, right, y);
  y += 6;
  doc.setFontSize(12);
  totalRow('Grand Total', `Rs. ${inrPlain(invoice.grandTotal)}`, true);
  y += 2;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'italic');
  writeWrapped(amountInWords(invoice.grandTotal), 4.5);
  y += 6;

  if (invoice.notes) {
    ensurePage(10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Notes', M, y); y += 5;
    doc.setFont('helvetica', 'normal');
    writeWrapped(invoice.notes);
    y += 3;
  }
  if (invoice.termsAndConditions) {
    ensurePage(10);
    doc.setFont('helvetica', 'bold'); doc.text('Terms & Conditions', M, y); y += 5;
    doc.setFont('helvetica', 'normal');
    writeWrapped(invoice.termsAndConditions);
    y += 3;
  }
  const payLines = [
    [b.bankName ? `Bank: ${b.bankName}` : '', b.accountHolderName ? `Account Holder: ${b.accountHolderName}` : ''].filter(Boolean).join(' | '),
    [b.accountNumber ? `Account No: ${b.accountNumber}` : '', b.ifsc ? `IFSC: ${b.ifsc}` : ''].filter(Boolean).join(' | '),
    b.upiId ? `UPI: ${b.upiId}` : '',
  ].filter(Boolean);
  if (payLines.length) {
    // Keep ordinary payment details together; very long custom values can
    // still continue through writeWrapped rather than overflowing a page.
    ensurePage(Math.min(249, 5 + payLines.reduce((height, text) => height + wrappedLines(text).length * 4.5, 0)));
    doc.setFont('helvetica', 'bold'); doc.text('Payment Details', M, y); y += 5;
    doc.setFont('helvetica', 'normal');
    writeBlock(payLines);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(isTax ? 'System-generated invoice record. Not a GST filing document.' : 'System-generated bill record.', M, 281);
    doc.text(`Page ${page} of ${pages}`, right, 281, { align: 'right' });
  }

  return doc.output('blob');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface HsnTaxRow { hsn: string; taxable: number; cgst: number; sgst: number; igst: number; gst: number }

/**
 * HSN-wise tax summary for a TAX invoice, grouped by the line items'
 * HSN/SAC codes. CGST/SGST are allocated so the column totals match the
 * invoice's own CGST/SGST exactly (last group takes the remainder, so no
 * paise drift). Returns [] when there is no HSN on any line, or the
 * invoice is not a tax invoice / has no tax breakdown to summarise.
 */
export function hsnTaxSummary(invoice: Invoice): HsnTaxRow[] {
  if (invoice.invoiceType !== 'TAX') return [];
  const kind = invoice.taxBreakdown.kind;
  if (kind === 'NONE') return [];
  const groups = new Map<string, { taxable: number; tax: number }>();
  for (const item of invoice.lineItems) {
    const hsn = (item.hsnSacCode || '').trim();
    // Unknown HSNs participate in allocation but do not print as known codes.
    const g = groups.get(hsn) ?? { taxable: 0, tax: 0 };
    g.taxable = Math.round((g.taxable + item.lineTaxable) * 100) / 100;
    g.tax = Math.round((g.tax + item.lineTax) * 100) / 100;
    groups.set(hsn, g);
  }
  if (groups.size === 0) return [];
  const rows: HsnTaxRow[] = [];
  const entries = [...groups.entries()];
  let cgstUsed = 0;
  let sgstUsed = 0;
  entries.forEach(([hsn, g], idx) => {
    const last = idx === entries.length - 1;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let gst = 0;
    if (kind === 'CGST_SGST') {
      cgst = last ? Math.round((invoice.taxBreakdown.cgst - cgstUsed) * 100) / 100
        : Math.round((g.tax / 2) * 100) / 100;
      sgst = Math.round((g.tax - cgst) * 100) / 100;
      if (last) sgst = Math.round((invoice.taxBreakdown.sgst - sgstUsed) * 100) / 100;
      cgstUsed += cgst;
      sgstUsed += sgst;
    } else if (kind === 'IGST') {
      igst = g.tax;
    } else if (kind === 'GST') {
      gst = g.tax;
    }
    if (hsn) rows.push({ hsn, taxable: g.taxable, cgst, sgst, igst, gst });
  });
  return rows;
}

export async function sharePdf(invoice: Invoice): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const blob = buildInvoicePdf(invoice);
  const file = new File([blob], `${invoice.invoiceNumber}.pdf`, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[] }) => Promise<void> };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      // Cancelling the share sheet is NOT a download trigger: the user
      // chose nothing, so nothing is downloaded. Other share failures
      // (e.g. insecure context) are genuinely unsupported.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      return 'unsupported';
    }
  }
  // Caller decides what to do on 'unsupported' (download + explanation);
  // sharePdf itself must not silently download after a share attempt.
  return 'unsupported';
}
