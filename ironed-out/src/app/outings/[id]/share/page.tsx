import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/BackLink';
import { spotsText } from '@/components/outing/spots';
import { formatPlayDate } from '@/lib/format';
import { ensureInviteLink } from '@/server/domain/invites';
import { getOutingView } from '@/server/domain/outings';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';
import { ShareClient } from './ShareClient';

export const metadata: Metadata = { title: 'Share the link' };

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/outings/${id}/share`);
  const services = await getServices();
  const view = await getOutingView(services, id, user.playerId);
  if (!view?.isOrganizer) notFound();
  const link = await ensureInviteLink(services, { playerId: user.playerId }, id);
  const url = `${services.appUrl}/t/${link.token}`;

  return (
    <main className="page page-tight">
      <BackLink href={`/outings/${id}`} label="Back to the outing" />
      <ShareClient
        outingId={id}
        url={url}
        path={`/t/${link.token}`}
        courseName={view.course.name}
        dateLabel={formatPlayDate(view.playDate)}
        spots={spotsText(view)}
        host={new URL(services.appUrl).host}
      />
    </main>
  );
}
