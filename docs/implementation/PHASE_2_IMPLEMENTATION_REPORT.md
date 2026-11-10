# Phase 2 — Firebase Authentication and Secure Session Foundation

Verified 2026-11-09. Phase 2 only; no Phase 3 implementation, commit, push or deployment.

## 1. Implementation summary

Added modular Firebase email/password authentication, observed/persisted sessions,
logout, password-reset requests and explicit initialization/error/access states.
Identity and membership are separate. All authenticated users are unassigned by
default, including the existing developer account. Business workspaces remain
blocked for every role until scoped storage and trusted authorization exist.

The default application is an isolated auth pilot. The existing local billing app
is preserved through an explicit development-only entry on a separate origin.
No Firebase project, live rules, business collection, existing browser record,
invoice calculation/number, schema, DNS, hosting or billing setting was changed.

## 2. Created and modified files

New Phase 2 files:

- `.env.example`: public web configuration template and demo-only emulator example.
- `src/lib/firebase/client.ts`, `client.test.ts`: whitelisted config, project/emulator guards and Auth-only initialization.
- `src/lib/auth/types.ts`: identity, authorization, role/permission, gateway and session contracts.
- `src/lib/auth/permissions.ts`: default-unassigned lookup and active-UID binding.
- `src/lib/auth/errors.ts`: safe credential/network/expiry/disabled/storage/configuration/rate-limit messages.
- `src/lib/auth/firebaseGateway.ts`: modular SDK adapter.
- `src/lib/auth/session.ts`, `session.test.ts`: lifecycle, generation/operation fencing, mutations and focused regressions.
- `src/lib/auth/context.ts`, `AuthProvider.tsx`, `useAuth.ts`: React session boundary, with non-component exports separated for Fast Refresh.
- `src/pages/Login.tsx`: accessible login/reset form.
- `src/components/ProtectedRoute.tsx`: pending/suspended/unavailable/configuration/failed-logout gates; no business child.
- `src/AuthPilot.tsx`, `AuthPilot.test.tsx`: pilot shell/routes, theme, offline feedback and route/data-isolation tests.
- `src/Root.tsx`, `src/LegacyApp.tsx`: default pilot vs explicit development-only legacy entry.
- `src/lib/theme.ts`: storage-free shared preference key/type.
- `firebase.json`, `firestore.rules`: loopback emulator config and local deny-all rules; no deployment target/default live project.
- `vitest.emulator.config.ts`, `tests/emulator/firebase.test.ts`: isolated real SDK/rules suite.
- `docs/architecture/PHASE_2_AUTH_SESSION.md`: security boundary, config, offline policy and proposed trusted bootstrap.
- `docs/security/PHASE_2_DEPENDENCY_ASSESSMENT.md`: complete read-only package assessment.
- `docs/implementation/PHASE_2_IMPLEMENTATION_REPORT.md`: this report.

Modified in Phase 2: `package.json`/`package-lock.json` (SDK/emulator dependencies and
scripts), `.gitignore` (emulator artifacts), `src/main.tsx` (Root entry),
`src/lib/store.tsx` (shared theme key, compatibility export retained), `src/index.css`
(pilot-only label contrast), `tsconfig.json` (typecheck emulator tests/config), and
`README.md` (entry/config/testing documentation).

Earlier uncommitted Phase 0/1 work and the pre-existing untracked historical audit
were retained. Aggregate Git statistics include that work; it is not newly claimed
as Phase 2 implementation. Existing locked package versions at common lockfile
paths were compared with HEAD: **zero version changes**. Lockfile growth is from
requested SDK/emulator dependencies and their resolved metadata/tree.

## 3. Firebase configuration method

Copy `.env.example` to ignored `.env.local`. Supply the existing Billora Web PWA's
public API key, Firebase auth domain, project ID `billora-pwa` and app ID.
Only those public fields are read. Missing/invalid configuration fails visibly.
Analytics and an application Firestore client are not initialized. No Admin SDK,
service-account key, privileged token or real developer password is in client code,
templates or tests. Firebase SDK persistence uses its own storage, not legacy Dexie.

Emulator mode requires Vite development, a loopback hostname, and project
`demo-billora-phase2`; its fixed Auth endpoint is 127.0.0.1:9099. Production rejects
emulator mode. No `.firebaserc` selecting the live project was added.

## 4. Authentication flows implemented

Email/password sign-in, sign-out, initial session observation/restoration, token
change observation, reset-link requests, initialization/loading, retries and
explicit unauthenticated state. Errors distinguish invalid credentials, network
failure, expired/invalid token, disabled account, storage/configuration problems
and throttling. Raw SDK details are not rendered. Reset confirmation is generic,
including user-not-found, and passwords leave component state after submission.

Logout hides identity/authorization immediately. If SDK sign-out fails, it locks
and offers retry rather than silently restoring the prior account. No automatic
business cache or browser-data clearing occurs.

