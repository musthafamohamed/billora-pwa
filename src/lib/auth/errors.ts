import type { SessionError } from './types';
export const errorCode = (error: unknown): string => typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
export function sessionError(error: unknown): SessionError {
  const code = errorCode(error);
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/missing-password'].includes(code)) {
    return { kind: 'credentials', message: 'Check your email and password, then try again.' };
  }
  if (code === 'auth/network-request-failed') return { kind: 'network', message: 'Could not connect. Check your internet connection and try again.' };
  if (['auth/user-token-expired', 'auth/invalid-user-token', 'auth/id-token-expired', 'auth/requires-recent-login'].includes(code)) {
    return { kind: 'expired', message: 'Your session is no longer valid. Sign in again.' };
  }
  if (code === 'auth/user-disabled') return { kind: 'disabled', message: 'This account is disabled. Contact your administrator.' };
  if (code === 'auth/too-many-requests') return { kind: 'throttled', message: 'Too many attempts. Wait a while before trying again.' };
  if (['auth/web-storage-unsupported', 'auth/unsupported-persistence-type'].includes(code)) return { kind: 'storage', message: 'Sign-in storage is unavailable. Allow browser storage and reload.' };
  if (code.startsWith('config/') || ['auth/invalid-api-key', 'auth/app-not-authorized', 'auth/unauthorized-domain', 'auth/operation-not-allowed', 'auth/configuration-not-found'].includes(code)) {
    return { kind: 'configuration', message: 'Sign-in is not configured for this environment. Contact the developer.' };
  }
  return { kind: 'unknown', message: 'The sign-in service is unavailable. Please try again.' };
}
