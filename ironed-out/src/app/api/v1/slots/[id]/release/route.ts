import { releasePartnerSlot } from '@/server/domain/partner-outings';
import { apiRoute } from '@/web/api';
import { dispatchSoon } from '@/web/dispatch';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(
  { scope: 'outings:write', idempotent: true },
  async ({ deps, caller, params }) => {
    const outing = await releasePartnerSlot(deps, caller, params.id!);
    dispatchSoon();
    return { body: outing };
  },
);
