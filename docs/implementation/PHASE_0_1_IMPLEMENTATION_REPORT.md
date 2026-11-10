# Phase 0 + Phase 1 implementation report

Date: 2026-11-09. Baseline HEAD: `2dae86a9cc1e0db5a8f192da8b34319523df8cb3`.
Scope: local domain/repository foundation only. Phase 2 is not implemented.

## A. Implementation summary

Documented the approved Spark-first architecture and security/data invariants,
separating confirmed product decisions from unresolved backend/session policies.
Extracted the existing billing models and calculations into a framework-independent
shared domain with backward-compatible imports. Added explicit repository contracts
and an adapter over the existing Dexie database; StoreProvider now delegates all
persistence through it without changing its consumer API or application screens.

Added unknown-data codecs, structured error/warning results, full backup preflight,
and pure invoice transition/content integrity validation. Database reads and writes
validate records without modifying snapshots or inserting compatibility defaults.
Invoice writes retain transactional read/check/write protection. Explicit restores
validate before mutation and atomically replace business tables/profile. Removed
startup's destructive starter-name deduplication; first-run starter seeding remains.

Deliberate validation changes: reject malformed serialized structures, invalid
calendar dates/non-finite values and inconsistent finalized financial structures;
reject cancellation accompanied by content/financial changes. Finite incomplete
drafts remain supported, including inputs still being corrected. Existing
arithmetic and local number allocation are unchanged. The profile helper now throws
a structured error for corrupt stored JSON instead of treating it as absent.

## B. Source-code modifications

New files:

- `shared/billing/types.ts`: canonical existing models/helpers and backup envelope.
- `shared/billing/calc.ts`: extracted arithmetic/editor helpers; finite input checks.
- `shared/billing/validation.ts`: pure serialized shape, date, financial, backup and transition validation.
- `src/lib/data/repository.ts`: explicit product/customer/invoice/profile/metadata contracts and atomic restore contract.
- `src/lib/data/dexieRepository.ts`: existing v1 adapter and default local instance.
- `src/lib/data/codecs.ts`: decoding results and structured persistence errors.
- `src/lib/data/fixtures.test-support.ts`: complete hand-checked domain/export fixtures.
- `src/lib/data/validation.test.ts`: 23 domain/codec/preflight cases.
- `src/lib/data/dexieRepository.test.ts`: 10 isolated real-Dexie cases.
- `src/lib/data/store.test.tsx`: 2 real StoreProvider integration cases.
- `docs/architecture/PHASE_0_1.md`: approved architecture, invariants, baseline and scope.
- `docs/architecture/DATA_COMPATIBILITY.md`: validation/compatibility and persistence policies.
- `docs/implementation/PHASE_0_1_IMPLEMENTATION_REPORT.md`: this report.

Modified files:

- `src/lib/types.ts`, `src/lib/calc.ts`: compatibility re-exports.
- `src/lib/backup.ts`: shared preflight, preserved string-error API, structured warnings.
- `src/lib/db.ts`: exported DB class with optional isolated-test name; unchanged production schema; validated profile helpers.
- `src/lib/store.tsx`: repository delegation, scoped seed guard, removal of automatic duplicate deletion.
- `src/lib/invoiceSaving.ts`: delegates to shared pure transition/content validation.
- `src/lib/calc.test.ts`: replaces incomplete fake exports with complete valid legacy-compatible fixtures.
- `src/lib/invoiceSaving.test.ts`: legitimate cancellation fixture changes only status.
- `package.json`, `package-lock.json`: dev-only `fake-indexeddb` 6.2.8 for isolated IndexedDB tests; no new runtime dependency.

The pre-existing untracked `BILLORA_FIREBASE_ARCHITECTURE_AUDIT.md` is preserved,
not rewritten or counted as a new implementation deliverable. No routing,
deployment workflow, PWA configuration, Firebase, DNS or hosting file was changed.

## C. Test verification

| Command | Verified baseline | Final |
| --- | --- | --- |
| `npm run typecheck` | Pass | Pass |
| `npm test` | 115 tests / 14 files pass | 150 tests / 17 files pass |
| `npm run build` | Pass | Pass |
| `git diff --check` | — | Pass |

35 new tests. Existing financial, tax-split, discount, invoice editor/detail,
report/export, PDF, settings, draft recovery, starter and install tests remain
passing. Tests were introduced before their implementation; missing boundaries and
then focused validation regressions were observed failing before their fixes.

Real Dexie tests use fake-indexeddb with unique per-test names and clean up only
their own databases. They cover product/customer updates, profile/metadata,
incomplete draft saves and edits, finalization/cancellation, stale concurrent
writes, immutable content, malformed writes, restore preflight, rollback on a real
DataCloneError, opening independently constructed legacy v1 tables, retention of
corrupt rows and duplicate names, and preserved sorting. Store tests exercise real
persistence, theme/welcome state, unchanged consumer API, first-run seeding and
non-destructive reloads. No actual user's IndexedDB was used.

Local production-preview browser proof uses an isolated `billora-phase01` session:

- Welcome/setup → dashboard; customer creation; existing product price edit.
- Invoice editor autosave; tax finalization with subtotal ₹34, CGST/SGST ₹3.06 each, total ₹40.12.
- Duplicate-as-draft → non-tax finalization, total ₹34 and no tax.
- Invoice list/detail and reports route; combined report total ₹74.12.
- Tax PDF (8,794 bytes), non-tax PDF (6,723 bytes) and report PDF (13,270 bytes) downloaded with valid PDF headers.
- Backup JSON downloaded: unchanged envelope/version, seven products, one customer, two finalized invoices with preserved numbers/totals.
- Updated the isolated service worker and confirmed the final built asset `index-BlmsYvpP.js`; offline reload succeeded and persisted invoices remained readable. While offline, duplicated an invoice, edited and saved draft INV-2026-0003, and confirmed it survived another offline reload. No browser errors were reported.

