import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BackLink } from '@/components/BackLink';
import styles from '@/components/forms/forms.module.css';
import { safeNext } from '@/web/form-state';
import { getCurrentUser } from '@/web/session';
import { SignUpForm } from './SignUpForm';

export const metadata: Metadata = { title: 'Make an account' };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next ?? '/home');
  if (await getCurrentUser()) redirect(next);
  return (
    <main className="page page-tight">
      <BackLink href="/" />
      <h1 className={styles.title}>Make an account</h1>
      <p className={styles.lede}>So you can start outings and keep your crew in one place.</p>
      <SignUpForm next={next} />
    </main>
  );
}
