import type { Metadata } from 'next';
import Link from 'next/link';
import { getEnv } from '@/server/env';
// Same long-read layout as the privacy policy.
import styles from '../privacy/privacy.module.css';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The rules for using Ironed Out to organize and join golf outings.',
};

/** Bump when the terms change in a way people should know about. */
export const TERMS_UPDATED = 'October 6, 2026';

export default function TermsPage() {
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
      <h1 className={styles.title}>Terms of service</h1>
      <p className="muted">Last updated {TERMS_UPDATED}</p>
      <p className={styles.lead}>
        These terms are the deal between you and Ironed Out when you organize an outing, claim a spot, join a
        crew or otherwise use the app. By using Ironed Out you agree to them. Our{' '}
        <Link href="/privacy">privacy policy</Link> explains what we do with your information.
      </p>

      <nav aria-label="On this page" className={styles.toc}>
        <a href="#service">The service</a>
        <a href="#accounts">Accounts</a>
        <a href="#organizers">Organizers</a>
        <a href="#players">Players</a>
        <a href="#texts">Texts and email</a>
        <a href="#rules">Ground rules</a>
        <a href="#partners">Booking partners</a>
        <a href="#liability">Liability</a>
        <a href="#ending">Ending</a>
        <a href="#contact">Contact</a>
      </nav>

      <section id="service" className={styles.section}>
        <h2>What Ironed Out is (and isn’t)</h2>
        <p>
          Ironed Out is a sign-up sheet for golf. An organizer lists tee times they’ve already booked, shares
          one link, and friends claim the open spots.
        </p>
        <ul>
          <li>
            <strong>We don’t book tee times.</strong> Your reservation is between the organizer and the course
            or booking site. Adding an outing here doesn’t reserve anything, and changing it here doesn’t
            change the reservation.
          </li>
          <li>
            <strong>We don’t handle money.</strong> A price on an outing is a note from the organizer. Paying
            the course, and settling up with each other, happens outside Ironed Out.
          </li>
          <li>
            <strong>We don’t run the round.</strong> Course rules, weather, cancellations, refunds and who
            actually shows up are up to the course and your group.
          </li>
        </ul>
      </section>

      <section id="accounts" className={styles.section}>
        <h2>Accounts</h2>
        <ul>
          <li>You need to be at least 13 to use Ironed Out.</li>
          <li>Players can claim a spot with just a name and a mobile number; organizing needs an account.</li>
          <li>
            Give your real name (or the one your group knows you by) and a number that’s yours. Keep your
            password to yourself; you’re responsible for what happens under your account.
          </li>
          <li>
            You can download your data or delete your account any time from{' '}
            <Link href="/settings/account">Your account</Link>.
          </li>
        </ul>
      </section>

      <section id="organizers" className={styles.section}>
        <h2>If you organize</h2>
        <ul>
          <li>Only list tee times you’ve actually booked or are about to book.</li>
          <li>
            Anyone with your invite link can see the outing and claim a spot, so share it with people you mean
            to invite. You can turn a link off or make a new one.
          </li>
          <li>
            You can change tee times, remove players and lock the sheet. Players are told when you remove them
            or cancel; be fair about it.
          </li>
          <li>
            When you add someone to a crew by phone or email, you’re confirming they’d want to hear from you.
          </li>
        </ul>
      </section>

      <section id="players" className={styles.section}>
        <h2>If you claim a spot</h2>
        <ul>
          <li>
            A claimed spot is a promise to your group, not to us. If plans change, drop out from the invite
            page so the spot opens up for someone else.
          </li>
          <li>Bring only the guests you said you’d bring.</li>
          <li>The organizer can remove you, and the course’s own rules still apply on the day.</li>
        </ul>
      </section>

      <section id="texts" className={styles.section}>
        <h2>Texts and email</h2>
        <p>
          When you claim a spot or turn on text alerts, you agree to get texts about your outings: a code to
          confirm your number, changes to the tee sheet, reminders, and new outings from your crews. Message
          frequency varies, and message and data rates may apply. Reply STOP to stop, START to resume, HELP
          for help. Carriers aren’t liable for delayed or undelivered messages, and neither are we: don’t rely
          on a text as the only reminder of your tee time.
        </p>
      </section>

      <section id="rules" className={styles.section}>
        <h2>Ground rules</h2>
        <p>Don’t use Ironed Out to:</p>
        <ul>
          <li>send spam, or texts and invites to people who didn’t ask for them;</li>
          <li>pretend to be someone else, or claim spots under someone else’s name or number;</li>
          <li>post anything unlawful, hateful or harassing in names, notes or crew names;</li>
          <li>resell tee times or spots for profit;</li>
          <li>
            scrape the app, probe or overload it, get around its limits, or access outings you weren’t invited
            to (security researchers: tell us what you find instead and we’ll work with you).
          </li>
        </ul>
        <p>
          What you type in (names, notes, crew names) stays yours. You let us store it and show it to the
          people in that outing or crew so the app can work.
        </p>
      </section>

      <section id="partners" className={styles.section}>
        <h2>Booking partners</h2>
        <p>
          Some golf booking sites let you start an outing from your booking. The booking site is responsible
          for the reservation itself; Ironed Out runs the sign-up sheet. Booking sites that use our{' '}
          <Link href="/developers">partner API</Link> do so under a separate agreement with us.
        </p>
      </section>

      <section id="liability" className={styles.section}>
        <h2>No guarantees, limited liability</h2>
        <p>
          We work hard to keep Ironed Out running and your spot where you left it, but the service is provided
          “as is” and “as available”, without warranties of any kind, to the extent the law allows. Parts of
          it may change, pause or be in a demo mode (for example, showing a code on screen instead of texting
          it).
        </p>
        <p>
          To the extent the law allows, Ironed Out isn’t liable for indirect or consequential losses, such as
          a missed tee time, a lost booking or green fees, or a disagreement within your group, and our total
          liability for any claim is limited to $50. Some places don’t allow these limits, so they may not all
          apply to you.
        </p>
      </section>

      <section id="ending" className={styles.section}>
        <h2>Ending things</h2>
        <p>
          You can stop using Ironed Out and delete your account whenever you like. We may suspend or close
          accounts, links or crews that break these terms or put other people at risk, and we may wind down
          the service with reasonable notice to account holders.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Changes</h2>
        <p>
          If we change these terms we’ll update the date at the top. If a change matters, we’ll tell account
          holders by email before it takes effect. Using Ironed Out after that means you accept the new terms.
        </p>
      </section>

      <section id="contact" className={styles.section}>
        <h2>Contact</h2>
        <p>Questions about these terms? Contact {contactLink}.</p>
      </section>
    </main>
  );
}
