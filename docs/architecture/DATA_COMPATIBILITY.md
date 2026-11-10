# Phase 1 persistence and compatibility contract

## Ownership

`shared/billing/types.ts` is the single model source. Existing `src/lib/types.ts`
and `src/lib/calc.ts` remain compatibility re-exports. Arithmetic, rounding,
discount caps, tax splits, identifiers and local invoice-number allocation stay
unchanged. Finalization validation additionally rejects non-finite inputs and
negative discounts; these are invalid financial inputs, not calculation changes.
The shared domain has no React, Dexie, Firebase, IndexedDB or DOM dependency.

`BillingRepository` composes explicit product, customer, invoice, profile and
metadata operations. Each instance owns its data scope; only the existing local
adapter is implemented. StoreProvider keeps its existing consumer API and accepts
an optional repository for isolated integration testing. No tenant fields, cloud
operations, authentication or synchronization are implied by this interface.

Production still uses `simple-bill-db`, version 1 with unchanged indexes and
products/customers/invoices/meta tables. An optional constructor name permits
isolated test databases; it does not create a new production workspace.
Repositories decode full table reads before sorting, so records missing indexed
fields cannot silently disappear from validation. Sorting preserves existing
IndexedDB string and primary-key tie ordering.

## Decoding unknown data

Codecs return `{data, errors, warnings}` with issue code, path, message and
severity. Fatal errors yield null data. Repository operations throw
`DataValidationError` with structured issues instead of deleting, normalizing,
repairing or rewriting malformed records. The legacy profile helper now reports
invalid JSON/shape instead of treating corrupt profile data as an absent profile.
The initial Store load retains its prior failure fallback; explicit reload/write
promises reject. A richer load-error/recovery UI is deferred; records stay stored.
Warnings are available from codecs and backup preflight; current Store consumers
continue receiving their original typed arrays.

Documented legacy omissions:

- Invoice additionalChargeLabel / additionalChargeAmount: existing display and
  calculation consumers use empty label / zero amount.
- Invoice taxSplit: existing consumers use AUTO; a historical stored breakdown
  is not replaced based on current customer/business state.
- Line hsnSacCode: optional historical classification, kept absent if absent.

Decoding retains optional-field absence and all stored snapshots. Required string
fields may be empty where the application supports it (including blank business
snapshot fields after skipping setup). Missing required shape/IDs, non-finite
numbers and invalid calendar dates are errors. Profile, product and customer
records are validated without introducing new format requirements for optional
phone/email/GSTIN fields.

## Drafts, finalization and financial integrity

Persisted drafts require valid serialized shapes and finite values, but may have
blank issue dates, no customer/lines, zero prices and finite inputs still being
corrected. Negative/range or inconsistent draft financial values produce warnings
and are not rewritten. Final/cancelled invoices require completion, valid dates,
nonnegative values and consistent line/totals/breakdown structures. Validation
compares with existing arithmetic, never replaces historical amounts.

Local write policy remains: new invoices and draft edits/finalization are allowed;
a final invoice can only become cancelled while preserving every field except
status and updatedAt; cancelled invoices and other finalized rewrites are rejected.
Unknown extra fields are included in the content comparison. Read/check/write is
one Dexie transaction, so delayed drafts cannot downgrade a committed final record.
Legitimate InvoiceDetail cancellation already changes only status/update time.
This tightens the old cancellation loophole; it does not add server authority.

## Backup preflight and explicit restore

Envelope remains `{app:'simple-bill',version:1,exportedAt,profile,products,customers,invoices}`.
A null profile is supported. `validateBackup` keeps returning fatal error strings;
`parseBackup` keeps data/errors and adds structured warnings. `preflightBackup`
exposes structured errors/warnings directly. None opens IndexedDB.

Preflight checks duplicate IDs within each collection and each invoice's lines,
duplicate invoice numbers, required snapshots, snapshot/customer ID agreement,
finite/ranged monetary values, dates, enums, financial structure and totals.
Missing mutable product/customer source records are warnings when valid historical
snapshots remain; custom lines with an empty product ID are supported. Optional
legacy omissions are compatibility warnings. Unsupported envelope/version and
malformed structures are fatal. Older shallow test fixtures were replaced with
complete valid exports rather than relaxing these checks.

Only explicit Store replaceAll/restore can clear tables. The adapter revalidates
before writing and commits products, customers, invoices and profile atomically.
Unrelated local metadata is preserved. Failed writes roll back all tables.
Startup no longer deletes duplicate starter names. First-run seeding and explicit
CRUD/delete controls remain. No schema upgrade or data migration runs.
