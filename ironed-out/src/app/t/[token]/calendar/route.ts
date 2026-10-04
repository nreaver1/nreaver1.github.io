import { toIcs } from '@/server/domain/calendar';
import { getOutingView } from '@/server/domain/outings';
import { calendarEventFor } from '@/web/outing-links';
import { resolveInvite } from '@/web/invite';

/** GET /t/:token/calendar → .ics for the viewer's tee time (or the first one). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await resolveInvite(token);
  if (!invite) return new Response('Not found', { status: 404 });
  const { services, outingId, viewer } = invite;
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
