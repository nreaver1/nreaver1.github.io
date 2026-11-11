import { getLastEventId } from '@/server/domain/outings';
import { getServices } from '@/web/services';
import { getCurrentUser } from '@/web/session';

/** GET /outings/:id/live → the outing's newest event id, polled by the open page (members only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const lastEventId = await getLastEventId(await getServices(), id, user.playerId);
  if (lastEventId === null) return new Response('Not found', { status: 404 });
  return Response.json({ lastEventId }, { headers: { 'Cache-Control': 'private, no-store' } });
}
