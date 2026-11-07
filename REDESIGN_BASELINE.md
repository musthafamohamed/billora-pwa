# Simple Bill redesign baseline

Date: 2026-11-07

## Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed with no TypeScript errors |
| `npm test` | Passed: 7 files, 65 tests |
| `npm run build` | Passed; PWA generated 14 precache entries |
| Browser baseline | Completed in an isolated local-browser profile at 390 x 844 |

The production build emitted one existing warning: the primary JavaScript chunk is 1,122.65 kB (355.21 kB gzip), above Vite's 500 kB warning threshold. This is a performance observation, not a redesign regression. The development PWA build also reports its documented no-match precache warning; production generated the expected 14 entries.

## Baseline browser evidence

The following temporary captures are retained at `/tmp/simple-bill-baseline/` for before/after comparison:

- `01-welcome.png`
- `02-dashboard-empty.png`
- `03-invoices-empty.png`
- `04-customers-empty.png`
- `05-products-seeded.png`
- `06-reports-empty.png`
- `07-settings.png`
- `08-invoice-editor.png`
- `09-invoice-detail-final.png`

They cover every current route in its empty/initial state plus the finalized invoice detail state. The captures show the current 520px mobile shell, six-item fixed bottom navigation, floating Create Invoice action, teal/slate component styling, and the long-form editor/settings layouts that the redesign will improve.

## Baseline workflow check

This was performed only in an isolated browser profile, never against user IndexedDB data:

1. Loaded the Welcome route and skipped setup.
2. Confirmed starter products seeded and each primary route rendered.
3. Created a customer named `Baseline Customer` with Kerala as its state.
4. Started a tax invoice, selected a seeded brick product, and finalized it.
5. Confirmed the invoice detail showed `INV-2026-0001`, Final status, its line quantity/price/tax, and the Download/Share/Print/Duplicate/Cancel actions.

PDF generation, calculation, tax split, reports/export, backup validation, starter seeding, and install diagnostics are additionally covered by the passing existing unit suite. A physical-phone installation, native WhatsApp share sheet, standalone mode, and true offline reload were not verified because they require a deployed HTTPS URL and a real device.

## Baseline safety result

No source data, Dexie schema, or user browser database was changed. The test invoice and customer exist only in the isolated automation browser session. This baseline establishes the expected functional behavior that the visual redesign must retain.
