# Simple Bill

Billora now includes a **Phase 2 authentication pilot**. The default entry supports
Firebase email/password sign-in and session restoration, but every business
workspace remains blocked pending trusted membership and tenant-scoped storage.
Authentication never exposes or adopts the existing local billing database.

The original mobile-first offline billing app remains available through
`npm run dev:legacy` on a separate development origin. Its data stays in that
browser's IndexedDB; no legacy migration or cloud synchronization is implemented.
The legacy flag is ignored in production builds. No live deployment or Firebase
rule/billing change is part of Phase 2.

See [Phase 2 setup and session policy](docs/architecture/PHASE_2_AUTH_SESSION.md),
[implementation results](docs/implementation/PHASE_2_IMPLEMENTATION_REPORT.md), and
[dependency assessment](docs/security/PHASE_2_DEPENDENCY_ASSESSMENT.md).

Original code and design. Inspired only in general layout feel (compact dashboard,
large quick actions, bottom navigation) by a personal-finance dashboard; no brand,
source code, assets, or content were copied from anywhere.

## Legacy billing features (development mode)

- **Dashboard** — greeting/business name, this-month total and count, outstanding
  amount (final invoices that have a due date, labelled as such), recent invoices,
  quick actions, and a first-time empty state with a setup path.
- **Create Invoice** — Tax Invoice / Without Tax segmented control, invoice number
  and dates, customer selector with search, an **Add New Customer** sheet that
  auto-selects the new customer without losing the draft, product picker (max 7
  active products), custom one-off line items (never added to the catalogue),
  per-line quantity / price / discount / GST-rate overrides, sticky totals footer,
  Save Draft and Finalize. Drafts autosave to IndexedDB while editing.
- **Customers** — search by name or phone, add/edit, duplicate-phone warning
  (warns, does not block), GSTIN format checked only when supplied, detail view
  with that customer's invoice history.
- **Products** — at most **7 active products** (hard business rule). The screen
  shows "N of 7 products active", disables Add at 7 with an explanation, and
  deactivates rather than deletes products used in an invoice.
- **Invoice History** — mobile cards (no wide tables), search by number/customer,
  filters by type and status, newest first. Detail view has a full preview,
  PDF download, print, Web Share API sharing with a download fallback,
  duplicate-into-new-draft, and cancel with confirmation. Final invoices are
  never destructively edited.
- **Settings / Business Profile** — business details, GST settings, invoice
  prefix, default tax rate, terms, bank/UPI details, optional logo upload,
  JSON backup export and validated restore (with confirmation before replacing
  data), an **Install app** section with a real Install button and live install
  checks, a **Light / Dark** appearance toggle, and a clearly-labelled optional
  "Load demo data" button (capped at 7 active products, never duplicating a
  product name). No demo data is loaded by default.
- **First run** — a short welcome screen asks for business name and phone
  (GSTIN, address, default tax rate optional). It can always be skipped.

## What's new in v1.8.1 (build 2026-10-28)

- **Invoice PDF Tax/Net Total overlap fixed.** The items table used to left-align Tax while right-aligning Amount into the same gap, so Tax "4,725.00" and Net Total "30,975.00" printed on top of each other (INV-2026-0005). Every numeric column is now defined by a right edge and right-aligned to it: TAX — # left 15, Item left 22 width 70, Qty left 92, Rate right 132, Total right 154, Tax right 176, Net Total right 196; NON_TAX — Rate right 132, Total right 164, Net Total right 196. The Item column is narrowed to 70mm (from ~90mm) and names wrap at 68mm (width − padding), so long names no longer run into Qty. The discount line now sits on its own line below a wrapped name with y advanced, instead of 1mm above the next row.
- **Invoice PDF columns renamed.** Items now print `# | Item | Qty | Rate | Total | Tax | Net Total` (tax invoices) and `# | Item | Qty | Rate | Total | Net Total` (bills), where Total = qty × unit price before discount/tax and Net Total = line total after discount and tax (after discount for bills). This rename is PDF-only: CSV/XLSX/report headers are unchanged.

## What's new in v1.8.0 (build 2026-10-28)

