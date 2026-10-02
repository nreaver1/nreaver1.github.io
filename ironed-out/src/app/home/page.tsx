import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomNav } from '@/components/BottomNav';
import { PlusIcon } from '@/components/icons';
import styles from '@/components/outing/outing.module.css';
import { spotsText, teeSummary } from '@/components/outing/spots';
import { Button, ButtonLink, Card } from '@/components/ui';
import { firstName, formatPlayDate } from '@/lib/format';
import { listCrews } from '@/server/domain/crews';
import { listUpcomingOutings, type OutingView } from '@/server/domain/outings';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';
import { logOutAction } from '../(auth)/actions';
import { CrewList } from '../crews/CrewList';
import home from './home.module.css';

export const metadata: Metadata = { title: 'Home' };

export default async function HomePage() {
  const user = await requireUser('/home');
  const services = await getServices();
  const [outings, crews] = await Promise.all([
    listUpcomingOutings(services, user.playerId),
    listCrews(services, user.userId),
  ]);
  const [next, ...later] = outings;

  return (
    <>
      <main className="page">
        <div>
          <h1 style={{ fontSize: 46 }}>Hey {firstName(user.name)}</h1>
          <p className="muted">
            {next ? 'Here’s what’s on the tee sheet.' : 'Nothing on the tee sheet yet. Start one below.'}
          </p>
        </div>

        {next && <NextUp view={next} />}

        <ButtonLink href="/outings/new" variant="danger">
          <PlusIcon /> New outing
        </ButtonLink>

        {later.length > 0 && (
          <section aria-labelledby="later" className={home.list}>
            <h2 id="later" className={home.sectionTitle}>
              Coming up
            </h2>
            {later.map((o) => (
              <Link key={o.id} href={`/outings/${o.id}`} className={home.row}>
                <span>
                  <span className={`display ${home.rowTitle}`}>{o.course.name}</span>
                  <span className="muted">
                    {formatPlayDate(o.playDate)} · {spotsText(o)}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        )}

        <section aria-labelledby="your-crew" className={home.list}>
          <h2 id="your-crew" className={home.sectionTitle}>
            {crews.length > 1 ? 'Your crews' : 'Your crew'}
          </h2>
          {crews.length ? <CrewList crews={crews} /> : <ButtonLink href="/crews/new">Make a crew</ButtonLink>}
        </section>

        <form action={logOutAction} style={{ alignSelf: 'center' }}>
          <Button type="submit" variant="ghost" style={{ color: 'var(--muted)' }}>
            Log out
          </Button>
        </form>
      </main>
      <BottomNav current="home" />
    </>
  );
}

function NextUp({ view }: { view: OutingView }) {
  const dots = view.teeTimes.flatMap((t) => t.slots);
  return (
    <Card raised as="section" aria-labelledby="next-up">
      <div className="muted" style={{ fontSize: 16 }}>
        NEXT UP
      </div>
      <h2 id="next-up" className="display" style={{ fontSize: 32, color: 'var(--fairway-dark)' }}>
        {view.course.name}
      </h2>
      <div style={{ fontSize: 18 }}>
        {formatPlayDate(view.playDate)} · {teeSummary(view)}
      </div>
      <div
        className={styles.dots}
        role="img"
        aria-label={`${view.totalCount - view.openCount} of ${view.totalCount} spots filled`}
      >
        {dots.map((s) => (
          <span key={s.id} className={[styles.dot, !s.open && styles.dotFilled].filter(Boolean).join(' ')} />
        ))}
      </div>
      <div style={{ fontSize: 20, color: 'var(--red-text)' }}>{spotsText(view)}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <ButtonLink href={`/outings/${view.id}`} size="sm" variant="primary" style={{ flexGrow: 1 }}>
          Open invite
        </ButtonLink>
        {view.isOrganizer && (
          <ButtonLink href={`/outings/${view.id}/share`} size="sm" style={{ flexGrow: 1 }}>
            Share link
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}
