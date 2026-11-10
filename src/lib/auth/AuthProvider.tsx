import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { loadFirebaseGateway } from './firebaseGateway';
import { AuthSession } from './session';
import type { AuthGateway, MembershipLookup } from './types';
import { AuthContext, type AuthContextValue } from './context';

export function AuthProvider({ children, loadGateway = loadFirebaseGateway, membership }: {
  children: ReactNode; loadGateway?: () => Promise<AuthGateway>; membership?: MembershipLookup;
}) {
  const session = useMemo(() => new AuthSession(loadGateway, membership), [loadGateway, membership]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => session.start(), [session]);
  const value = useMemo<AuthContextValue>(() => ({ ...state, login: session.login, logout: session.logout,
    requestPasswordReset: session.requestPasswordReset, retry: session.retry }), [state, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
