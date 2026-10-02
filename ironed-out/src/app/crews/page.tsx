import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/BottomNav';
import { ButtonLink } from '@/components/ui';
import { listCrews } from '@/server/domain/crews';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';
import { CrewList } from './CrewList';
import styles from './crews.module.css';

export const metadata: Metadata = { title: 'Your crew' };

export default async function CrewsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser('/crews');
  const crews = await listCrews(await getServices(), user.userId);
  // One crew: go straight to it, like the design's Crew tab.
  if (crews.length === 1 && !(await searchParams).all) redirect(`/crews/${crews[0]!.id}`);

  return (
    <>
      <main className="page">
        <h1 className={styles.title}>{crews.length > 1 ? 'Your crews' : 'Your crew'}</h1>
        {crews.length === 0 ? (
          <p className="muted">
            A crew is the group you usually play with. Make one, share its link once, and everyone gets a text
            when you post a new outing.
          </p>
        ) : (
          <CrewList crews={crews} />
        )}
        <ButtonLink href="/crews/new" variant={crews.length ? 'default' : 'primary'}>
          Make a new crew
        </ButtonLink>
      </main>
      <BottomNav current="crew" />
    </>
  );
}
