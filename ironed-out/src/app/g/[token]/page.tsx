import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClassName, ButtonLink } from '@/components/ui';
import { resolveCrewToken } from '@/server/domain/crews';
import { getServices } from '@/web/services';
import { getCurrentUser } from '@/web/session';
import { JoinButton } from './JoinButton';

export const metadata: Metadata = {
  title: 'Join the crew',
  robots: { index: false },
  referrer: 'no-referrer',
};

/** /g/<token>: a crew invite. Joining needs an account (crew members get outing alerts). */
export default async function CrewInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const crew = await resolveCrewToken(await getServices(), token);
  if (!crew) {
    return (
      <main className="page">
        <h1 style={{ fontSize: 46 }}>This crew link has run its course</h1>
        <p>It expired or the crew’s owner made a new one. Ask them for a fresh link.</p>
        <Link href="/" className={buttonClassName({})}>
          What’s Ironed Out?
        </Link>
      </main>
    );
  }
  const user = await getCurrentUser();
  const next = encodeURIComponent(`/g/${token}`);
  return (
    <main className="page">
      <p className="muted">{crew.ownerName.split(' ')[0]} invited you to</p>
      <h1 style={{ fontSize: 52, color: 'var(--fairway-dark)' }}>{crew.name}</h1>
      <p style={{ fontSize: 19 }}>
        {crew.memberCount} {crew.memberCount === 1 ? 'golfer' : 'golfers'} so far. Join and you’ll get a text
        whenever someone posts a new outing.
      </p>
      {user ? (
        <JoinButton token={token} name={user.name} />
      ) : (
        <>
          <ButtonLink href={`/signup?next=${next}`} variant="primary">
            Make an account to join
          </ButtonLink>
          <ButtonLink href={`/login?next=${next}`}>I already have one</ButtonLink>
        </>
      )}
    </main>
  );
}
