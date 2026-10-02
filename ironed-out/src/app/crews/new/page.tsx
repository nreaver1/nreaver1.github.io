import type { Metadata } from 'next';
import { BackLink } from '@/components/BackLink';
import { requireUser } from '@/web/session';
import styles from '../crews.module.css';
import { NewCrewForm } from './NewCrewForm';

export const metadata: Metadata = { title: 'Make a crew' };

export default async function NewCrewPage() {
  await requireUser('/crews/new');
  return (
    <main className="page page-tight">
      <BackLink href="/crews?all=1" label="Back to crews" />
      <h1 className={styles.title}>Make a crew</h1>
      <p className="muted">Name the group you usually play with. You can invite them on the next screen.</p>
      <NewCrewForm />
    </main>
  );
}
