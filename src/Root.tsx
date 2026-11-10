import { lazy, Suspense } from 'react';
// Vite removes the legacy import from production. URL/hash/identity/roles cannot
// select this mode. Use a separate loopback origin for legacy development.
const Application = lazy(() => import.meta.env.DEV && import.meta.env.VITE_ENABLE_LEGACY_DEV === 'true'
  ? import('./LegacyApp') : import('./AuthPilot'));
export default function Root() {
  return <Suspense fallback={<p role="status" className="p-6">Loading Billora…</p>}><Application /></Suspense>;
}
