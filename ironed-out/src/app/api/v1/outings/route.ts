import { createPartnerOuting, listOutingResources } from '@/server/domain/partner-outings';
import { apiRoute } from '@/web/api';
import { dispatchSoon } from '@/web/dispatch';

export const dynamic = 'force-dynamic';

export const GET = apiRoute({ scope: 'outings:read' }, async ({ deps, caller, query }) => ({
  body: await listOutingResources(deps, caller, Object.fromEntries(query)),
}));

export const POST = apiRoute({ scope: 'outings:write', idempotent: true }, async ({ deps, caller, body }) => {
  const outing = await createPartnerOuting(deps, caller, body);
  dispatchSoon();
  return { status: 201, body: outing };
});
