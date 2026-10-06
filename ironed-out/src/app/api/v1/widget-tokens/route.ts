import { createWidgetToken } from '@/server/domain/widget';
import { apiRoute } from '@/web/api';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(
  { scope: 'outings:write', idempotent: true },
  async ({ deps, caller, body }) => ({
    status: 201,
    body: await createWidgetToken(deps, caller, body),
  }),
);
