import type { Metadata } from 'next';
import { BackLink } from '@/components/BackLink';
import { todayIn, upcomingWeekendDates } from '@/lib/format';
import { SeedProvider } from '@/server/domain/courses';
import { listCrews } from '@/server/domain/crews';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';
import styles from './new.module.css';
import { NewOutingForm } from './NewOutingForm';

export const metadata: Metadata = { title: 'New outing' };

export default async function NewOutingPage({ searchParams }: { searchParams: Promise<{ crew?: string }> }) {
  const user = await requireUser('/outings/new');
  const services = await getServices();
  const [initialCourses, crews] = await Promise.all([
    new SeedProvider(services.db).search({}),
    listCrews(services, user.userId),
  ]);
  const wanted = (await searchParams).crew;
  const initialCrewId = crews.some((c) => c.id === wanted) ? wanted! : '';
  const weekendDates = upcomingWeekendDates(todayIn('America/New_York'));
  return (
    <main className="page page-tight">
      <div className={styles.header}>
        <BackLink href="/home" label="Back to home" />
        <h1 className={styles.title}>New outing</h1>
      </div>
      <NewOutingForm
        weekendDates={weekendDates}
        initialCourses={initialCourses}
        crews={crews.map((c) => ({ id: c.id, name: c.name }))}
        initialCrewId={initialCrewId}
      />
    </main>
  );
}
