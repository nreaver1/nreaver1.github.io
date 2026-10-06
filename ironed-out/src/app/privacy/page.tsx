import type { Metadata } from 'next';
import Link from 'next/link';
import { RETENTION } from '@/server/domain/retention';
import { getEnv } from '@/server/env';
import styles from './privacy.module.css';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What Ironed Out collects, why, who sees it, and how to get it deleted.',
};

/** Bump when the policy text changes in a way people should know about. */
export const PRIVACY_UPDATED = 'October 6, 2026';

const days = (ms: number) => Math.round(ms / 86_400_000);

const RETENTION_ROWS: [string, string][] = [
  [
    'Texting codes',
    `Deleted after ${days(RETENTION.verificationCodesMs) * 24} hours (they stop working after 10 minutes).`,
  ],
  ['Password reset links', `Deleted after ${days(RETENTION.resetTokensMs) * 24} hours.`],
  [
    'Rate-limit counters (may include your IP address)',
    `Deleted after ${days(RETENTION.rateLimitWindowsMs)} days.`,
  ],
  [
    'Sign-in sessions (with IP address and browser)',
    `Deleted ${days(RETENTION.sessionsAfterEndMs)} days after they end or you sign out.`,
  ],
  ['Texts and emails we sent you', `Deleted after ${days(RETENTION.notificationsMs)} days.`],
  [
    'Outings, tee sheets and their change history',
    'Deleted 18 months after the play date (a booking partner may set a different period for outings it created).',
  ],
  ['Players with only a name and phone number', 'Deleted once no outing or crew refers to them any more.'],
  ['Your account', 'Until you delete it.'],
  [
    'Security log (sign-ins, removals, account deletions)',
    'Kept to investigate abuse; it holds ids and IP addresses, not message content.',
  ],
];

