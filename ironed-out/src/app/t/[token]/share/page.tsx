import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/BackLink';
import { spotsText } from '@/components/outing/spots';
import { formatPlayDate } from '@/lib/format';
import { getOutingView } from '@/server/domain/outings';
import { resolveInvite } from '@/web/invite';
import { ShareClient } from '../../../outings/[id]/share/ShareClient';

export const metadata: Metadata = {
  title: 'Share the link',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * "Share the link again" for an organizer the invite page knows (including partner bookers with
 * no account). It shares this same link; making a new one stays with signed-in organizers.
 */
export default async function InviteSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await resolveInvite(token);
  if (!invite) notFound();
  const { services, outingId, viewer } = invite;
  const view = await getOutingView(services, outingId, viewer.playerId);
  if (!view?.isOrganizer) notFound();

  return (
    <main className="page page-tight">
      <BackLink href={`/t/${token}`} label="Back to the outing" />
      <ShareClient
        url={`${services.appUrl}/t/${token}`}
        path={`/t/${token}`}
        courseName={view.course.name}
        dateLabel={formatPlayDate(view.playDate)}
        spots={spotsText(view)}
        host={new URL(services.appUrl).host}
      />
    </main>
  );
}
