import { getOutingResource, updatePartnerOuting } from '@/server/domain/partner-outings';
import { apiRoute } from '@/web/api';
import { dispatchSoon } from '@/web/dispatch';

export const dynamic = 'force-dynamic';

export const GET = apiRoute({ scope: 'outings:read' }, async ({ deps, caller, params }) => ({
  body: await getOutingResource(deps, caller, params.id!),
}));

export const PATCH = apiRoute({ scope: 'outings:write' }, async ({ deps, caller, params, body }) => {
  const outing = await updatePartnerOuting(deps, caller, params.id!, body);
  dispatchSoon();
  return { body: outing };
});
