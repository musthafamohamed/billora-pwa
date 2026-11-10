import { useState, type FormEvent } from 'react';
import { btnPrimary, btnSecondary, Field, inputCls } from '../components/ui';
import { useAuth } from '../lib/auth/useAuth';

export default function Login() {
  const { login, requestPasswordReset, busy, error, message } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reset, setReset] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    if (reset) void requestPasswordReset(email);
    else { void login(email, password); setPassword(''); }
  };
  return <section aria-labelledby="login-title" className="space-y-6">
    <header className="space-y-3">
      <h1 id="login-title" className="text-3xl font-semibold">{reset ? 'Reset your password' : 'Sign in to Billora'}</h1>
      <p className="text-base text-slate-700 dark:text-slate-300">{reset ? 'Enter your account email to request a reset link.' : 'Use your account email and password. Workspace access is checked separately.'}</p>
    </header>
    <form onSubmit={submit} aria-busy={!!busy} className="space-y-5">
      <Field label="Email"><input type="email" name="email" aria-label="Email" autoComplete="username" autoCapitalize="none" spellCheck={false}
        required value={email} onChange={event => setEmail(event.target.value)} className={inputCls} disabled={!!busy} /></Field>
      {!reset && <Field label="Password"><input type="password" name="password" aria-label="Password" autoComplete="current-password"
        required value={password} onChange={event => setPassword(event.target.value)} className={inputCls} disabled={!!busy} /></Field>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error.message}</p>}
      {message && <p role="status" className="text-sm text-slate-700 dark:text-slate-200">{message}</p>}
      {busy && <p role="status" className="text-sm text-slate-700 dark:text-slate-300">{busy === 'login' ? 'Signing in…' : busy === 'logout' ? 'Signing out…' : 'Requesting a reset link…'}</p>}
      <button type="submit" disabled={!!busy} className={`${btnPrimary} w-full`}>{reset ? 'Request reset link' : 'Sign in'}</button>
      <button type="button" disabled={!!busy} className={`${btnSecondary} w-full`} onClick={() => { setReset(!reset); setPassword(''); }}>{reset ? 'Back to sign in' : 'Forgot password?'}</button>
    </form>
  </section>;
}
