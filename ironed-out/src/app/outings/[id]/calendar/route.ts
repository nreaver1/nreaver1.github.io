import { toIcs } from '@/server/domain/calendar';
import { getOutingView } from '@/server/domain/outings';
import { calendarEventFor } from '@/web/outing-links';
import { getServices } from '@/web/services';
import { getCurrentUser } from '@/web/session';

/** GET /outings/:id/calendar → .ics for a signed-in member's tee time. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const services = await getServices();
  const view = await getOutingView(services, id, user.playerId);
  const event = view?.isMember && calendarEventFor(view, `${services.appUrl}/outings/${id}`);
  if (!event) return new Response('Not found', { status: 404 });
  return new Response(toIcs(event), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tee-time.ics"',
      'Cache-Control': 'private, no-store',
    },
  });
}
