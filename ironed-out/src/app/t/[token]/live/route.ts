import { getLastEventId } from '@/server/domain/outings';
import { resolveInvite } from '@/web/invite';

/** GET /t/:token/live → the outing's newest event id, polled by the open invite page. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await resolveInvite(token);
  const lastEventId = invite && (await getLastEventId(invite.services, invite.outingId));
  if (lastEventId == null) return new Response('Not found', { status: 404 });
  return Response.json(
    { lastEventId },
    { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } },
  );
}