Browser smoke testing supplements automated proof; it is not an exhaustive manual
audit of every field, device, sharing target or operating-system print dialog.
Report/PDF layout and export calculation regressions also remain covered by the
existing automated suites.

Remaining warnings: Vite's existing >500 kB chunk warning persists. Main chunk is
1,145.25 kB (baseline 1,137.50 kB); PWA precaches 14 entries / 1,533.92 KiB.
Vitest prints its jsdom environment optimization advisory. Package installation
reports 7 dependency audit findings (2 low, 4 moderate, 1 high); dependency upgrades
and automated audit fixes were not performed as part of this foundation refactor.
The added test dependency has no runtime dependencies. No verification failures remain.

## D. Database safety

- Production DB name remains `simple-bill-db`.
- Dexie schema remains version 1, with the exact existing four tables/index definitions.
- No data migration/upgrade function was added or run against existing user data.
- No automatic record deletion introduced; existing startup duplicate-name deletion removed.
- Existing IDs, local invoice numbers, snapshots and financial values are preserved.
- Valid version-one exports, optional charge/taxSplit/line-HSN omissions, null profiles and historical missing source references remain supported.
- Corrupt records are reported, not silently repaired/deleted. Missing indexed fields cannot be silently skipped by repository reads.
- Backup validation is pure and does not open IndexedDB. Only explicit restore/delete operations remove business records. Restore failure rolls back all business tables/profile; unrelated local metadata survives.
- Existing draft recovery and offline/PWA behavior remain in place.

See DATA_COMPATIBILITY.md for exact fatal/warning and incomplete-draft policies.
No arbitrary legacy backup or user browser database was available for an exhaustive
historical-data audit; compatibility is proven against complete supported fixtures
and an export from the running application.

## E. Firebase readiness

The shared domain can be reused without browser/React/database imports. The Store
now consumes a repository contract, with tested persistence/integrity boundaries
and explicit codec failures. Approved tenancy/security/numbering decisions are
recorded for later integration. This is architectural readiness, not Firebase
integration, authorization or tenant isolation. No Firebase SDK/config/auth UI,
tenant database, outbox, sync engine, cloud import or server finalization was added.

## F. Remaining risks

- Authentication/session lifecycle and trusted role/membership authorization are not implemented.
- Tenant isolation, scoped caches/recovery and SuperAdmin support-access controls remain future work.
- Staff provisioning and atomic two-active-staff enforcement require trusted backend design; UI checks are insufficient.
- Offline synchronization, conflict resolution, retry idempotency and revocation/logout cache policy are unresolved.
- Existing client-side invoice-number allocation is still non-authoritative and can race. Official cloud finalization must be online with a trusted allocator; no backend authority is claimed here.
- Existing local product-limit/delete guards are not cross-device security guarantees.
- Corrupt records now fail decoding without mutation; initial Store load retains the prior fallback rather than adding a new recovery UI. Codec warnings are exposed programmatically; current screens do not display a new warning panel.
- Validation detects inconsistent historical finances but does not repair them. Such records need explicit investigation rather than automatic recalculation.
- Hosting remains GitHub Pages. Firebase Hosting migration, rules/emulator testing and rollout/rollback remain deferred.
- Spark/₹0 restrictions remain. Cloud Functions/Blaze/paid backups require a separate approval and backend budget decision.

## G. Recommended next phase

**Phase 2 — Firebase Authentication and Secure Session Foundation**, targeting the
existing Spark project `billora-pwa` only, after product-owner approval:

1. Configure the approved Firebase web app using public client configuration; never include Admin/service-account credentials.
2. Implement and test email/password sign-in, session restoration, sign-out and clear loading/error states.
3. Specify the trusted identity/membership boundary and revocation/session policy; deny business data until authorized membership is established.
4. Test account switching/logout and local cache isolation policy before enabling business reads or writes.
5. Preserve deny-all business writes until tested rules and trusted provisioning/finalization design are separately approved. No deployment or billing upgrade implied.

No Phase 2 implementation, remote Firebase modification, deployment, commit or push
was performed. Working-tree changes remain available for review. At the final gate,
`git status --short` lists the ten modified tracked files above plus untracked docs,
shared domain, data modules and the preserved historical audit. `git diff --stat`
reports 10 tracked files changed, 85 insertions and 525 deletions; Git excludes the
13 newly created implementation files from that unstaged tracked-file statistic.

Final working-tree command output (new-file contents are inventoried above):

```text
$ git status --short
 M package-lock.json
 M package.json
 M src/lib/backup.ts
 M src/lib/calc.test.ts
 M src/lib/calc.ts
 M src/lib/db.ts
 M src/lib/invoiceSaving.test.ts
 M src/lib/invoiceSaving.ts
 M src/lib/store.tsx
 M src/lib/types.ts
?? BILLORA_FIREBASE_ARCHITECTURE_AUDIT.md
?? docs/
?? shared/
?? src/lib/data/

$ git diff --stat
 package-lock.json             |  11 +++
 package.json                  |   1 +
 src/lib/backup.ts             |  78 +++-------------
 src/lib/calc.test.ts          |  14 +--
 src/lib/calc.ts               | 176 +-----------------------------------
 src/lib/db.ts                 |  29 +++---
 src/lib/invoiceSaving.test.ts |   2 +-
 src/lib/invoiceSaving.ts      |   7 +-
 src/lib/store.tsx             |  90 +++++++------------
 src/lib/types.ts              | 202 +-----------------------------------------
 10 files changed, 85 insertions(+), 525 deletions(-)
```
