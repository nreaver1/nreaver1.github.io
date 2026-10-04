import 'server-only';
import { resolveInviteAnyTenant } from '@/server/domain/invites';
import { getServices, type Services } from './services';
import { getViewer, type Viewer } from './viewer';

export type ResolvedInvite = {
  /** Services scoped to the outing's tenant (the consumer app, or a partner's). */
  services: Services;
  outingId: string;
  viewer: Viewer;
};

/**
 * Invite token → outing, in whichever tenant owns it. Partner outings (created through the API)
 * use the same /t/ links as the consumer app; everything after this runs in that tenant.
 */
export async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  const base = await getServices();
  const found = await resolveInviteAnyTenant({ ...base, preferTenantId: base.tenantId }, token);
  if (!found) return null;
  const services = { ...base, tenantId: found.tenantId };
  return { services, outingId: found.outingId, viewer: await getViewer(found.tenantId) };
}
