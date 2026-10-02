'use client';

import { useState, useTransition } from 'react';
import type { ClaimActionState } from '@/app/t/[token]/actions';
import { CalendarIcon } from '@/components/icons';
import { Button, ButtonLink, Sheet } from '@/components/ui';
import { formatTime } from '@/lib/format';
import type { OutingView } from '@/server/domain/outings';
import { ClaimSheet, type ClaimActions, type ClaimTarget } from './ClaimSheet';
import styles from './outing.module.css';
import { TeeSheet } from './TeeSheet';

export type PlayerViewProps = {
  view: OutingView;
  /** Claim actions; omitted when the viewer can't claim from this page. */
  actions?: ClaimActions;
  dropOut?: () => Promise<ClaimActionState>;
  knownName: string | null;
  smsDemo: boolean;
  calendar: { ics: string; google: string } | null;
  freshSlotIds?: string[];
  newTeeTimeIds?: string[];
  /** Rendered above the tee sheet (the "Since you last looked" banner). */
  banner?: (grab: (slotId: string) => void) => React.ReactNode;
};

/** What a player (not the organizer) sees: the tee sheet, the claim sheet, drop out, calendar. */
export function OutingPlayerView({
  view,
  actions,
  dropOut,
  knownName,
  smsDemo,
  calendar,
  freshSlotIds,
  newTeeTimeIds,
  banner,
}: PlayerViewProps) {
  const [target, setTarget] = useState<ClaimTarget | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const time = (iso: string) => formatTime(iso, view.timezone);
  const inOuting = !!view.viewerTeeTimeId;

  const pick = (slotId: string) => {
    const tee = view.teeTimes.find((t) => t.slots.some((s) => s.id === slotId));
    if (tee) setTarget({ slotId, time: time(tee.startsAt) });
  };

  /** After "someone just grabbed that spot", offer the first open one from the fresh sheet. */
  const offerNext = () => {
    const next = view.teeTimes.flatMap((t) => t.slots.filter((s) => s.open && s.id !== target?.slotId))[0];
    if (next) pick(next.id);
  };

  return (
    <>
      {banner?.(pick)}
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
          {view.teeTimes.some((t) => t.slots.some((s) => s.isYourGuest)) ? ' and your guests’ spots' : ''}{' '}
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
