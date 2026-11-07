# Simple Bill redesign audit

Date: 2026-11-07

## Scope and preservation boundary

This is a visual redesign of the existing client-only invoicing PWA. React, TypeScript, Vite, Tailwind, Dexie/IndexedDB, the hash router, service worker, invoice models, calculations, invoice-number generation, PDF/report exports, and all storage semantics are preservation boundaries. The redesign must not add a backend, alter the database schema, reset stored data, or change business outcomes.

The workspace is a source snapshot rather than a usable Git checkout: every Git status/history command reports that it is not a repository. No branch can be created here, and there are no user changes to preserve through Git.

## Architecture and dependencies

| Layer | Current implementation |
| --- | --- |
| UI | React 19 with TypeScript and a small hash router |
| Styling | Tailwind CSS 3, PostCSS and a compact global stylesheet |
| State | One `StoreProvider` React context |
| Data | Dexie 4 over browser IndexedDB (`simple-bill-db`) |
| PWA | `vite-plugin-pwa`, Workbox `generateSW`, manifest and service-worker registration |
| Documents/exports | jsPDF invoice/report PDFs, SheetJS XLSX, CSV |
| Tests | Vitest 5 with jsdom |

`package.json` supplies the build, typecheck, test, development, and preview scripts. No backend, sync provider, authentication, cloud persistence, or deployment automation is present.

## Screen inventory and existing behaviour

| Route/screen | Current responsibility | Redesign constraints |
| --- | --- | --- |
| Welcome | First-run profile setup or skip | Keep first-run redirect and starter-data semantics |
| Dashboard | Monthly final totals, due-date-labelled outstanding total, recent invoices, quick actions | Preserve the current meaning of each summary |
| Invoices | Search and type/status filters; open invoice detail | Preserve newest-first list and filtering behaviour |
| Invoice editor | Draft/autosave, customer/product/custom-line selection, tax split, additional charge, validation, save/finalize | Highest-risk visual area; preserve calculations, snapshots, autosave, and finalization guards |
| Invoice detail | Snapshot preview, PDF download/print/share, duplicate, cancel | Final invoices remain immutable; cancellation keeps audit history |
| Customers | Search, form, duplicate-phone warning, GSTIN check, invoice history | Name remains the only required customer field |
| Products | Catalogue CRUD, active/inactive state, starter catalogue | Keep the cap of seven active products and referenced-product protection |
| Reports | Type/status/date filters, net totals, Summary/Item/HSN reports, export/share | Keep output rows, ordering, filenames and formats |
| Settings | Profile, logo, theme, install diagnostics, backup/restore, demo data, version | Keep confirmation before restore and all local data semantics |

The persistent app shell is a narrow mobile container with a floating Create Invoice action and six-item bottom navigation. `components/ui.tsx` supplies shared fields, buttons, sheets, badges, empty states and confirmation dialogs.

## Data and business rules

Dexie schema version 1 has tables for `products`, `customers`, `invoices`, and `meta`. `meta` holds the profile, theme, welcome flag, and seed marker. The redesign must not modify that schema or its version.

Critical rules to preserve:

- Invoice totals are derived from line items and use shared half-up money rounding.
- Tax invoices select CGST/SGST, IGST, or combined GST from state/tax-split rules; non-tax bills have no tax values.
- Saved invoices contain customer, business, and line-item snapshots.
- Invoice numbers are sequential by prefix and year and are never reused.
- Drafts may be incomplete; final invoices require a selected customer and positive quantity and price for every line.
- Final invoices may be duplicated or cancelled, never edited destructively.
- At most seven products are active. Products referenced by invoices are deactivated rather than deleted.
- Backup restore validates before a confirmation-gated transactional replacement.

## PWA and offline implementation

`main.tsx` registers the service worker. `vite.config.ts` configures the manifest, original icons, navigation fallback, production precache, and NetworkFirst navigation cache. The app operates solely from IndexedDB after loading. Installation and native file sharing require HTTPS or localhost; the UI intentionally falls back to download on plain HTTP.

## High-risk files

- `src/pages/InvoiceEditor.tsx`: autosave, snapshots, finalization and all editor interaction state.
- `src/lib/calc.ts`: invoice arithmetic and validation.
- `src/lib/store.tsx` and `src/lib/db.ts`: persistence and database replacement.
- `src/lib/pdf.ts` and `src/lib/reportExport.ts`: generated document geometry and file output.
- `src/App.tsx`, `src/components/BottomNav.tsx`, and `src/components/ui.tsx`: shared shell and interaction primitives.
- `src/index.css` and Tailwind class usage throughout pages: primary redesign surface.

## Current testing capability

There are 65 unit tests across seven Vitest files. They cover calculation/tax rules, invoice numbers, backups, starter data, PDF output/layout, reports/exports, and installation diagnostics. The repository has no React component, Dexie integration, PWA installation, offline reload, or browser end-to-end tests. Baseline browser screenshots and workflow checks are therefore recorded separately in `REDESIGN_BASELINE.md`.

## Design-system starting point

Current styling is Tailwind with teal/slate light and dark themes. Shared utility constants in `components/ui.tsx` are reused by every page. A redesign can centralize the new neutral Apple-inspired tokens in `src/index.css` and evolve those primitives without changing page contracts or stored data.
