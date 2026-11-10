import { createContext } from 'react';
import type { SessionState } from './types';
export interface AuthContextValue extends SessionState {
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  retry(): Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
