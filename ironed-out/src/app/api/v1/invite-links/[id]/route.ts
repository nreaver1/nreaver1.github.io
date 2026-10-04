import { revokePartnerInviteLink } from '@/server/domain/partner-outings';
import { apiRoute } from '@/web/api';

export const dynamic = 'force-dynamic';

export const DELETE = apiRoute({ scope: 'outings:write' }, async ({ deps, params }) => {
  await revokePartnerInviteLink(deps, params.id!);
  return { status: 204 };
});
