'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { ClaimActionState } from '@/app/t/[token]/actions';
import { CalendarIcon } from '@/components/icons';
import { Button, ButtonLink, Sheet } from '@/components/ui';
import { formatTime } from '@/lib/format';
import type { Feed } from '@/server/domain/feed';
import type { OutingView } from '@/server/domain/outings';
import { ClaimSheet, type ClaimActions, type ClaimTarget } from './ClaimSheet';
import styles from './outing.module.css';
import { SinceBanner } from './SinceBanner';
import { TeeSheet } from './TeeSheet';

export type PlayerViewProps = {
  view: OutingView;
  /** Claim actions; omitted when the viewer can't claim from this page. */
  actions?: ClaimActions;
  dropOut?: () => Promise<ClaimActionState>;
  knownName: string | null;
  smsDemo: boolean;
  calendar: { ics: string; google: string } | null;
  /** "Since you last looked" data; omitted where there's no feed. */
  feed?: Feed;
  markSeen?: (lastEventId: number) => Promise<void>;
};

/** What a player (not the organizer) sees: the tee sheet, the claim sheet, drop out, calendar. */
export function OutingPlayerView({
  view,
  actions,
  dropOut,
  knownName,
  smsDemo,
  calendar,
  feed,
  markSeen,
}: PlayerViewProps) {
  const [target, setTarget] = useState<ClaimTarget | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const time = (iso: string) => formatTime(iso, view.timezone);
  const inOuting = !!view.viewerTeeTimeId;
  const [dismissed, setDismissed] = useState(false);

  // First visit: record a baseline so the next visit can say what changed.
  const baselined = useRef(false);
  useEffect(() => {
    if (feed && !feed.hasRecord && markSeen && !baselined.current) {
      baselined.current = true;
      void markSeen(view.lastEventId);
    }
  }, [feed, markSeen, view.lastEventId]);

  const seen = () => {
    setDismissed(true);
    void markSeen?.(view.lastEventId);
  };
  const showFeed = feed && !dismissed;
  const freshSlotIds = showFeed ? feed.freshSlotIds : [];
  const newTeeTimeIds = showFeed ? feed.newTeeTimeIds : [];

  const pick = (slotId: string) => {
    const tee = view.teeTimes.find((t) => t.slots.some((s) => s.id === slotId));
    if (tee) setTarget({ slotId, time: time(tee.startsAt) });
  };

  /** After "someone just grabbed that spot", offer the first open one from the fresh sheet. */
  const offerNext = () => {
    const next = view.teeTimes.flatMap((t) => t.slots.filter((s) => s.open && s.id !== target?.slotId))[0];
    if (next) pick(next.id);
  };

  const firstFresh = view.teeTimes
    .flatMap((t) => t.slots.map((s) => ({ s, t })))
    .find(({ s }) => s.open && freshSlotIds.includes(s.id));
  const grab =
    firstFresh && actions && !inOuting && !view.locked
      ? { label: `Grab the ${time(firstFresh.t.startsAt)} spot`, onGrab: () => pick(firstFresh.s.id) }
      : null;

  return (
    <>
      {feed && !dismissed && <SinceBanner feed={feed} inOuting={inOuting} grab={grab} onSeen={seen} />}
      <TeeSheet
        view={view}
        mode="friend"
        freshSlotIds={freshSlotIds}
        newTeeTimeIds={newTeeTimeIds}
        onClaim={actions && !inOuting ? (slot) => pick(slot.id) : undefined}
        onDropOut={dropOut ? () => setDropping(true) : undefined}
      >
        <p className={styles.toast} role="status" aria-live="polite">
          {error}
        </p>
        {calendar && (inOuting || !actions) && (
          <Button onClick={() => setCalOpen(true)}>
            <CalendarIcon /> Add to my calendar
          </Button>
        )}
      </TeeSheet>

      {actions && (
        <ClaimSheet
          target={target}
          onClose={() => setTarget(null)}
          openSpots={view.openCount}
          knownName={knownName}
          actions={actions}
          smsDemo={smsDemo}
          onTaken={offerNext}
          onClaimed={seen}
          calendar={calendar}
        />
      )}

      <Sheet open={calOpen} onClose={() => setCalOpen(false)} title="Add to my calendar">
        {calendar && (
          <>
            <ButtonLink href={calendar.ics} prefetch={false}>
              Apple / Outlook (.ics)
            </ButtonLink>
            <a
              className="calendar-google"
              href={calendar.google}
              target="_blank"
              rel="noreferrer"
              style={{ textAlign: 'center', minHeight: 44, display: 'grid', placeItems: 'center' }}
            >
              Google Calendar
            </a>
          </>
        )}
      </Sheet>

      <Sheet open={dropping} onClose={() => setDropping(false)} title="Drop out?">
        <p>
          Your spot
          {view.teeTimes.some((t) => t.slots.some((s) => s.isYourGuest))
            ? ' and your guests’ spots'
            : ''}{' '}
          will open up for the crew.
        </p>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await dropOut!();
              setDropping(false);
              if (r.error) setError(r.error);
            })
          }
        >
          {pending ? 'Dropping out…' : 'Yes, drop me'}
        </Button>
        <Button variant="ghost" onClick={() => setDropping(false)}>
          Never mind
        </Button>
      </Sheet>
    </>
  );
}
