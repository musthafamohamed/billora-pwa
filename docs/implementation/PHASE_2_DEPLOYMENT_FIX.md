# Phase 2 production authentication configuration

## Diagnosis

On 2026-11-12, production displayed **Sign-in unavailable** and **Sign-in is not
configured for this environment. Contact the developer.** The latest successful
Pages run built commit `4bf8e642664451364b9e4fbbaef39e4eda29a28f`. GitHub's API
reported no repository Actions variables or secrets. The workflow did not map
Firebase configuration into the build environment.

`loadFirebaseGateway` reads Vite's build-time `import.meta.env`.
`readFirebaseConfig` rejects missing public web fields with `config/invalid` before
initializing Firebase. `AuthSession.start` converts that rejection into a
`configuration-error`; `sessionError` supplies the safe message and
`ProtectedRoute` renders the unavailable screen. The closed gate is correct.
Creating an ignored local `.env.local` cannot configure a GitHub Actions build.

The existing client already validates the project, domain, required fields and
development-only emulator restrictions. Its named Auth app, persistence,
email/password adapter and session architecture are retained. No application
Firestore client, privileged credentials, new environment names or paid service
is needed.

## Changes

- `.github/workflows/deploy.yml`: pass the four existing public web fields from
  repository Actions variables, with same-name repository secrets as fallback;
  fix emulator mode to `false`; validate presence before dependency installation
  and the production build.
- `scripts/check-firebase-env.sh`: fail for missing, empty or whitespace-only
  fields; report every missing variable name without printing any value.
- `src/lib/firebase/deployment.test.ts`: execute that guard against controlled
  complete/missing/blank inputs and check that values are never printed.
- `src/lib/firebase/client.test.ts`: cover required-field failures, custom-domain
  and development consistency, real SDK Auth initialization, named-app reuse and
  conflicting configuration rejection.
- `.env.example` and `README.md`: explain local versus Actions configuration and
  link this release checklist.

The Pages actions, custom domain, HTTPS setting, Vite `base: '/'`, PWA manifest and
service worker configuration are preserved. Authentication does not open or
modify `simple-bill-db`; business screens remain blocked for every role. No
IndexedDB migration, invoice/customer/product/settings mutation, rule deployment,
membership assignment or cloud invoice synchronization is part of this fix.

## Required manual configuration

1. Open Firebase Console → project **billora-pwa** → Project settings → General →
   Your apps → the existing **Billora Web PWA** web app → SDK setup and
   configuration → Config. Use that existing app's public web configuration.
   Do not create another project or supply Admin/service-account credentials.
2. Open [repository Actions variables](https://github.com/musthafamohamed/billora-pwa/settings/variables/actions).
   Select **New repository variable** for each of these exact names:

   | Repository variable | Value |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | The web app's `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `billora-pwa.firebaseapp.com` (the existing web app's `authDomain`) |
   | `VITE_FIREBASE_PROJECT_ID` | `billora-pwa` |
   | `VITE_FIREBASE_APP_ID` | The web app's `appId` |

   Repository secrets with those same names also work. A non-empty repository
   variable takes precedence over its same-name secret. Configure **repository**
   scope: the build job does not use the `github-pages` environment's settings.
   Storage bucket, messaging sender ID and measurement ID are not required by
   this Auth-only implementation. No emulator or legacy-mode variable is needed.
3. In Firebase Console → Authentication → Sign-in method, verify **Email/Password**
   is enabled. Email-link and other providers are not needed. Under Authentication
   → Settings → Authorized domains, verify **invitedigital.online** is present;
   add it if absent, without a scheme or path. Retain the existing Firebase
   domains. Add `localhost` only if testing live auth locally.
4. Under Authentication → Users, verify the intended existing owner account is
   present and enabled. Use its email/password privately on the website; do not
   put a password, service-account JSON or private key into GitHub or Vite.
   Keep the Spark plan and existing deny-all Firestore rules.

GitHub Pages already reports custom domain `invitedigital.online`, HTTPS enforced
and deployment by Actions. No DNS, hosting or certificate changes are required.
Repository variables are embedded in the JavaScript during **build**. Saving them
does not repair an already deployed bundle; a new deployment is required.

## Release and live acceptance

The fix is prepared on the existing `codex/firebase-auth-foundation` branch.
Once the settings above are configured, the proposed release is to merge this
verified fix into `main` using a normal push. That triggers **Deploy Billora PWA**.
No merge or production deployment is performed while those settings are missing.
Do not dispatch the deploy workflow from the feature branch.

After deployment:

1. Open `https://invitedigital.online`, allow the existing service worker to
   update, and reload. Expect **Sign in to Billora**, with Email/Password fields.
   Do not clear site storage or delete IndexedDB to update the application.
2. Enter the existing owner's correct credentials privately. Expect **Access
   pending** and the signed-in email. Phase 2 deliberately grants no role or
   business workspace.
3. Refresh. The signed-in identity should restore and the workspace stay closed.
   Check `#/invoices`, `#/customers`, `#/reports` and `#/workspace`: no billing data
   should appear. Sign out and refresh; expect the sign-in form.
4. A wrong password should show a safe credential error. Test password reset only
   when the owner wants a real email; local emulator checks do not send real mail.

Build success or a green Actions run does not establish live authentication.
Record the deployed commit/run and actual owner login/restoration/logout results
before marking the production objective complete.

## Verification and current release status

Verified on 2026-11-12 against the branch's committed Firebase 13.2.0 lockfile in
an isolated `/tmp` release copy. The tested code, guard, workflow and template
match the source prepared for this fix.

| Check | Result |
| --- | --- |
| `npm test` | 21 files, **197 tests passed**, including legacy domain/repository/UI regressions |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; Auth-only bundle, 12 PWA precache entries, service worker and correct `CNAME` generated |
| `npm run test:emulators` | **9 tests passed**, using the real Firebase SDK against isolated Auth/Firestore emulators |
| Browser + Auth emulator | Wrong password, successful email/password login, full-page refresh restoration, logout plus refresh, and reset feedback passed |
| Reset delivery | Browser reset request confirmed in the emulator's out-of-band requests; no real email sent |
| Route/data isolation | Authenticated and unauthenticated invoice/customer/report/workspace routes remained closed; authenticated legacy route also closed; only Firebase databases opened |
| Deployment guard | All missing fields, each individual missing field, empty/whitespace input and no-value-output behavior passed |
| Workflow/static checks | YAML parsing, variable/secret mapping, validation ordering, Pages actions, custom domain, `bash -n` and `git diff --check` passed |

The build above was a compilation/PWA check without live credentials, not a
configured release or live sign-in test. The existing production site was checked
over HTTPS and had an active service worker; it still displayed the configuration
error. A final GitHub API check still found no repository Actions variables or
secrets. **No production release or live owner authentication is claimed.**

A concurrent workspace edit upgraded Firebase to 13.3.0 in `package.json` and
`package-lock.json` while verification was running. That edit is preserved and
excluded from this fix. An initial emulator run hit `Cannot find package
'firebase/app'` during that installation; the complete emulator suite subsequently
passed against the committed dependencies in the isolated release copy. No SDK
upgrade is needed to correct the deployment configuration.

## Phase 3 boundary

Trusted membership verification, role provisioning, tenant-scoped local storage,
server authorization, account-switch isolation and offline/revocation policy
remain Phase 3 work. Authentication alone does not authorize access to existing
legacy billing records or implement cloud synchronization. The earlier
[Phase 2 implementation report](PHASE_2_IMPLEMENTATION_REPORT.md) records the
original foundation's scope and evidence; this checklist covers its production
configuration follow-up.
