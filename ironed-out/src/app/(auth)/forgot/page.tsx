import type { Metadata } from 'next';
import { BackLink } from '@/components/BackLink';
import styles from '@/components/forms/forms.module.css';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPage() {
  return (
    <main className="page page-tight">
      <BackLink href="/login" />
      <h1 className={styles.title}>Forgot it?</h1>
      <p className={styles.lede}>Happens to the best of us. We&apos;ll email you a link to pick a new one.</p>
      <ForgotForm />
    </main>
  );
}
