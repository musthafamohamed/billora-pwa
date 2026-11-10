export interface SessionIdentity { uid: string; email: string | null }
export type BusinessPermission = 'invoices.read' | 'invoices.create' | 'invoices.updateOwnDraft' | 'invoices.finalize' | 'invoices.cancel'
  | 'customers.read' | 'customers.write' | 'products.read' | 'products.write' | 'reports.read' | 'reports.export'
  | 'settings.manage' | 'staff.manage' | 'backup.export' | 'backup.import';
export type PlatformPermission = 'businesses.manage' | 'owners.manage' | 'platform.configure' | 'support.request';
export type Role = 'SUPERADMIN' | 'OWNER' | 'STAFF';
export type VerifiedMembership = { uid: string; verifiedAt: string } & (
  { role: 'SUPERADMIN'; permissions: PlatformPermission[] }
  | { role: 'OWNER' | 'STAFF'; businessId: string; permissions: BusinessPermission[] }
);
export type Authorization = { status: 'unassigned' } | { status: 'suspended' }
  | { status: 'unavailable' } | { status: 'authorized'; membership: VerifiedMembership };
/** Future implementation must use a trusted, current membership source. Neither
 * ID token claims nor client fields alone constitute this verification. */
export type MembershipLookup = (identity: SessionIdentity) => Promise<Authorization>;
export interface AuthGateway {
  currentIdentity(): SessionIdentity | null;
  observe(next: (identity: SessionIdentity | null) => void, error: (error: unknown) => void): () => void;
  checkToken(identity: SessionIdentity, forceRefresh?: boolean): Promise<void>;
  login(email: string, password: string): Promise<SessionIdentity>;
  logout(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
}
export interface SessionError { kind: 'credentials' | 'network' | 'expired' | 'disabled' | 'configuration' | 'storage' | 'throttled' | 'unknown'; message: string }
export interface SessionState {
  status: 'loading' | 'unauthenticated' | 'authenticated' | 'configuration-error';
  identity: SessionIdentity | null;
  authorization: Authorization;
  token: 'unchecked' | 'cached-or-refreshed' | 'unavailable';
  busy: 'login' | 'logout' | 'reset' | null;
  error: SessionError | null;
  message: string | null;
  needsSignOut: boolean;
}
