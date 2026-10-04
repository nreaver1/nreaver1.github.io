import { listDeliveries } from '@/server/domain/webhooks';
import { apiRoute } from '@/web/api';

export const dynamic = 'force-dynamic';

export const GET = apiRoute({ scope: 'webhooks:manage' }, async ({ deps, params }) => ({
  body: { data: await listDeliveries(deps, params.id!) },
}));
