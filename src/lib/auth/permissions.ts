import type { Authorization, MembershipLookup, SessionIdentity } from './types';

/** No membership endpoint is enabled in Phase 2. A successful sign-in is
 * deliberately unassigned, including the existing developer account. */
export const phase2Membership: MembershipLookup = async () => ({ status: 'unassigned' });

export function bindAuthorization(identity: SessionIdentity, authorization: Authorization): Authorization {
  if (authorization.status !== 'authorized') return authorization;
  const membership = authorization.membership;
  if (membership.uid !== identity.uid || !membership.verifiedAt
    || !['SUPERADMIN', 'OWNER', 'STAFF'].includes(membership.role)
    || (membership.role !== 'SUPERADMIN' && !membership.businessId)) return { status: 'unavailable' };
  return authorization;
}
