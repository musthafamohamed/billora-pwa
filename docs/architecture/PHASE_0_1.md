# Billora foundation: approved decisions and baseline

Verified 2026-11-09 against baseline commit 2dae86a9cc1e0db5a8f192da8b34319523df8cb3.
The root BILLORA_FIREBASE_ARCHITECTURE_AUDIT.md is the historical source inspection.
The product owner's later Phase 0/1 request supersedes its migration recommendations.

## Confirmed decisions

- Develop on existing Firebase project `billora-pwa`, Spark, with a ₹0 budget. Owner reports Email/Password enabled and default Firestore deny-all rules. No remote changes are part of this work.
- Future multi-tenant flow: React → domain repository → business-scoped Dexie → transactional outbox → synchronization → Firestore, the shared source of truth. Current single local database remains in use.
- Roles: SuperAdmin manages platform operations and authorized support, without automatic confidential business-record access; Owner initially manages one business; Staff permissions are configurable.
- At most two active Staff accounts per business, excluding Owner. Trusted backend atomic enforcement is mandatory; a frontend counter is insufficient.
- Drafts remain editable offline. Future official finalization requires connectivity and authoritative backend number allocation. Current local numbering/finalization stays unchanged in this phase.
- Fresh cloud dataset, no legacy-to-cloud import. Existing browser records remain intact. Business-scoped local initialization is deferred.
- Firebase Hosting is the future host. Current GitHub Pages workflow and custom domain remain unchanged.
- Cloud Functions and any paid backend require a later budget decision. No Blaze upgrade, paid services or deployment now.

## Security and data invariants

1. Users must never access another business's data. Local and remote workspace boundaries must isolate all records, caches and working copies.
2. Roles cannot be authorized by untrusted client fields. UI permissions are usability only; trusted backend and rules must enforce access.
3. Official numbers require authoritative allocation. Offline drafts are not officially finalized invoices.
4. Retried synchronization must be idempotent. Failed uploads must retain local drafts.
5. Finalized financial data, snapshots and contents must not silently change. Cancellation changes only status and update time.
6. After revocation is processed, deactivated staff must lose server access; offline cache/session handling needs an explicit later policy.
7. Existing browser data must never be cleared automatically. Validation is pure; decoding never repairs, rewrites or deletes records.
8. Respect Spark limits. Deny-all Firestore rules remain until tested authorization is approved.

## Unresolved, deferred implementation details

Authentication/session persistence and recovery; trusted membership source and provisioning; staff-limit enforcement backend; support-access audit/consent; local tenant/cache lifecycle and logout policy; outbox conflicts, retry/idempotency and deletion semantics; authoritative invoice sequence, cancellation and retry protocol; Firestore collections/indexes/rules and emulator proof; free-plan quotas and a suitable trusted finalization backend; hosting cutover/rollback. No local interface in Phase 1 promises these policies are implemented.

## Baseline and preservation boundary

`npm run typecheck`: pass. `npm test`: 115 tests in 14 files pass. `npm run build`: pass; Vite warns of chunks above 500 kB (main chunk 1,137.50 kB), PWA precache 14 entries. No baseline failures.

Database: `simple-bill-db`, Dexie version 1; products, customers, invoices, meta. Index definitions, IDs, stored snapshots and local invoice-number allocation must stay unchanged. Backup envelope remains app `simple-bill`, version 1. React Store API and screens remain compatible. The unrelated untracked historical audit is preserved.

Planned foundation: extract existing domain without arithmetic changes; add unknown-data codecs and pure backup/integrity validation; define explicit repository contracts; adapt the existing database and delegate Store persistence; verify with isolated IndexedDB tests and existing application regressions. Only explicit user restore/delete operations may remove business records. Automatic starter-name deduplication is removed because it conflicts with preservation, while first-run seeding remains.