export default function PrivacyPage() {
  const contact = getEnv().CONTACT_EMAIL;
  // Until CONTACT_EMAIL is set the page says so plainly rather than showing an address nobody reads.
  const contactLink = contact ? (
    <a href={`mailto:${contact}`}>{contact}</a>
  ) : (
    <>us at the address we’ll publish here (not set up yet)</>
  );

  return (
    <main className={`page ${styles.policy}`}>
      <p>
        <Link href="/">Ironed Out</Link>
      </p>
      <h1 className={styles.title}>Privacy policy</h1>
      <p className="muted">Last updated {PRIVACY_UPDATED}</p>
      <p className={styles.lead}>
        Ironed Out helps a golf organizer fill tee times: they share one link and friends claim spots from it.
        We collect only what that takes. We don’t sell your information, we don’t show ads, and we don’t use
        tracking or analytics cookies. Using Ironed Out is also covered by our{' '}
        <Link href="/terms">terms of service</Link>.
      </p>

      <nav aria-label="On this page" className={styles.toc}>
        <a href="#collect">What we collect</a>
        <a href="#use">How we use it</a>
        <a href="#texts">Text messages</a>
        <a href="#see">Who can see what</a>
        <a href="#share">Who we share with</a>
        <a href="#keep">How long we keep it</a>
        <a href="#choices">Your choices</a>
        <a href="#contact">Contact</a>
      </nav>

      <section id="collect" className={styles.section}>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account details</strong>: your name, email address and password (stored only as a one-way
            hash). An account is optional for players.
          </li>
          <li>
            <strong>Your mobile number</strong>, when you claim a spot or turn on text alerts. We store it
            encrypted and never show it to other people.
          </li>
          <li>
            <strong>Outing details</strong>: the course, date, tee times, price and note an organizer enters,
            the name you give when you claim a spot, how many guests you bring, and a history of changes (who
            joined, who dropped out).
          </li>
          <li>
            <strong>Crews</strong>: groups you create or join, and the names, numbers or email addresses of
            people you invite to them.
          </li>
          <li>
            <strong>Alert settings</strong>: which texts and emails you want and your quiet hours.
          </li>
          <li>
            <strong>Technical details</strong>: your IP address and browser type when you sign in or try a
            code (to stop abuse), and three cookies that keep the app working:
          </li>
        </ul>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Cookie</th>
                <th scope="col">What it does</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>io_session</td>
                <td>Keeps you signed in. Ends when you sign out.</td>
              </tr>
              <tr>
                <td>io_device</td>
                <td>
                  Remembers that you confirmed your number on this phone, so you don’t need a new code each
                  time (90 days).
                </td>
              </tr>
              <tr>
                <td>io_anon</td>
                <td>
                  A random id so an invite page can show what changed since your last visit. It isn’t linked
                  to your name.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="use" className={styles.section}>
        <h2>How we use it</h2>
        <ul>
          <li>To run outings: show the tee sheet, hold your spot and stop two people taking the same one.</li>
          <li>
            To send the texts and emails you asked for: codes, changes to your outing, reminders and crew
            invites.
          </li>
          <li>To keep the service safe: rate limits, spotting abuse and investigating problems.</li>
        </ul>
        <p>We don’t use your information for advertising, and we don’t sell or rent it to anyone.</p>
      </section>

      <section id="texts" className={styles.section}>
        <h2>Text messages</h2>
        <p>
          When you claim a spot or turn on text alerts, you agree to get texts from Ironed Out about your
          outings: a code to confirm your number, changes to the tee sheet, reminders before you play, and new
          outings from your crews. How many you get depends on how busy your outings are. Message and data
          rates may apply.
        </p>
        <ul>
          <li>
            Reply <strong>STOP</strong> to any text to stop all texts. Reply <strong>START</strong> to turn
            them back on, or <strong>HELP</strong> for help.
          </li>
          <li>
            Except for the reminder two hours before your tee time, texts wait until your quiet hours end (10
            PM to 7 AM by default).
          </li>
          <li>
            We don’t share your mobile number or your consent to receive texts with anyone for their
            marketing. Our texting provider receives your number only to deliver our messages.
          </li>
        </ul>
      </section>

      <section id="see" className={styles.section}>
        <h2>Who can see what</h2>
        <ul>
          <li>
            <strong>Anyone with an invite link</strong> can see that outing’s course, date, tee times and the
            names on the tee sheet. Organizers can turn a link off or make a new one.
          </li>
          <li>
            <strong>The organizer</strong> sees who claimed each spot and can remove players.
          </li>
          <li>
            <strong>Crew members</strong> see each other’s names and the crew’s outings.
          </li>
          <li>Nobody but us sees your phone number or email address.</li>
        </ul>
      </section>

      <section id="share" className={styles.section}>
        <h2>Who we share with</h2>
        <p>We use a few providers to run the service. They process data only on our behalf:</p>
        <ul>
          <li>Vercel (hosting) and Neon (database), in the United States.</li>
          <li>Twilio (delivering texts) and Resend (delivering emails), once those are switched on.</li>
        </ul>
        <h3>Booking partners</h3>
        <p>
          If you book tee times through a golf booking site that works with Ironed Out, that site may create
          the outing for you. It then receives updates about that outing (who claimed or dropped a spot, with
          the names shown on the tee sheet) so it can show them to you. Partners never get your phone number
          from us, and they can only see outings they created. Their own privacy policy covers what they do
          with it.
        </p>
        <p>
          We’ll also share information if the law requires it, or to protect someone’s safety. If Ironed Out
          is ever sold or merged, this policy will keep applying to the information we already have.
        </p>
      </section>

      <section id="keep" className={styles.section}>
        <h2>How long we keep it</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Kept for</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION_ROWS.map(([what, how]) => (
                <tr key={what}>
                  <td>{what}</td>
                  <td>{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="choices" className={styles.section}>
        <h2>Your choices</h2>
        <ul>
          <li>
            <strong>Download or delete your data</strong> any time from{' '}
            <Link href="/settings/account">Your account</Link>. Deleting cancels upcoming outings you organize
            (your players are told), frees your spots and removes your crews.
          </li>
          <li>
            <strong>Change alerts</strong> on the <Link href="/settings/alerts">Alerts</Link> screen, or reply
            STOP to a text.
          </li>
          <li>
            <strong>Drop out</strong> of an outing from its invite page; your spot is freed right away.
          </li>
          <li>
            No account? To delete the name and number you gave when you claimed a spot, contact {contactLink}.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Security</h2>
        <p>
          Connections are encrypted, phone numbers are encrypted in the database, passwords are hashed with
          Argon2id, and each booking partner’s data is kept apart at the database level. No system is
          perfectly secure; if something goes wrong, we’ll tell the people affected.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Children</h2>
        <p>Ironed Out isn’t meant for children under 13, and we don’t knowingly collect their information.</p>
      </section>

      <section className={styles.section}>
        <h2>Changes</h2>
        <p>
          If we change this policy we’ll update the date at the top. If a change affects how we use
          information we already have, we’ll tell account holders by email first.
        </p>
      </section>

      <section id="contact" className={styles.section}>
        <h2>Contact</h2>
        <p>Questions, or want something corrected or deleted? Contact {contactLink}.</p>
      </section>
    </main>
  );
}
