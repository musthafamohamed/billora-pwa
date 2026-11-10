import { useEffect, useState } from 'react';
import { AuthProvider } from './lib/auth/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import { btnSecondary } from './components/ui';
import { THEME_KEY } from './lib/theme';

export function PilotRoutes() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => { const onHash = () => setHash(window.location.hash); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  const known = ['', '#/', '#/login', '#/access', '#/workspace'].includes(hash);
  return <>{!known && <p role="status" className="mb-5 text-sm text-slate-700 dark:text-slate-300">This page is unavailable in the sign-in pilot.</p>}<ProtectedRoute /></>;
}
export default function AuthPilot() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const toggleTheme = () => {
    const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light'); } catch { /* preference still applies for this visit */ }
  };
  return <div className="auth-pilot mx-auto min-h-screen max-w-lg bg-white dark:bg-slate-950 sm:my-6 sm:rounded-3xl">
    <main className="px-5 pb-12 pt-6 sm:px-8">
      <div className="mb-10 flex items-center justify-between gap-4"><span className="text-lg font-semibold">Billora</span>
        <button type="button" className={btnSecondary} aria-pressed={dark} onClick={toggleTheme}>{dark ? 'Light theme' : 'Dark theme'}</button></div>
      {!online && <p role="status" className="mb-5 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">You’re offline. A saved sign-in does not confirm current access.</p>}
      <AuthProvider><PilotRoutes /></AuthProvider>
    </main>
  </div>;
}
