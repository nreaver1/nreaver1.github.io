import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/BackLink';
import { OutingHero } from '@/components/outing/OutingHero';
import { OutingPlayerView } from '@/components/outing/OutingPlayerView';
import { TeeSheet } from '@/components/outing/TeeSheet';
import { ButtonLink } from '@/components/ui';
import { getOutingView } from '@/server/domain/outings';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';

export const metadata: Metadata = { title: 'Outing' };

/** The signed-in view of an outing: organizer controls, or a member's tee sheet. */
export default async function OutingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/outings/${id}`);
  const view = await getOutingView(await getServices(), id, user.playerId);
  if (!view || !view.isMember) notFound();

  return (
    <main className="page page-tight">
      <BackLink href="/home" label="Back to home" />
      <OutingHero view={view} />
      {view.isOrganizer ? (
        <TeeSheet view={view} mode="organizer">
          <ButtonLink href={`/outings/${view.id}/share`} variant="primary">
            Share the link again
          </ButtonLink>
        </TeeSheet>
      ) : (
        <OutingPlayerView view={view} />
      )}
    </main>
  );
}
