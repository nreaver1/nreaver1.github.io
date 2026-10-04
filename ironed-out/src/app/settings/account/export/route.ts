import { exportAccount } from '@/server/domain/account-data';
import { audit } from '@/server/audit';
import { withTenant } from '@/server/db/tenant';
import { getServices } from '@/web/services';
import { getCurrentUser, requestContext } from '@/web/session';

export const dynamic = 'force-dynamic';

/** GET /settings/account/export → the signed-in user's data as a JSON download. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Log in first.', { status: 401 });
  const services = await getServices();
  const data = await exportAccount(services, user.userId);
  const { ip } = await requestContext();
  await withTenant(services.db, services.tenantId, (tx) =>
    audit(tx, { tenantId: services.tenantId, actor: `user:${user.userId}`, action: 'account.exported', ip }),
  );
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ironed-out-my-data.json"',
      'Cache-Control': 'private, no-store',
    },
  });
}
