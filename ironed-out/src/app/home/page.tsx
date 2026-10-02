import type { Metadata } from 'next';
import { Button } from '@/components/ui';
import { requireUser } from '@/web/session';
import { logOutAction } from '../(auth)/actions';

export const metadata: Metadata = { title: 'Home' };

export default async function HomePage() {
  const user = await requireUser('/home');
  const first = user.name.split(' ')[0];
  return (
    <main className="page">
      <h1 style={{ fontSize: 46 }}>Hey {first}.</h1>
      <p className="muted">Here&apos;s what&apos;s on the tee sheet.</p>
      <form action={logOutAction}>
        <Button type="submit" variant="ghost">
          Log out
        </Button>
      </form>
    </main>
  );
}
