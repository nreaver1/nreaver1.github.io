import { addPartnerTeeTime } from '@/server/domain/partner-outings';
import { apiRoute } from '@/web/api';
import { dispatchSoon } from '@/web/dispatch';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(
  { scope: 'outings:write', idempotent: true },
  async ({ deps, caller, params }) => {
    const outing = await addPartnerTeeTime(deps, caller, params.id!);
    dispatchSoon();
    return { status: 201, body: outing };
  },
);