## 5. Session-security design

Provider lifetime, session generation and operation identity fence asynchronous
initialization, token/membership results and feedback. SDK current UID is checked
on successful **and failed** token results. Old observers/results cannot populate
a new user state. Login/logout mutations serialize; a prior password-reset request
cannot block the next account's logout or publish stale feedback. Disposal removes
observers and invalidates completions. Regression tests reproduced/fixed failed
logout restoration, pending reset/account-switch interaction and stale token-error
results. Authentication failures never become empty successful business loads.

A failed sign-out can leave Firebase credentials persisted: the UI remains locked
and asks for retry; reloading before successful sign-out may restore SDK credentials.
Browser storage restrictions can prevent durable restoration. Neither case clears
business data or promises a trusted-device/offline revocation policy.

## 6. Legacy data isolation

Default Root lazily imports only the auth pilot. No StoreProvider, legacy database,
PM Sons starter, invoice journal or business screen is loaded by authentication.
`#/invoices`, `#/customers`, `#/reports`, `#/legacy` and other unknown hashes remain
inside the pilot gate. Even a verified role gets a workspace-unavailable placeholder.

`npm run dev:legacy` explicitly serves the original billing app on 127.0.0.1:5174.
The old hash router and all business workflows are retained there. Production
ignores that flag and excludes the legacy import/bundle. No pilot link/failure
fallback selects legacy mode. This temporary mode is for private development only.

Origin matters: a different hostname/port does not show an old database. Existing
records remain on their original origin. Instructions for deliberately running
legacy-only development on an original loopback origin are in the architecture doc;
no automatic copy, association to a user, default business ID or migration occurs.

## 7. Role/authorization design

Contracts distinguish unassigned, suspended, unavailable and verified SuperAdmin,
Owner or Staff membership. Owner/Staff require a business binding; SuperAdmin has
platform permissions and no implicit confidential business-data grant. The future
membership lookup must be trusted/current and is checked against the active UID.
No hardcoded developer email/UID, Vite variable, localStorage value or client
Firestore field grants access. Current lookup returns unassigned without querying
Firestore. No real role, staff account, invitation or administrative UI was created.
A proposed trusted Admin SDK bootstrap procedure is documented only, not executed.

## 8. Emulator and security-test results

`npm run test:emulators`: **9 tests / 1 file pass**, using real modular SDK calls
against loopback Auth/Firestore under `demo-billora-phase2`. Coverage includes
successful login, observed restoration, logout, invalid password, reset request,
invalid/deleted identity, config isolation, and denied document reads, queries,
create/update/delete attempts for anonymous and authenticated users. Forged role
claims and membership/platform-role writes are also denied. Local privileged
fixture seeding is confined to the emulator. Tests reject incorrect project/host
environment before fixture creation; no real developer password is used.

Local browser verification with isolated sessions:

- Real emulator sign-in → pending access; incorrect-password error and reset confirmation.
- Mobile 390×844 and desktop 1365×900 layouts in light/dark themes, screenshots inspected.
- Settled axe WCAG 2A/2AA scans: **zero violations** in both themes after fixing pilot-only contrast. This is an automated scan, not a full accessibility certification.
- Reload with Auth endpoint requests blocked restored the cached identity and remained pending. Browser offline mode displayed the correct warning. Offline logout succeeded; online reload stayed signed out.
- Pilot database inventory contained only `firebase-heartbeat-database` and `firebaseLocalStorageDb`; no `simple-bill-db`.
- Legacy-only origin showed `simple-bill-db` and the original welcome/dashboard, seven-product catalogue and reports.
- Production preview without web config, opened directly at `#/invoices`, showed Sign-in unavailable, no business text, and no legacy database.

The offline restoration test kept application assets available while blocking Auth;
it does not claim a cold offline load of Vite's development module server or
immediate offline account-revocation detection. Existing PWA/local workflows were
also retained by the regression suite. No live Firebase login or rules deployment
was tested or claimed.

## 9. Dependency audit findings

Read-only full/production-graph audits report **24 affected package entries**
(2 low, 16 moderate, 6 high), and **11** in the `--omit=dev` dependency graph
(2 low, 4 moderate, 5 high). These counts include parent vulnerability chains and
build tooling declared under dependencies, not only reachable browser code.

The assessment file lists every affected package/version, severity, graph scope,
reachability, suggested remediation, compatibility effects and root advisory links.
Existing XLSX use is export-only in legacy mode. The added Firebase/gRPC chain is
installed Node Firestore transport, not used by the Auth-only browser pilot.
Firebase CLI/build matching/telemetry findings affect development/build dependencies.
No audit finding was suppressed, no bulk fix or unrelated major upgrade performed.
Outstanding dependency risk requires review before release/expanded functionality.

## 10–12. TypeScript, tests and production build

