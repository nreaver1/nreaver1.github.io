import { createPartnerInviteLink } from '@/server/domain/partner-outings';
import { apiRoute } from '@/web/api';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(
  { scope: 'outings:write', idempotent: true },
  async ({ deps, caller, params, body }) => ({
    status: 201,
    body: await createPartnerInviteLink(deps, caller, params.id!, body),
  }),
);
