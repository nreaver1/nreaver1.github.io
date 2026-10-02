import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui';
import { users } from '@/server/db/schema';
import { withTenant } from '@/server/db/tenant';
import { getAlertSettings, recentNotifications } from '@/server/domain/notifications';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';
import { logOutAction } from '../../(auth)/actions';
import { AlertsClient } from './AlertsClient';

export const metadata: Metadata = { title: 'Alerts' };

const displayPhone = (e164: string) =>
  /^\+1\d{10}$/.test(e164) ? `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}` : e164;

export default async function AlertsPage() {
  const user = await requireUser('/settings/alerts');
  const services = await getServices();
  const [settings, recent, phone] = await Promise.all([
    getAlertSettings(services, user.playerId),
    recentNotifications(services, user.playerId),
    withTenant(services.db, services.tenantId, async (tx) => {
      const [u] = await tx
        .select({ phone: users.phoneE164, verified: users.phoneVerifiedAt })
        .from(users)
        .where(eq(users.id, user.userId));
      return u?.verified && u.phone ? u.phone : null;
    }),
  ]);
  const fmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });

  return (
    <>
      <main className="page">
        <div>
          <h1 style={{ fontSize: 46 }}>Alerts</h1>
          <p className="muted">Pick what pings you, and how.</p>
        </div>
        <AlertsClient
          initial={settings}
          phoneDisplay={phone ? displayPhone(phone) : null}
          smsDemo={services.smsDemo}
          recent={recent.map((r) => ({
            id: r.id,
            channel: r.channel,
            kind: r.kind,
            status: r.status,
            body: r.body,
            when: fmt.format(r.sentAt ?? r.sendAfter),
          }))}
        />
        <form action={logOutAction}>
          <Button type="submit" variant="ghost">
            Log out
          </Button>
        </form>
      </main>
      <BottomNav current="alerts" />
    </>
  );
}
