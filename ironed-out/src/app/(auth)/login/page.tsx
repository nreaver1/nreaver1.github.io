import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BackLink } from '@/components/BackLink';
import styles from '@/components/forms/forms.module.css';
import { safeNext } from '@/web/form-state';
import { getCurrentUser } from '@/web/session';
import { LogInForm } from './LogInForm';

export const metadata: Metadata = { title: 'Log in' };

export default async function LogInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next ?? '/home');
  if (await getCurrentUser()) redirect(next);
  return (
    <main className="page page-tight">
      <BackLink href="/" />
      <h1 className={styles.title}>Welcome back</h1>
      <LogInForm next={next} />
    </main>
  );
}
