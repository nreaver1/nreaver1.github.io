import type { Metadata } from 'next';
import Link from 'next/link';
import { OutingHero } from '@/components/outing/OutingHero';
import { OutingPlayerView } from '@/components/outing/OutingPlayerView';
import { spotsText, teeSummary } from '@/components/outing/spots';
import { TeeSheet } from '@/components/outing/TeeSheet';
import { ButtonLink, buttonClassName } from '@/components/ui';
import { formatPlayDate } from '@/lib/format';
import { resolveInviteToken } from '@/server/domain/invites';
import { getOutingView, getPlayerName } from '@/server/domain/outings';
import { calendarLinks } from '@/web/outing-links';
import { getServices } from '@/web/services';
import { getViewer } from '@/web/viewer';
import {
  claimDirectAction,
  confirmClaimAction,
  dropOutAction,
  forgetDeviceAction,
  startClaimAction,
} from './actions';

type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  const services = await getServices();
  const outingId = await resolveInviteToken(services, token);
  if (!outingId) return null;
  const viewer = await getViewer();
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

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const data = await load(token);
  if (!data) return <ExpiredInvite />;
  const { view, viewer, services } = data;
  const calendar = calendarLinks(view, `${services.appUrl}/t/${token}`, `/t/${token}/calendar`);

  if (view.isOrganizer) {
    return (
      <main className="page page-tight">
        <OutingHero view={view} />
        <TeeSheet view={view} mode="organizer">
          <ButtonLink href={`/outings/${view.id}/share`} variant="primary">
            Share the link again
          </ButtonLink>
        </TeeSheet>
      </main>
    );
  }

  const knownName =
    viewer.via === 'account'
      ? viewer.name
      : viewer.playerId
        ? await getPlayerName(services, viewer.playerId)
        : null;

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
      />
      {viewer.via === 'anonymous' && (
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
