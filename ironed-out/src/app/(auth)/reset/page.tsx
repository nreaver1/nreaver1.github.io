import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/forms/forms.module.css';
import { buttonClassName } from '@/components/ui';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'Pick a new password', referrer: 'no-referrer' };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="page page-tight">
      <h1 className={styles.title}>Pick a new password</h1>
      {token ? (
        <ResetForm token={token} />
      ) : (
        <>
          <p className={styles.lede}>That link is missing its code. Ask for a fresh one.</p>
          <Link href="/forgot" className={buttonClassName({ variant: 'primary' })}>
            Send a new link
          </Link>
        </>
      )}
    </main>
  );
}