- **Report PDF layout fixed.** Report PDFs now use proportional column widths (invoice number fits on one line, Customer is the widest text column), draw every wrapped header line (so "Add. Label" and "Add. Amt" can never both collapse to "Additional"), right-align all numbers, and give the TOTAL row a 5mm gap from its separator plus a light teal background.
- **Detailed export filenames.** Every report export is now named `simple-bill-<report>-<type>-<status>-<period>-<generated>.<ext>` — e.g. `simple-bill-invoices-tax-final-2026-10-01_to_2026-10-28.pdf` (type: all-types/tax/non-tax; status: all-statuses/draft/final/cancelled; period: all-dates or `YYYY-MM-DD_to_YYYY-MM-DD`, with a missing end shown as `open`). Invoice PDFs (`INV-….pdf`) are unchanged.
- **HSN-wise now covers bills too.** The HSN-wise report used to include only tax invoices, so a bill's HSN never appeared. It now includes tax invoices and bills (tax columns 0 for bills), groups by HSN + tax rate (with a Tax Rate % column), and recovers an old invoice's HSN from the product catalogue when the saved line has none — without changing any stored invoice. Lines whose product has no HSN are still excluded. The invoice PDF's own HSN table stays tax-only.
- **Share buttons for reports.** Reports now has Share CSV, Share XLSX and Share PDF next to the Export buttons, using the native share sheet (WhatsApp on Android over HTTPS). Cancelling downloads nothing; on a plain-HTTP address the file downloads and the same prominent amber warning card as invoice PDFs explains the WhatsApp manual steps.
- **Tax Split is remembered.** The last Tax Split chosen in the editor is saved (localStorage) and becomes the default for the next new invoice, until changed again. Editing an existing invoice still starts from that invoice's own stored split.
- **Invoice PDF item columns.** Tax invoices now print `# | Item | Qty | Rate | Qty×Rate | Tax | Amount` and bills `# | Item | Qty | Rate | Qty×Rate | Amount`, where Qty×Rate is qty × unit price before discount and tax, so a line reconciles as Qty×Rate − Discount + Tax = Amount (discounts still shown under discounted lines).
- **System notes no longer print on invoices.** A product's instructional description ("Price is dynamic…", "Selling price not supplied…") is no longer copied into invoice lines, and the invoice PDF omits such descriptions even on already-saved invoices. Genuine descriptions still print, and the Products screen keeps its own descriptions.
- **Zero price/quantity cannot be finalized.** A line with price ₹0 cannot be finalized — it means the price was never entered (dynamic-price gums start at ₹0, so the operator must type a price on each invoice). Finalizing lists the offending items by name ("Price not entered for: …", "Quantity not entered for: …"). Save Draft still allows incomplete lines, and lines with price or quantity 0 show an amber inline hint in the editor.

## What's new in v1.5.0 (build 2026-10-28)

- **Version stamp.** Settings now shows "Simple Bill v1.5.0 — build 2026-10-28" at the bottom. The screenshots the user sent on 2026-10-28 showing "Phone *" and teal for both invoice types were an older build — after updating, check that Settings shows v1.5.0; if it still shows the old screens, the phone is still serving the cached old build.
- **PDF alignment fixed.** Every free-text block in the PDF (business name, address, contact, GSTIN; customer name, address, phone, email, GSTIN, state; notes, terms, payment details) is now wrapped with `splitTextToSize` and the cursor advances by the wrapped line count, with a page break before a block that would run off the page. A long PM Sons address no longer overlaps the phone/GSTIN lines. A phone of exactly "0" or "1" is treated as empty for PDF display only (the stored value is untouched) — it no longer prints as "Ph: 0".
- **Additional charges (Rent etc.).** An invoice-level "Additional charges" section in the editor: label defaults to "Rent" and is editable (e.g. "Vehicle Charge"), amount ≥ 0. Formula, exactly: TAX grand total = (subtotal − discounts) + tax + charge; NON_TAX grand total = subtotal − discounts + charge. The charge row (with its label) appears in the totals footer, the invoice detail, and the PDF, and the amount in words uses the new grand total. Old invoices/backups without these fields import as charge 0.
- **Discount clears on switching off.** Changing a line's discount type to "No discount" immediately resets its Discount ₹ value to 0, so no stale value is left behind.
- **Tax split option.** On TAX invoices the editor now offers: Auto (state-based default — same state → CGST + SGST, different states → IGST, missing state → one combined GST line), CGST + SGST, IGST, or Combined GST. The choice is stored on the invoice and used by the editor totals, the detail view, and the PDF (which uses the stored breakdown, never recomputes from states). So a Kerala customer with no state entered can still get separate CGST/SGST rows by choosing "CGST + SGST". The default is unchanged: Auto still behaves as before.

