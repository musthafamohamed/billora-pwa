# Billora GitHub Pages deployment plan

## Audited configuration

- Production branch: `main` (tracking `origin/main`).
- Package manager: npm, with the committed `package-lock.json`.
- Build command: `npm run build` (TypeScript check followed by Vite production build).
- PWA: `vite-plugin-pwa` generates the manifest and Workbox service worker. Its current `start_url`, `scope`, icon paths, and navigation fallback are root-domain compatible.
- Routing: the application is hash-based (`#/invoices`, `#/settings`, and so on). A browser refresh requests `/`, not a client route path, so GitHub Pages does not require a `404.html` SPA fallback for the existing router.

## Deployment changes

1. Make Vite's root-domain `base` explicit as `/`.
2. Add `public/CNAME` containing `invitedigital.online`, so Vite copies it to the root of `dist`.
3. Add a GitHub Pages workflow that runs on pushes to `main`, uses `npm ci`, runs the existing build command, uploads `dist`, and deploys it with the official Pages actions.
4. Preserve PWA configuration and application source. No storage, calculation, route, export, or service-worker behavior changes are planned.

## Validation

1. Run `npm run typecheck`, `npm test`, and `npm run build`.
2. Confirm the built `dist` contains `CNAME`, `manifest.webmanifest`, root-referenced icons, `sw.js`, and the Workbox asset.
3. Commit and push the configuration to `main`.
4. Verify the resulting GitHub Actions run externally. GitHub Pages and DNS activation cannot be claimed until GitHub has completed that run and DNS is configured.
