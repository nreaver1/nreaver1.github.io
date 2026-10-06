import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { formatMinutes, formatPlayDate } from '@/lib/format';
import { previewWidget } from '@/server/domain/widget';
import { getServices } from '@/web/services';
import { ShareClient } from '../../outings/[id]/share/ShareClient';
import { makeOutingAction } from './actions';
import { MakeOutingForm } from './MakeOutingForm';
import styles from './widget.module.css';

type Props = { params: Promise<{ token: string }> };

// The token is in the URL: keep it out of search engines and other sites' referrer logs.
export const metadata: Metadata = {
  title: 'Invite your group',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * Where a partner's "Invite your group" button lands (SPEC §7 widget). Shows the booking, makes
 * the outing on one tap, then the usual "Link's ready" screen.
 */
export default async function WidgetPage({ params }: Props) {
  const { token } = await params;
  const services = await getServices();
  const booking = await previewWidget(services, token);
  if (!booking) return <Expired />;

  const { outing } = booking;
  if (outing?.invite_url) {
    const path = new URL(outing.invite_url).pathname;
    return (
      <main className="page page-tight">
        <p className={styles.from}>Booked with {booking.partnerName}</p>
        <ShareClient
          url={outing.invite_url}
          path={path}
          courseName={outing.course.name}
          dateLabel={formatPlayDate(outing.play_date)}
          spots={
            outing.open_count === 0
              ? `Full! ${outing.total_count} of ${outing.total_count}`
              : `${outing.open_count} of ${outing.total_count} spots open`
          }
          host={new URL(services.appUrl).host}
        />
      </main>
    );
  }

  const times = Array.from({ length: booking.teeTimeCount }, (_, i) =>
    formatMinutes(booking.firstTeeMinutes + i * booking.intervalMinutes),
  );

  return (
    <main className="page page-tight">
      <p className={styles.from}>Booked with {booking.partnerName}</p>
      <h1 className={styles.title}>Invite your group</h1>
      <p className={styles.lead}>
        One link for the group chat. Friends tap it, pick a tee time and they’re in. No app, no account.
      </p>
      <Card as="section" aria-labelledby="booking-heading" raised>
        <h2 id="booking-heading" className={styles.course}>
          {booking.course.name}
        </h2>
        <p className="muted">
          {booking.course.city}, {booking.course.region}
        </p>
        <dl className={styles.facts}>
          <dt>Date</dt>
          <dd>{formatPlayDate(booking.playDate)}</dd>
          <dt>{times.length === 1 ? 'Tee time' : 'Tee times'}</dt>
          <dd>{times.join(' · ')}</dd>
          <dt>Spots</dt>
          <dd>
            {booking.totalSpots}, with {booking.organizerName} in the first
          </dd>
        </dl>
      </Card>
      <MakeOutingForm action={makeOutingAction.bind(null, token)} />
      <p className={styles.fine}>
        Ironed Out runs the sign-up sheet for {booking.partnerName}. They may see the names on the tee sheet,
        never phone numbers. <Link href="/privacy">Privacy policy</Link>
      </p>
    </main>
  );
}

function Expired() {
  return (
    <main className="page">
      <h1 style={{ fontSize: 46 }}>This button has expired</h1>
      <p>Go back to your booking confirmation and reload the page for a fresh one.</p>
    </main>
  );
}
