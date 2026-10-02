import { toIcs } from '@/server/domain/calendar';
import { resolveInviteToken } from '@/server/domain/invites';
import { getOutingView } from '@/server/domain/outings';
import { calendarEventFor } from '@/web/outing-links';
import { getServices } from '@/web/services';
import { getViewer } from '@/web/viewer';

/** GET /t/:token/calendar → .ics for the viewer's tee time (or the first one). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const services = await getServices();
  const outingId = await resolveInviteToken(services, token);
  if (!outingId) return new Response('Not found', { status: 404 });
  const viewer = await getViewer();
  const view = await getOutingView(services, outingId, viewer.playerId);
  const event = view && calendarEventFor(view, `${services.appUrl}/t/${token}`);
  if (!event) return new Response('Not found', { status: 404 });
  return new Response(toIcs(event), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tee-time.ics"',
      'Cache-Control': 'private, no-store',
    },
  });
}
