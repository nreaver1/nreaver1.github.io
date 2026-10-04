import { createWebhookEndpoint, listWebhookEndpoints } from '@/server/domain/webhooks';
import { apiRoute } from '@/web/api';

export const dynamic = 'force-dynamic';

export const GET = apiRoute({ scope: 'webhooks:manage' }, async ({ deps }) => ({
  body: { data: await listWebhookEndpoints(deps) },
}));

export const POST = apiRoute(
  { scope: 'webhooks:manage', idempotent: true },
  async ({ deps, caller, body }) => ({
    status: 201,
    body: await createWebhookEndpoint(deps, `client:${caller.id}`, body),
  }),
);
