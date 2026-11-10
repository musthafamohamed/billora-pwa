import { bindAuthorization, phase2Membership } from './permissions';
import { errorCode, sessionError } from './errors';
import type { AuthGateway, MembershipLookup, SessionIdentity, SessionState } from './types';

const initial = (): SessionState => ({ status: 'loading', identity: null, authorization: { status: 'unassigned' },
  token: 'unchecked', busy: null, error: null, message: null, needsSignOut: false });
const signedOut = (): SessionState => ({ ...initial(), status: 'unauthenticated' });

/** Owns only identity/session state. It never opens business storage. Mutating
 * auth operations are serialized; generations fence asynchronous verification,
 * callbacks and UI messages across users, logout and provider lifetimes. */
export class AuthSession {
  private state = initial();
  private listeners = new Set<() => void>();
  private generation = 0;
  private operation = 0;
  private lifetime = 0;
  private active = false;
  private gateway: AuthGateway | null = null;
  private unsubscribe: (() => void) | null = null;
  private rejectRestoredIdentity = false;
  private mutation: 'login' | 'logout' | 'reset' | null = null;
  constructor(private loadGateway: () => Promise<AuthGateway>, private membership: MembershipLookup = phase2Membership) {}
  getSnapshot = (): SessionState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: SessionState) { this.state = state; for (const listener of this.listeners) listener(); }
  private current(lifetime: number, generation: number) { return this.active && this.lifetime === lifetime && this.generation === generation; }

  start(): () => void {
    const lifetime = ++this.lifetime; this.active = true; this.rejectRestoredIdentity = false; ++this.generation; this.publish(initial());
    void this.loadGateway().then(gateway => {
      if (!this.active || this.lifetime !== lifetime) return;
      this.gateway = gateway;
      this.unsubscribe = gateway.observe(identity => {
        if (!this.active || this.lifetime !== lifetime || this.mutation === 'login' || this.mutation === 'logout' || (identity && this.rejectRestoredIdentity)) return;
        void this.acceptIdentity(identity);
      }, error => {
        if (!this.active || this.lifetime !== lifetime) return;
        ++this.generation; this.rejectRestoredIdentity = true;
        if (this.mutation === 'reset') { this.mutation = null; ++this.operation; }
        this.publish({ ...signedOut(), needsSignOut: this.state.needsSignOut || this.mutation === 'logout', error: sessionError(error) });
      });
    }).catch(error => {
      if (this.active && this.lifetime === lifetime) this.publish({ ...signedOut(), status: 'configuration-error', error: sessionError(error) });
    });
    return () => {
      if (this.lifetime !== lifetime) return;
      this.active = false; ++this.lifetime; ++this.generation; this.unsubscribe?.();
      this.unsubscribe = null; this.gateway = null; this.mutation = null;
    };
  }

  private async acceptIdentity(identity: SessionIdentity | null, forceRefresh = false): Promise<void> {
    const gateway = this.gateway;
    if (!gateway || gateway.currentIdentity()?.uid !== identity?.uid) return;
    if (this.mutation === 'reset') { this.mutation = null; ++this.operation; }
    const generation = ++this.generation; const lifetime = this.lifetime;
    this.publish(initial());
    if (!identity) { this.publish(signedOut()); return; }
    try {
      await gateway.checkToken(identity, forceRefresh);
      if (!this.current(lifetime, generation) || gateway.currentIdentity()?.uid !== identity.uid) return;
      let authorization;
      try { authorization = bindAuthorization(identity, await this.membership(identity)); }
      catch { authorization = { status: 'unavailable' as const }; }
      if (!this.current(lifetime, generation) || gateway.currentIdentity()?.uid !== identity.uid) return;
      this.publish({ ...initial(), status: 'authenticated', identity, authorization, token: 'cached-or-refreshed' });
    } catch (error) {
      if (!this.current(lifetime, generation) || gateway.currentIdentity()?.uid !== identity.uid) return;
      const normalized = sessionError(error);
      if (normalized.kind === 'network') this.publish({ ...initial(), status: 'authenticated', identity,
        token: 'unavailable', authorization: { status: 'unavailable' }, error: normalized });
      else { this.rejectRestoredIdentity = true; this.publish({ ...signedOut(), error: normalized }); }
    }
  }

  login = async (email: string, password: string): Promise<void> => {
    const gateway = this.gateway; if (!gateway || this.mutation) return;
    this.rejectRestoredIdentity = true; this.mutation = 'login'; const operation = ++this.operation; const generation = ++this.generation; const lifetime = this.lifetime;
    this.publish({ ...signedOut(), busy: 'login' });
    try {
      await gateway.login(email.trim(), password);
      if (!this.current(lifetime, generation)) return;
      this.mutation = null; this.rejectRestoredIdentity = false;
      void this.acceptIdentity(gateway.currentIdentity());
    } catch (error) {
      if (this.current(lifetime, generation)) this.publish({ ...signedOut(), error: sessionError(error) });
    } finally { if (this.lifetime === lifetime && this.operation === operation) this.mutation = null; }
  };
  logout = async (): Promise<void> => {
    const gateway = this.gateway; if (!gateway || this.mutation) return;
    this.rejectRestoredIdentity = true; this.mutation = 'logout'; const operation = ++this.operation; const generation = ++this.generation; const lifetime = this.lifetime;
    this.publish({ ...signedOut(), busy: 'logout' });
    try { await gateway.logout(); if (this.current(lifetime, generation)) this.publish(signedOut()); }
    catch (error) { if (this.current(lifetime, generation)) this.publish({ ...signedOut(), needsSignOut: true, error: sessionError(error) }); }
    finally { if (this.lifetime === lifetime && this.operation === operation) this.mutation = null; }
  };
  requestPasswordReset = async (email: string): Promise<void> => {
    const gateway = this.gateway; if (!gateway || this.mutation) return;
    this.mutation = 'reset'; const operation = ++this.operation; const generation = ++this.generation; const lifetime = this.lifetime;
    this.publish({ ...signedOut(), busy: 'reset' });
    try {
      await gateway.requestPasswordReset(email.trim());
      if (this.current(lifetime, generation)) this.resetSent();
    } catch (error) {
      if (!this.current(lifetime, generation)) return;
      if (errorCode(error) === 'auth/user-not-found') this.resetSent();
      else this.publish({ ...signedOut(), error: sessionError(error) });
    } finally { if (this.lifetime === lifetime && this.operation === operation) this.mutation = null; }
  };
  private resetSent() { this.publish({ ...signedOut(), message: 'If an account exists for this email, a password reset link has been requested.' }); }
  retry = async (): Promise<void> => { if (!this.mutation && !this.state.needsSignOut && this.gateway) await this.acceptIdentity(this.gateway.currentIdentity(), true); };
}