### Updating on your phone

The user's latest screenshots were the **old build**, so after unzipping the new source, restart the dev server (or redeploy) and open Settings: it must show **v1.5.0**. If it does not, the phone is still serving the cached old build — restart the server, hard-refresh, or remove and re-add the PWA, then check the version stamp again before reporting that a fix "didn't work".

## Tax logic (Indian GST, simplified)

Totals are always computed from line items, never typed. Per line:
`subtotal = qty × price`, minus discount = taxable amount, `tax = taxable × rate`,
rounded half-up to 2 decimals. For a Tax Invoice, when both the business state
and the customer state are present: same state → CGST = SGST = tax ÷ 2 (split so
the two parts sum exactly to the tax total); different states → IGST. When either
state is missing, one combined GST line is shown — CGST/SGST are never faked.
For a Non-Tax Bill, no GST/CGST/SGST/IGST/taxable wording or tax column appears
anywhere in the app or the PDF, and grand total = subtotal − discounts.

> Simple Bill is an invoice maker, **not** tax-compliance or GST-filing software.
> It does not file returns, validate GSTINs against government records, or
> guarantee compliance. Check tax obligations with your accountant.

## Data model (all in IndexedDB via Dexie, database `simple-bill-db`)

- `BusinessProfile` — businessName, proprietorName, phone, email, address, gstin
  (optional), state, stateCode (optional), invoicePrefix, defaultTaxRate,
  logo (optional local image, stored as a data URL), bankName,
  accountHolderName, accountNumber, IFSC, upiId, termsAndConditions.
  Stored in the `meta` table under key `profile`.
- `Product` — id, name, description?, unit, sellingPrice, defaultTaxRate,
  hsnSacCode?, isActive, createdAt, updatedAt.
- `Customer` — id, name, phone, email?, billingAddress?, gstin?, state?,
  notes?, createdAt, updatedAt.
- `Invoice` — id, invoiceNumber, invoiceType (`TAX` | `NON_TAX`), status
  (`DRAFT` | `FINAL` | `CANCELLED`), issueDate, dueDate?, customerId,
  customerSnapshot, businessSnapshot, lineItems, subtotal, discountAmount,
  taxableAmount, taxBreakdown, totalTax, additionalChargeLabel?,
  additionalChargeAmount?, taxSplit? (`AUTO` | `CGST_SGST` | `IGST` | `GST`),
  grandTotal, notes?, termsAndConditions?, createdAt, updatedAt.
- `InvoiceLineItem` — id, productId?, productName, description?, unit, quantity,
  unitPrice, discountType (`NONE` | `PERCENTAGE` | `FIXED`), discountValue,
  taxRate, lineSubtotal, lineDiscount, lineTaxable, lineTax, lineTotal.

**Snapshots are the point:** every saved invoice embeds full copies of the
customer, the business profile, and each line item. Editing a product, customer,
or business profile afterwards never changes an existing invoice. Invoice
numbers are deterministic and local: `{PREFIX}-{YEAR}-{NNNN}`, sequential per
prefix + year, never reused (even after cancellation).

### Local-storage limitation — read this

Data is stored only in this browser's IndexedDB. It is **not** backed up
anywhere unless you export it. Browser data clearing, uninstalling the browser
or PWA, a phone reset, or some storage-pressure cleanups can delete it.
**Export a JSON backup regularly** (Settings → Export backup) and keep the
file somewhere safe. Restore validates the file's shape before replacing
anything, and asks for confirmation first.

## Local setup

Use Node.js 22+ and npm (verified with Node 24.22); the Firestore emulator also
requires Java 21+. For the auth pilot, copy `.env.example` to ignored `.env.local`
and supply the **public** Billora Web PWA configuration for project `billora-pwa`.
Never put Admin credentials or service-account keys in Vite variables. Missing
configuration shows a closed sign-in gate rather than opening legacy data.

```bash
npm install
npm run dev             # auth pilot (default port 5173)
npm run dev:legacy      # existing local billing only (127.0.0.1:5174)
npm run typecheck
npm test                # normal regression/session/UI tests
npm run test:emulators  # isolated demo Auth/Firestore tests; no live credentials
npm run build           # auth-only production build, tenant workspace unavailable
npm run preview
```

