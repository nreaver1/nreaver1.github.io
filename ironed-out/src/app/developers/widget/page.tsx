import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { formatMinutes, formatPlayDate, formatPrice } from '@/lib/format';
import { WIDGET_DEMO_CLIENT_ID, WIDGET_DEMO_TENANT_SLUG } from '@/server/db/seed';
import { demoWidgetToken } from '@/server/domain/widget';
import { getServices } from '@/web/services';
import styles from './demo.module.css';
import { WidgetScript } from './WidgetScript';

export const metadata: Metadata = {
  title: 'Widget demo',
  description: 'A pretend booking confirmation page with the Ironed Out “Invite your group” button.',
  robots: { index: false, follow: false },
};

/**
 * A made-up booking site's confirmation page with the real widget on it, for partner pitches.
 * Each visit mints a new token for the demo tenant (seeded by `pnpm db:seed`).
 */
export default async function WidgetDemoPage() {
  // Request time only: layouts and pages render in parallel, so without this the build would
  // try to mint a token (and query the database) while prerendering.
  await connection();
  const services = await getServices();
  const demo = await demoWidgetToken(services, WIDGET_DEMO_TENANT_SLUG, WIDGET_DEMO_CLIENT_ID);

  return (
    <main className={`page ${styles.demo}`}>
      <p>
        <Link href="/developers">Partner API</Link> / Widget demo
      </p>
      <p className={styles.notice} role="note">
        Demo: below is a pretend booking site’s confirmation page. The button is the real widget; tapping it
        makes a real (sample) outing.
      </p>

      {demo ? (
        <section className={styles.site} aria-labelledby="site-heading">
          <div className={styles.siteBar}>
            <span className={styles.siteLogo}>Fairway Finder</span>
            <span className={styles.siteNav}>My bookings</span>
          </div>
          <div className={styles.siteBody}>
            <h1 id="site-heading" className={styles.siteTitle}>
              You’re booked!
            </h1>
            <p>Confirmation {demo.booking.external_ref.toUpperCase()}</p>
            <dl className={styles.facts}>
              <dt>Course</dt>
              <dd>Mount Pleasant Golf Course, Baltimore</dd>
              <dt>Date</dt>
              <dd>{formatPlayDate(demo.booking.play_date)}</dd>
              <dt>Tee times</dt>
              <dd>
                {[0, 1, 2]
                  .map((i) => formatMinutes(7 * 60 + 40 + i * demo.booking.tee_times.interval_minutes))
                  .join(' · ')}
              </dd>
              <dt>Golfers</dt>
              <dd>12 ({formatPrice(demo.booking.price_cents)} each, pay at the course)</dd>
            </dl>
            <div className={styles.cta}>
              <p className={styles.ctaText}>Playing with friends? Let them grab their own spots.</p>
              <a href={demo.url} data-ironed-out data-ironed-out-subtitle="One link for the group chat">
                Invite your group
              </a>
            </div>
          </div>
        </section>
      ) : (
        <p>
          The demo booking site isn’t set up on this server. Run <code>pnpm db:seed</code>.
        </p>
      )}
      <WidgetScript />

      <section className={styles.how}>
        <h2>What the booking site added</h2>
        <pre className={styles.code} tabIndex={0}>{`<a href="${services.appUrl}/w/…" data-ironed-out
   data-ironed-out-subtitle="One link for the group chat">Invite your group</a>
<script src="${services.appUrl}/widget/v1.js" async></script>`}</pre>
        <p>
          The link comes from <code>POST /api/v1/widget-tokens</code> on their server.{' '}
          <Link href="/developers#widget">How it works</Link>
        </p>
      </section>
    </main>
  );
}
