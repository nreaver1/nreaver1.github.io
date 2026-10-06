import { CourseScene } from '@/components/illustrations/CourseScene';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ButtonLink, buttonClassName } from '@/components/ui';
import { isSmsDemo, getEnv } from '@/server/env';
import { getCurrentUser } from '@/web/session';
import styles from './page.module.css';

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  if (await getCurrentUser()) redirect('/home');
  const deleted = (await searchParams).deleted === '1';
  return (
    <main className="page">
      {deleted && (
        <p role="status" className={styles.footnote}>
          Your account is deleted. Thanks for playing a round with us.
        </p>
      )}
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
      {isSmsDemo(getEnv()) && (
        <a href="/demo" className={buttonClassName({ variant: 'ghost' })} style={{ alignSelf: 'center' }}>
          See a sample invite
        </a>
      )}
      <p className={styles.footnote}>
        <Link href="/privacy" className={styles.legal}>
          Privacy
        </Link>
        {' · '}
        <Link href="/developers" className={styles.legal}>
          For booking platforms
        </Link>
      </p>
    </main>
  );
}
