import type { Metadata } from 'next';
import Link from 'next/link';
import { OutingHero } from '@/components/outing/OutingHero';
import { OutingPlayerView } from '@/components/outing/OutingPlayerView';
import { spotsText, teeSummary } from '@/components/outing/spots';
import { OrganizerConfirm } from '@/components/outing/OrganizerConfirm';
import { OrganizerView } from '@/components/outing/OrganizerView';
import { buttonClassName } from '@/components/ui';
import { formatPlayDate } from '@/lib/format';
import { getFeed } from '@/server/domain/feed';
import { organizerCanConfirm } from '@/server/domain/organizer-access';
import { getOutingView, getPlayerName } from '@/server/domain/outings';
import { calendarLinks } from '@/web/outing-links';
import { resolveInvite } from '@/web/invite';
import {
  claimDirectAction,
  confirmOrganizerAction,
  confirmClaimAction,
  dropOutAction,
  forgetDeviceAction,
  inviteAddTeeTimeAction,
  inviteChangeCapacityAction,
  inviteDeleteOutingAction,
  inviteDeleteTeeTimeAction,
  inviteRemovePlayerAction,
  inviteSetLockedAction,
  markSeenAction,
  startClaimAction,
  startOrganizerConfirmAction,
} from './actions';

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ deleted?: string }>;
};

async function load(token: string) {
  const invite = await resolveInvite(token);
  if (!invite) return null;
  const { services, outingId, viewer } = invite;
  const view = await getOutingView(services, outingId, viewer.playerId);
  return view ? { services, viewer, view } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const data = await load(token);
  if (!data) return { title: 'Invite expired', robots: { index: false } };
  const { view, services } = data;
  const title = `${view.course.name} · ${formatPlayDate(view.playDate)}`;
  const description = `${teeSummary(view)}. ${spotsText(view)}. Tap to grab one.`;
  const image = `${services.appUrl}/t/${token}/og?v=${view.version}`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }], type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function InvitePage({ params, searchParams }: Props) {
  const { token } = await params;
  const data = await load(token);
  if (!data) return (await searchParams).deleted ? <DeletedOuting /> : <ExpiredInvite />;
  const { view, viewer, services } = data;
  const calendar = calendarLinks(view, `${services.appUrl}/t/${token}`, `/t/${token}/calendar`);
  const feed = await getFeed(services, view, viewer.viewerKey, viewer.playerId);
  const markSeen = markSeenAction.bind(null, token);

  if (view.isOrganizer) {
    return (
      <main className="page page-tight">
        <OutingHero view={view} />
        <OrganizerView
          view={view}
          feed={feed}
          markSeen={markSeen}
          shareHref={`/t/${token}/share`}
          actions={{
            addTeeTime: inviteAddTeeTimeAction.bind(null, token),
            changeCapacity: inviteChangeCapacityAction.bind(null, token),
            deleteTeeTime: inviteDeleteTeeTimeAction.bind(null, token),
            removePlayer: inviteRemovePlayerAction.bind(null, token),
            setLocked: inviteSetLockedAction.bind(null, token),
            deleteOuting: inviteDeleteOutingAction.bind(null, token),
          }}
        />
      </main>
    );
  }

  const knownName =
    viewer.via === 'account'
      ? viewer.name
      : viewer.playerId
        ? await getPlayerName(services, viewer.playerId)
        : null;
  // Partner bookings: the booker has no account, so on a new device they confirm their number.
  const canConfirm = await organizerCanConfirm(services, view.id);

  return (
    <main className="page page-tight">
      <OutingHero view={view} />
      <OutingPlayerView
        view={view}
        knownName={knownName}
        smsDemo={services.smsDemo}
        calendar={calendar}
        actions={{
          startClaim: startClaimAction.bind(null, token),
          confirmClaim: confirmClaimAction.bind(null, token),
          claimDirect: claimDirectAction.bind(null, token),
          forgetDevice: viewer.via === 'device' ? forgetDeviceAction.bind(null, token) : undefined,
        }}
        dropOut={viewer.playerId ? dropOutAction.bind(null, token) : undefined}
        feed={feed}
        markSeen={markSeen}
      />
      {canConfirm && (
        <OrganizerConfirm
          organizerName={view.organizerName}
          smsDemo={services.smsDemo}
          start={startOrganizerConfirmAction.bind(null, token)}
          confirm={confirmOrganizerAction.bind(null, token)}
        />
      )}
      {viewer.via === 'anonymous' && !canConfirm && (
        <p className="muted" style={{ fontSize: 16, textAlign: 'center' }}>
          Organizing your own round?{' '}
          <Link href="/signup" style={{ display: 'inline-block', minHeight: 44, lineHeight: '44px' }}>
            Make a free account
          </Link>
        </p>
      )}
    </main>
  );
}

function DeletedOuting() {
  return (
    <main className="page">
      <h1 style={{ fontSize: 46 }}>Outing deleted</h1>
      <p>
        The tee sheet and its link are gone. Anyone who had a spot gets a text or email that it’s canceled.
      </p>
    </main>
  );
}

function ExpiredInvite() {
  return (
    <main className="page">
      <h1 style={{ fontSize: 46 }}>This link has run its course</h1>
      <p>The invite expired or the organizer turned it off. Ask them for a fresh link.</p>
      <Link href="/" className={buttonClassName({})}>
        What’s Ironed Out?
      </Link>
    </main>
  );
}
