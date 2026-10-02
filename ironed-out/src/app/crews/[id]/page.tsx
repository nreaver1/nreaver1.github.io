import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/BottomNav';
import { getCrew } from '@/server/domain/crews';
import { getServices } from '@/web/services';
import { requireUser } from '@/web/session';
import styles from '../crews.module.css';
import { CrewClient } from './CrewClient';

export const metadata: Metadata = { title: 'Your crew' };

export default async function CrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/crews/${id}`);
  const services = await getServices();
  const crew = await getCrew(services, user.userId, id);
  if (!crew) notFound();
  return (
    <>
      <main className="page">
        <h1 className={styles.title}>Your crew</h1>
        <CrewClient crew={crew} url={`${services.appUrl}/g/${crew.inviteToken}`} appUrl={services.appUrl} />
      </main>
      <BottomNav current="crew" />
    </>
  );
}
