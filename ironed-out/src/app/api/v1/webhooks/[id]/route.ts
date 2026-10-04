import { deleteWebhookEndpoint, getWebhookEndpoint, updateWebhookEndpoint } from '@/server/domain/webhooks';
import { apiRoute } from '@/web/api';

export const dynamic = 'force-dynamic';

export const GET = apiRoute({ scope: 'webhooks:manage' }, async ({ deps, params }) => ({
  body: await getWebhookEndpoint(deps, params.id!),
}));

export const PATCH = apiRoute({ scope: 'webhooks:manage' }, async ({ deps, caller, params, body }) => ({
  body: await updateWebhookEndpoint(deps, `client:${caller.id}`, params.id!, body),
}));

export const DELETE = apiRoute({ scope: 'webhooks:manage' }, async ({ deps, caller, params }) => {
  await deleteWebhookEndpoint(deps, `client:${caller.id}`, params.id!);
  return { status: 204 };
});
