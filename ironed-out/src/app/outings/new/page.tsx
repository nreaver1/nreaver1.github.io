import type { Metadata } from 'next';
import { BackLink } from '@/components/BackLink';
import { todayIn, upcomingWeekendDates } from '@/lib/format';
import { SeedProvider } from '@/server/domain/courses';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';
import styles from './new.module.css';
import { NewOutingForm } from './NewOutingForm';

export const metadata: Metadata = { title: 'New outing' };

export default async function NewOutingPage() {
  await requireUser('/outings/new');
  const { db } = await getServices();
  const initialCourses = await new SeedProvider(db).search({});
  const weekendDates = upcomingWeekendDates(todayIn('America/New_York'));
  return (
    <main className="page page-tight">
      <div className={styles.header}>
        <BackLink href="/home" label="Back to home" />
        <h1 className={styles.title}>New outing</h1>
      </div>
      <NewOutingForm weekendDates={weekendDates} initialCourses={initialCourses} />
    </main>
  );
}
