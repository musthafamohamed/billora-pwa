import { btnPrimary, btnSecondary } from './ui';
import { useAuth } from '../lib/auth/useAuth';
import Login from '../pages/Login';

/** Phase 2 intentionally has no renderable business-workspace child. Verified
 * role types alone cannot bypass the missing tenant-scoped storage boundary. */
export default function ProtectedRoute() {
  const auth = useAuth();
  if (auth.status === 'loading') return <p role="status" className="py-8 text-slate-700 dark:text-slate-300">Restoring your session…</p>;
  if (auth.status === 'configuration-error') return <section className="space-y-4">
    <h1 className="text-3xl font-semibold">Sign-in unavailable</h1>
    <p role="alert">{auth.error?.message ?? 'Sign-in could not be initialized. Contact the developer.'}</p>
    <button type="button" className={btnPrimary} onClick={() => window.location.reload()}>Reload</button>
  </section>;
  if (auth.needsSignOut) return <section className="space-y-4"><h1 className="text-3xl font-semibold">Sign-out incomplete</h1>
    <p role="alert">Your identity is hidden, but the saved sign-in could not be removed. Retry before switching accounts.</p>
    {auth.error && <p>{auth.error.message}</p>}
    <button type="button" className={btnPrimary} onClick={() => { void auth.logout(); }}>Try sign out again</button>
  </section>;
  if (auth.status === 'unauthenticated') return <Login />;
  const status = auth.authorization.status;
  const title = status === 'suspended' ? 'Access paused' : status === 'unavailable' ? 'Access verification unavailable'
    : status === 'authorized' ? 'Workspace not available yet' : 'Access pending';
  return <section aria-labelledby="access-title" className="space-y-5">
    <header className="space-y-3"><h1 id="access-title" className="text-3xl font-semibold">{title}</h1>
      <p className="break-words text-slate-700 dark:text-slate-300">Signed in{auth.identity?.email ? ` as ${auth.identity.email}` : ''}.</p></header>
    <p>{status === 'suspended' ? 'Your access is paused. Contact your administrator.'
      : status === 'unavailable' ? 'Current access could not be verified. Try again when a connection is available.'
      : status === 'authorized' ? 'Business workspaces are not available in this sign-in pilot.'
      : 'An administrator must establish your access before you can open a workspace.'}</p>
    <p className="text-sm text-slate-700 dark:text-slate-300">No billing workspace is open. A saved sign-in does not confirm current permissions.</p>
    {auth.error && <p role="alert">{auth.error.message}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" className={btnSecondary} onClick={() => { void auth.retry(); }}>Check access again</button>
      <button type="button" className={btnPrimary} onClick={() => { void auth.logout(); }}>Sign out</button>
    </div>
  </section>;
}
