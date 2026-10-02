import { CourseScene } from '@/components/illustrations/CourseScene';
import { redirect } from 'next/navigation';
import { ButtonLink } from '@/components/ui';
import { getCurrentUser } from '@/web/session';
import styles from './page.module.css';

export default async function WelcomePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main className="page">
      <h1 className={styles.logo}>
        Ironed <span className={styles.logoIndent}>Out.</span>
      </h1>
      <p className={styles.tagline}>
        Book the tee time. Drop one link in the group chat. Let the foursome sort itself out.
      </p>
      <CourseScene />
      <div className={styles.actions}>
        <ButtonLink href="/signup" variant="primary">
          Create an account
        </ButtonLink>
        <ButtonLink href="/login">I already have one</ButtonLink>
      </div>
      <p className={styles.footnote}>
        Got an invite link from a friend? Just tap it. No account needed to grab a spot.
      </p>
    </main>
  );
}