For local emulator login, use the commented **demo** values in `.env.example`, run
`npm run emulators` and `npm run dev`; do not use live credentials. Keep the legacy
and pilot servers on separate origins. Browser storage is hostname/port-specific:
records on another origin remain intact and are not automatically copied. See the
session-policy document before selecting an old loopback origin for legacy mode.
The existing deployment workflow is unchanged; do not deploy the Phase 2 pilot as
a complete authenticated billing workspace.

Icons are original artwork generated locally by `scripts/make-icons.py`
(Pillow): `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`.

## Installing the PWA

The app is installable from the browser ("Add to Home Screen"). Installation
depends on the phone/browser and cannot be forced from inside the app.
Settings → **Install app** shows a real Install button when your browser offers
an install prompt, plus live checks (secure connection, service worker, manifest,
already installed) and the reason when the button is disabled.

- **Android (Chrome):** open the app, tap Menu ⋮ → **Add to Home screen** →
  Install/Add. It then opens full-screen like an app.
- **iPhone (Safari):** open the app, tap Share ⎋ → **Add to Home Screen** → Add.
  (iOS only supports this from Safari, not from in-app browsers.)
- After the first load, the service worker precaches the app shell, so
  previously created invoices, products, customers, and settings open offline.
  A small install guide also lives in Settings and in the dashboard empty state.

### Install troubleshooting — why a LAN dev address cannot install

If Chrome shows **"This app cannot be installed"** when you open the app at
something like `http://192.168.29.204:5173`, that is expected, and no in-app
code can change it. Chrome PWA installation requires all of:

1. **A secure context.** HTTPS, or localhost / 127.0.0.1 — a plain-HTTP LAN IP
   address is *not* exempt, even though it is on your own network.
2. **A valid manifest with icons** (the production build has these).
3. **A registered service worker with a fetch handler.** The Vite dev server
   does not register a production service worker by default (this project now
   enables `devOptions` so the worker registers in dev too, for diagnostics —
   but that alone still does not make a LAN-HTTP address installable).

The correct path: run `npm run build`, serve the `dist/` output over **HTTPS**
hosting, and open that HTTPS URL — then Settings → Install app will offer the
real Install button. Or run the app on `http://localhost:5173` / `npm run preview`
on the same machine, which is a secure context. Real-phone install has not been
verified from this workspace; test it on the phone after HTTPS deployment.

### Installing on your phone / Sharing on WhatsApp

Plain statement: **the HTTP LAN dev server can do neither.** Install and
native file sharing (the share sheet that lists WhatsApp) both require a
secure context — HTTPS or localhost — and a plain-HTTP LAN address
(`http://192.168.x.x:5173`) is not one, no matter what the app code does.
On that address, Share PDF always downloads the PDF instead, and the
invoice screen now shows a prominent amber warning card saying so, with
the manual WhatsApp steps (open WhatsApp → attach → Document → choose
the downloaded PDF from Downloads → send).

Two working paths, in order:

- **A — Deploy to free HTTPS hosting (recommended):** run `npm run build`,
  drag the `dist/` folder onto Netlify Drop, open the https URL on your
  phone — then Install and Share will both work.
- **B — Temporary test only:** expose the laptop over HTTPS with a tunnel
  (e.g. `cloudflared tunnel --url http://localhost:5173`, or
  `ngrok http 5173`) and open the https tunnel URL on your phone — the
  URL changes each run.

