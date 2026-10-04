import { deletePartnerTeeTime, updatePartnerTeeTime } from '@/server/domain/partner-outings';
import { apiRoute } from '@/web/api';
import { dispatchSoon } from '@/web/dispatch';

export const dynamic = 'force-dynamic';

export const PATCH = apiRoute({ scope: 'outings:write' }, async ({ deps, caller, params, body }) => {
  const outing = await updatePartnerTeeTime(deps, caller, params.id!, body);
  dispatchSoon();
  return { body: outing };
});

export const DELETE = apiRoute({ scope: 'outings:write' }, async ({ deps, caller, params }) => {
  const outing = await deletePartnerTeeTime(deps, caller, params.id!);
  dispatchSoon();
  return { body: outing };
});
