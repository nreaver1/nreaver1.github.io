import { claimPartnerSlot } from '@/server/domain/partner-outings';
import { apiRoute } from '@/web/api';
import { dispatchSoon } from '@/web/dispatch';

export const dynamic = 'force-dynamic';

/** 409s carry the current tee sheet (`outing`) so the caller can offer the next open spot. */
export const POST = apiRoute(
  { scope: 'outings:write', idempotent: true },
  async ({ deps, caller, params, body }) => {
    const result = await claimPartnerSlot(deps, caller, params.id!, body);
    dispatchSoon();
    return { status: 201, body: result };
  },
);