The dev-server warning ("PWA generateSW, precache 1 entries, glob pattern
doesn't match") is a dev-mode artefact only — the production build
precaches 14 entries correctly — and is not the reason install fails.

## Light / Dark theme

Settings → **Appearance** switches between Light and Dark. The theme is saved
on this device in `localStorage` (`simple-bill-theme`) and in IndexedDB
(`meta` key `theme`), so it survives with the app's data; a tiny inline script
in `index.html` applies the saved theme before first paint to avoid a flash.
Dark mode keeps the same calm teal identity — slate-950 page, slate-900 cards,
slate-700 borders — rather than pure black or a rebrand.

## PM Sons Enterprises — starter data

On a completely empty database, the app seeds the 7 products below (never
overwriting existing data, never saving the business profile itself — the
first-run Welcome screen still appears, pre-filled with the PM Sons details for
you to edit or skip). The Products empty state also offers "Add PM Sons starter
products" with the same no-duplicate, 7-active-cap rules.

Business (from the user's own invoices): **PM SONS ENTERPRISES**,
Ground Floor, 11/77B, Tirur Road, Vallikanjiram, Near Vallikanjiram Juma Masjid,
Thanur, Malappuram, Kerala, 676302; GSTIN **32ABCFP0332M1ZI**; Kerala, code 32.

Products are listed bricks first, then gums, in both the Products screen
and the invoice product picker (starter order, then other products by
creation date). A phone that seeded the old order keeps its old prices —
only the display order changes; new seeds get the prices below.

| Product | Price (₹) | HSN/SAC | GST | Source / note |
|---|---|---|---|---|
| 4’’8"12 HOLLOW BRICKS | 33 | 6810 | 18% | User's price list; HSN from the Sep invoice |
| 5’’8"12 HOLLOW BRICKS | 38 | 6810 | 18% | User's price list; HSN from the Sep invoice |
| 6’’8"12 HOLLOW BRICKS | 42 | 6810 | 18% | User's list wins over the Sep PDF's ₹41; HSN 6810 |
| 8’’8"12 HOLLOW BRICKS | 54 | 6810 | 18% | User's price list; HSN from the Sep invoice |
| GRAND MIX TILE GUM DIAMOND | dynamic (0) | 3824 | 18%* | Gum prices vary per sale — enter the price on each invoice. (The Oct Bill of Supply showed 350, but that price is no longer fixed.) |
| GRAND MIX TILE GUM GOLD | dynamic (0) | 3824 | 18%* | Price not in the PDFs — enter it on each invoice |
| GRAND MIX TILE GUM SILVER | dynamic (0) | 3824 | 18%* | Price not in the PDFs; user wrote "SLIVER", corrected to SILVER |

\* Tile-gum 18% is a standard-slab default, not from the PDFs (the Diamond bill
was a non-tax Bill of Supply and states no tax rate) — change it in Products if
needed. Brick 18% *is* from the Sep invoice (OUTPUT CGST 9% + OUTPUT SGST 9%).
Town-name reading: the PDF text renders "hanoor"; Thanur is the Malappuram town
at PIN 676302, so Thanur is used — correct it in Settings if it is wrong.
**Still needed from the user:** phone, email and bank details (the PDFs
give none of these, so none were invented). Gum prices are now dynamic by
design, so no fixed Gold/Silver price is needed — the operator enters the
price on each invoice. **Existing users:** a phone that already seeded the
old starter list keeps its old prices (including Diamond at ₹350) until
edited in Products; the new bricks-first display order still applies, and
the new dynamic gum prices apply only to fresh seeds.

## Behaviour notes (later changes)

- **Phone is optional everywhere.** Only a name is required: business name
  on Welcome/Settings, customer name in the customer form. A customer with
  no phone can still be saved, searched by name, and invoiced; the
  duplicate-phone warning only runs when a phone number is supplied.
- **Add Product is never blocked.** At the 7-active-product cap, a new
  product is added as **Inactive** (with a message saying so) instead of
  an error; deactivate another product to activate it later. Activating
  an existing product still respects the cap with a "deactivate one
  first" error.
- **Sharing a PDF.** Invoice detail → Share PDF uses the phone's native
  share sheet (`navigator.share` with the PDF file) — on Android that
  sheet lists WhatsApp and other installed apps. Cancelling the sheet
  downloads **nothing**; only when file sharing is genuinely unsupported
  (it needs HTTPS or localhost) does the app download the PDF and explain
  that you should attach it from Downloads in WhatsApp. A wa.me link
  cannot attach files, so it is deliberately not used.
- **Tax vs Without Tax colours.** Tax Invoice is teal, Without Tax is
  amber — in the invoice-type segmented control, the totals footer
  accent, and the invoice-detail title/badge. The words "Tax Invoice" /
  "Without Tax" are always shown too; colour is never the only signal.
- **Quantity fields select all on tap.** Tapping a quantity, price or
  discount field selects its whole value, so a leftover 0 can be replaced
  in one keystroke. Validation is unchanged (quantity must be > 0).
- **HSN tax table in tax-invoice PDFs.** When invoice lines carry HSN/SAC
  codes (taken from the catalogue product at invoice time, or entered on
  a custom item), the PDF adds an HSN-wise summary after the line items:
  HSN, taxable value, and CGST/SGST (or IGST) per HSN, with column totals
  matching the invoice's own CGST/SGST/IGST. Invoices without HSNs render
  exactly as before, with no empty table. CGST and SGST are always listed
  as separate rows in the editor totals, the invoice detail, and the PDF.

## Reports (for auditing) — v1.7.0

A new **Reports** tab (📊 in the bottom navigation) exports invoice details
for the auditing team. It does not change invoices, tax calculation, or
the invoice PDF — it only reads stored invoices.

- **Filters.** Type: All types / Tax Invoice / Without Tax. Status: All
  statuses / Draft / Final / Cancelled. From/To dates are optional and
  inclusive on both ends; leaving them blank means all dates. "Clear
  filters" resets everything to All / All / no dates.
- **Four reports.** (1) **Invoice Summary** — one row per invoice, sorted
  by date then invoice number (audit order, oldest first). (2)
  **Item-wise** — one row per line item across the filtered invoices, in
  the same order, then line order. (3) **Net totals** — always shown
  above the selected report: invoice counts (total, tax, bills, draft,
  final, cancelled), subtotal, discount, taxable value, CGST, SGST, IGST,
  GST (combined), additional charges, grand total, and the tax/non-tax
  grand-total split. (4) **HSN-wise** (v1.8.0) — tax invoices AND bills,
  grouped by HSN/SAC + tax rate, with CGST/SGST/IGST/GST columns whose
  totals match the sum of the invoices' own breakdowns exactly; tax
  columns are 0 for bills. An old invoice's HSN is recovered from the
  product catalogue when its saved line has none. Lines whose product
  has no HSN are excluded from HSN-wise but still appear in Item-wise.
- **Three export formats, per selected report.** CSV (UTF-8 BOM, plain
  numbers so columns sum in Excel), XLSX (a "Summary" sheet with net
  totals + filters + generated date, plus the report sheet), and PDF (A4
  landscape, proportional column widths, teal header row repeated on
  each page, page numbers, totals row; money columns only — Qty is never
  totalled across units). Files are named
  `simple-bill-<report>-<type>-<status>-<period>-<generated>.csv/.xlsx/.pdf`
  (see "What's new in v1.8.0"). Each report also has Share CSV/XLSX/PDF
  buttons using the native share sheet. An empty result still exports
  headers + the summary instead of failing.
- **Snapshot-based.** Exports use the invoice snapshots, so later edits
  to products or customers never change an exported report. Invoice
  Summary columns: Invoice No, Date, Type, Status, Customer, Subtotal,
  Discount, Taxable Value, CGST, SGST, IGST, GST, Additional Charge
  Label, Additional Charge Amount, Grand Total. Item-wise columns:
  Invoice No, Date, Customer, Status, Item, HSN/SAC, Unit, Qty, Rate,
  Discount, Taxable Value, Tax Rate %, Tax Amount, Line Total. HSN-wise
  columns: HSN/SAC, Tax Rate %, Taxable Value, CGST, SGST, IGST, GST, Total Tax.
  For non-tax invoices the tax columns are 0 and Taxable Value =
  subtotal − discount, taken from the stored invoice fields.

## Project layout

```
src/
  lib/        types.ts, db.ts (Dexie), calc.ts (tax/discounts/limits),
              invoiceNumber.ts, backup.ts, words.ts (Indian-system words),
              pdf.ts (jsPDF A4 invoices), format.ts, store.tsx (data context),
              starter.ts (PM Sons starter data + seeding rules),
              reports.ts (audit reports: filters, summary/item/HSN rows, net totals),
              reportExport.ts (CSV/XLSX/PDF report exports),
              useInstall.ts (beforeinstallprompt hook + install diagnostics)
  components/ ui.tsx (Sheet, StatusBadge, Money, ConfirmDialog, InstallCard…),
              BottomNav.tsx, InstallSection.tsx (Settings install + checks)
  pages/      Dashboard, InvoiceEditor, Invoices, InvoiceDetail,
              Customers, Products, Reports, Settings, Welcome
  App.tsx     tiny hash router (works offline, survives refresh)
```

## Deliberate non-goals

No multi-user accounts, roles, or subscriptions; no cloud sync, API, or
backend; no marketplace, e-commerce checkout, or multi-vendor features; no
inventory/warehouse management or stock deduction; no expense tracking or
accounting suite; no employee management; no online payments; no invoice
email delivery; no GST filing or compliance guarantees.