| Verification | Baseline | Final |
| --- | --- | --- |
| `npm run typecheck` | Pass | Pass, including emulator tests |
| `npm test` | 150 tests / 17 files pass | **183 tests / 20 files pass** |
| `npm run test:emulators` | Not present | **9 tests / 1 file pass** |
| `npm run build` | Pass | Pass |
| `git diff --check` | — | Pass |

**192 total passing tests across the two separately executed suites; 42 added.**
All prior 150 tests remain. Final browser pilot build: 46 modules, main chunk
222.90 kB, auth chunk 119.98 kB, PWA precache 12 entries / 380.28 KiB. The prior
large-bundle warning does not occur in the auth-only build because billing/export
modules are excluded. Vitest retains its jsdom optimization advisory. The existing development PWA configuration can warn about an unmatched dev precache glob before assets exist; its production build succeeds. Emulator
permission-denied diagnostics for negative tests and local reset links are expected.
No test/typecheck/build failure remains.

## 13. Manual verification for the existing developer account

Live identity verification remains an owner-local follow-up; no actual web app
configuration/password was supplied or read:

1. Copy `.env.example` to `.env.local`. Fill public values from existing `billora-pwa` → Billora Web PWA; set emulator mode false. Never add Admin/service-account credentials.
2. Run `npm run dev` and open the authorized localhost origin. Keep legacy mode false and any legacy app on a different origin.
3. Enter the existing developer email/password privately in the browser. Expect **Access pending**, not SuperAdmin or a billing dashboard.
4. Reload to check restoration, then sign out and reload to confirm sign-out. Wrong-password/network checks should show safe errors and never open legacy data.
5. Request a reset link only if desired; the live action sends email. Offline cached identity may restore, but current permissions/business access remain unavailable.
6. Do not change live deny-all rules, bootstrap privileges, provision accounts, deploy or activate paid services as part of this check.

## 14. Remaining risks

Live configuration/account smoke test is not performed. Trusted current membership,
tenant-scoped databases and work journals, server authorization, role provisioning,
staff caps, revocation/shared-device policy, sync/outbox and authoritative invoice
finalization are not implemented. No offline grace period is approved. The browser
profile itself is not an encrypted security boundary. Legacy-only development is
not suitable as a shared authenticated workspace. Dependency findings remain.
Production deployment, host migration and paid backend decisions are deferred;
Spark/₹0 constraints still apply and live Firestore rules remain untouched.

## 15. Phase 3 readiness

Ready for a separately approved tenant-scoped local/session foundation: establish
trusted membership verification, create UID/business-bound Dexie repositories and
working copies, fence workspace mounts/closure on user changes, and decide offline
access/cache retention before granting business access. Keep existing local records
intact and use the approved fresh cloud dataset; do not reintroduce legacy-to-cloud
import. Authentication is identity only, not completed SaaS authorization or sync.

## 16. Git status and diff summary

No commit/push/deploy. Starting tree already contained Phase 0/1 modifications and
untracked deliverables. The final commands below reflect the aggregate checkout;
Git's unstaged `diff --stat` omits untracked new files, which are inventoried above.

```text
$ git status --short
 M .gitignore
 M README.md
 M package-lock.json
 M package.json
 M src/index.css
 M src/lib/backup.ts
 M src/lib/calc.test.ts
 M src/lib/calc.ts
 M src/lib/db.ts
 M src/lib/invoiceSaving.test.ts
 M src/lib/invoiceSaving.ts
 M src/lib/store.tsx
 M src/lib/types.ts
 M src/main.tsx
 M tsconfig.json
?? .env.example
?? BILLORA_FIREBASE_ARCHITECTURE_AUDIT.md
?? docs/
?? firebase.json
?? firestore.rules
?? shared/
?? src/AuthPilot.test.tsx
?? src/AuthPilot.tsx
?? src/LegacyApp.tsx
?? src/Root.tsx
?? src/components/ProtectedRoute.tsx
?? src/lib/auth/
?? src/lib/data/
?? src/lib/firebase/
?? src/lib/theme.ts
?? src/pages/Login.tsx
?? tests/
?? vitest.emulator.config.ts

$ git diff --stat
 .gitignore                    |     1 +
 README.md                     |    46 +-
 package-lock.json             | 13215 ++++++++++++++++++++++++++++++++++------
 package.json                  |     9 +-
 src/index.css                 |     3 +
 src/lib/backup.ts             |    78 +-
 src/lib/calc.test.ts          |    14 +-
 src/lib/calc.ts               |   176 +-
 src/lib/db.ts                 |    29 +-
 src/lib/invoiceSaving.test.ts |     2 +-
 src/lib/invoiceSaving.ts      |     7 +-
 src/lib/store.tsx             |    94 +-
 src/lib/types.ts              |   202 +-
 src/main.tsx                  |     7 +-
 tsconfig.json                 |     2 +-
 15 files changed, 11349 insertions(+), 2536 deletions(-)
```
