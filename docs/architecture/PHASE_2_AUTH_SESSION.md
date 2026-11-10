# Phase 2 authentication and session boundary

## Implemented scope

The modular Firebase SDK provides email/password identity, persisted session
observation, logout and password-reset requests. No Google Analytics, Firestore
business client, tenant database, outbox, role assignment or cloud mutation exists
in the application. The owner-reported live project remains `billora-pwa`, Spark,
with deny-all Firestore rules. Local emulator rules mirror that policy; nothing
has been deployed or changed in the project.

## Entry isolation and routing

The default entry is `Root` → lazily loaded `AuthPilot` → `AuthProvider` →
`PilotRoutes`/`ProtectedRoute`. It never imports/mounts `StoreProvider` or opens
`simple-bill-db`. Even an authenticated or verified-role user gets no business
workspace in Phase 2. Unknown hashes (including old invoice/customer/report URLs)
show the pilot gate; the old router is not used to select business screens.

`npm run dev:legacy` explicitly selects **development-only** local billing on
127.0.0.1:5174. It loads `LegacyApp` → existing `StoreProvider`/`App`, preserving
all old hash routes, v1 database behavior, calculations and offline workflows.
There is no authentication-to-legacy link or automatic fallback. The pilot is
served separately on port 5173; authentication does not claim ownership of local
records. Production builds ignore the legacy flag and exclude its import/bundle.
This temporary development mode is not an authenticated multi-user workspace.

IndexedDB belongs to an exact browser origin. Port 5174 will not see records from
port 5173, localhost vs 127.0.0.1, or the deployed custom domain. Those records
remain intact; no origin copy or migration is attempted. To inspect an existing
**loopback development** database, stop the pilot on that origin and explicitly
run legacy mode there, e.g. `VITE_ENABLE_LEGACY_DEV=true npm run dev -- --port 5173`,
using the original hostname/port in the browser. Keep the authentication pilot on
a different origin. Do not deploy or expose this legacy-development server to
shared users. Deployed legacy data is unaffected because no deployment occurred.

A browser-profile owner can inspect same-origin plaintext storage outside the UI.
This separation prevents application session leaks; it is not disk encryption,
protection from developer tools, or protection from malicious same-origin code.

## Identity and authorization

Session identity contains UID/email only. No email/UID/env/localStorage shortcut
maps an identity to a role. No token claim is interpreted as current membership.
`MembershipLookup` is the future trusted verification seam: it must obtain current
backend-managed authorization, not arbitrary client-editable document fields.
The Phase 2 implementation always returns `unassigned`, without a network lookup.
The pre-existing developer identity therefore has no assumed SuperAdmin grant.

Authorization distinguishes unassigned, suspended, temporarily unavailable and
verified membership (SuperAdmin vs Owner/Staff with business binding/permissions).
An authorized membership is checked against the active UID before use. SuperAdmin
has platform permissions, with no implicit business binding or business-data grant.
These types do not implement administrative operations. Every role remains blocked
from business screens until Phase 3 establishes scoped storage and server checks.
Disabled identities/token failures remove displayed identity and show explicit
errors. An auth failure is never interpreted as an empty successful data load.

## Lifecycle and concurrency

`AuthSession` owns identity state only. Firebase's `onIdTokenChanged` observes
initial restoration, refreshes, sign-out and account changes. Supported SDK
IndexedDB/local persistence restores identity; passwords are neither persisted
nor logged by Billora. The UI clears its password field after submission.

Provider lifetimes and session generations fence asynchronous initialization,
token checks, membership results, observer events and feedback. The SDK's current
UID is rechecked on both successful and failed asynchronous results. Login/logout
mutations are serialized; observers do not resurrect a session during those
operations. Reset operations are separately fenced and cannot overwrite or block
a later account. Disposing the provider unsubscribes observers and invalidates
old results. Logout removes displayed identity/permissions immediately. If SDK
sign-out fails, the UI locks, explains that persisted sign-in may remain and offers
a retry; callbacks cannot restore the previous identity. A full page reload after
failed sign-out can still restore Firebase's retained credentials: retry sign-out
successfully, especially on a shared device. No business records are cleared.

## Offline policy

The state `cached-or-refreshed` explicitly does not assert a server round trip:
Firebase may return an unexpired cached token. If refresh cannot reach the network,
cached identity can be shown with token/authorization unavailable and a retry.
A cached identity does not establish current membership or active staff status.
All business access is blocked in this phase, including offline and verified-role
placeholder states. There is no offline grace period or immediate offline
revocation promise. Trusted-device access, local cache retention and revocation
policy need product-owner approval in Phase 3. No unsynchronized work/outbox is
cleared when authentication changes; the pilot never opens that data.

## Configuration and emulator safety

Copy `.env.example` to ignored `.env.local`; supply public web app values from the
existing project's Billora Web PWA settings. Required: API key, auth domain, project
ID and app ID. The parser whitelists public fields, validates `billora-pwa` and its
Firebase auth domain, and fails visibly rather than selecting legacy mode. No
Admin/service-account key or privileged token belongs in Vite variables.

For emulators, use the commented demo configuration. It requires Vite development,
a loopback hostname and project `demo-billora-phase2`. Auth connects only to
127.0.0.1:9099. Production builds reject emulator mode. `firebase.json` contains
only deny-all Firestore rules and local emulator configuration, no hosting/functions
or default live project. Scripts hardcode the demo project; tests refuse to create
fixtures unless Auth/Firestore emulator hosts and GCLOUD_PROJECT match the demo.
No credentials, live account passwords or real service accounts are needed.

Commands:

- `npm run emulators`: local Auth + Firestore only.
- `npm run dev`: auth pilot, configured via ignored environment.
- `npm run dev:legacy`: existing local app, explicit separate development origin.
- `npm test`: normal unit/component/domain/repository regression suite.
- `npm run test:emulators`: isolated SDK login/reset/session and deny-all rules tests.

The emulator tests create role-free fixture identities and business documents only
inside the demo emulator; privileged fixture seeding bypasses only local rules.
They are not provisioning Owner/Staff/SuperAdmin accounts and never target live data.

## UI direction

Reuse existing system typography, controls, focus ring, spacing and mobile-first
form layout. Existing palette: light #ffffff/#0b0b0c, dark #111112/#1b1b1d with
#f5f5f7 ink; secondary copy uses readable slate colors. The pilot-only label
contrast override does not alter legacy screens. Preserve keyboard order, explicit
email/password labels, busy/error/status feedback and the existing theme key.
No business dashboard/editor/report redesign is included.

## Proposed trusted SuperAdmin bootstrap (not executed)

A later approved administrative procedure must verify the target UID and project
`billora-pwa` outside the browser, with independently confirmed operator authority.
Use a tightly scoped trusted Admin SDK environment with ADC/workload identity or a
secured service account outside the frontend/repository. Establish a backend-owned
active platform membership and auditable bootstrap record; optionally set coarse
claims for routing hints. Do not place business read grants in a SuperAdmin claim.
Review the exact UID/membership mutation before execution, record the actor, and
verify it using future trusted membership access. Never create bootstrap grants
through client SDK code, exposed Vite variables or permissive Firestore rules.
No bootstrap script, cloud function, membership write or privilege assignment runs
in Phase 2. Staff limits/provisioning and the trusted lookup endpoint remain later
work; no paid backend or Blaze activation is implied.
