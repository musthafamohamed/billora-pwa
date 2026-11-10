import { useContext } from 'react';
import { AuthContext } from './context';
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Authentication context is unavailable.');
  return context;
}
