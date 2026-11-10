import { getIdToken, onIdTokenChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type Auth } from 'firebase/auth';
import { initializeFirebaseAuth, readFirebaseConfig } from '../firebase/client';
import type { AuthGateway, SessionIdentity } from './types';

const identityOf = (user: { uid: string; email: string | null }): SessionIdentity => ({ uid: user.uid, email: user.email });
export function createFirebaseGateway(auth: Auth): AuthGateway {
  return {
    currentIdentity: () => auth.currentUser ? identityOf(auth.currentUser) : null,
    observe: (next, error) => onIdTokenChanged(auth, user => next(user ? identityOf(user) : null), error),
    checkToken: async (identity, forceRefresh = false) => {
      const user = auth.currentUser;
      if (!user || user.uid !== identity.uid) throw Object.assign(new Error('Session changed.'), { code: 'auth/invalid-user-token' });
      await getIdToken(user, forceRefresh);
    },
    login: async (email, password) => identityOf((await signInWithEmailAndPassword(auth, email, password)).user),
    logout: () => signOut(auth),
    requestPasswordReset: email => sendPasswordResetEmail(auth, email),
  };
}
export async function loadFirebaseGateway(): Promise<AuthGateway> {
  const config = readFirebaseConfig(import.meta.env, import.meta.env.DEV, window.location.hostname);
  return createFirebaseGateway(initializeFirebaseAuth(config));
}
