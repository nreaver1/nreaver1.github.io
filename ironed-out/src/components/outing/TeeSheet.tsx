'use client';

import { useState, useTransition } from 'react';
import {
  addTeeTimeAction,
  changeCapacityAction,
  deleteTeeTimeAction,
  removePlayerAction,
  setLockedAction,
} from '@/app/outings/actions';
import { CloseIcon, MinusIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { Button } from '@/components/ui';
import { formatTime } from '@/lib/format';
import type { OutingView, SlotView, TeeTimeView } from '@/server/domain/outings';
import styles from './outing.module.css';
import { spotsText } from './spots';

const PALETTE = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-3)',
  'var(--avatar-4)',
  'var(--avatar-5)',
];

export type TeeSheetProps = {
  view: OutingView;
  mode: 'organizer' | 'friend';
  /** Slots that opened since the viewer last looked (sand + wiggle). */
  freshSlotIds?: string[];
  /** Tee times added since the viewer last looked. */
  newTeeTimeIds?: string[];
  onClaim?: (slot: SlotView, tee: TeeTimeView) => void;
  onDropOut?: () => void;
  /** Extra controls under the sheet (share button etc.). */
  children?: React.ReactNode;
};

export function TeeSheet({
  view,
  mode,
  freshSlotIds = [],
  newTeeTimeIds = [],
  onClaim,
  onDropOut,
  children,
}: TeeSheetProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isOrg = mode === 'organizer';
  const editable = isOrg && !view.locked;
  const time = (t: TeeTimeView) => formatTime(t.startsAt, view.timezone);

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
    });

  return (
    <section aria-labelledby="tee-sheet-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={styles.sheetHead}>
        <h2 id="tee-sheet-title" className={styles.sheetTitle}>
          The tee sheet
        </h2>
        <div className={styles.spotsText}>{spotsText(view)}</div>
      </div>

      {view.teeTimes.map((tee) => {
        const hasOpen = tee.slots.some((s) => s.open);
        const canLess = tee.capacity > 2 && hasOpen;
        const canAdd = tee.capacity < 5;
        const canDel = view.teeTimes.length > 1 && tee.filled === 0;
        return (
          <article key={tee.id} className={styles.tee} aria-label={`${time(tee)} tee time`}>
            <div className={styles.teeHead}>
              <div className={styles.teeTitle}>
                <h3 className={`display ${styles.teeTime}`}>{time(tee)}</h3>
                <span className={styles.teeCount}>
                  {tee.filled} of {tee.capacity} filled
                </span>
                {newTeeTimeIds.includes(tee.id) && <span className={styles.newTag}>new</span>}
              </div>
              {editable && (
                <div className={styles.teeTools}>
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label={`Remove an empty spot from ${time(tee)}`}
                    disabled={!canLess || pending}
                    onClick={() => run(() => changeCapacityAction(tee.id, -1))}
                  >
                    <MinusIcon />
                  </button>
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label={`Add a spot to ${time(tee)}`}
                    disabled={!canAdd || pending}
                    onClick={() => run(() => changeCapacityAction(tee.id, 1))}
                  >
                    <PlusIcon />
                  </button>
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label={`Delete the ${time(tee)} tee time`}
                    disabled={!canDel || pending}
                    onClick={() => run(() => deleteTeeTimeAction(tee.id))}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
            <div className={styles.grid}>
              {tee.slots.map((slot) =>
                slot.open ? (
                  <OpenSlot
                    key={slot.id}
                    label={
                      view.locked
                        ? 'Locked'
                        : isOrg || !onClaim
                          ? 'Open'
                          : freshSlotIds.includes(slot.id)
                            ? 'Just opened!'
                            : 'Open · grab it'
                    }
                    aria={`Open spot at ${time(tee)}`}
                    fresh={!isOrg && freshSlotIds.includes(slot.id) && !view.locked}
                    disabled={isOrg || view.locked || !onClaim}
                    onClick={() => onClaim?.(slot, tee)}
                  />
                ) : (
                  <FilledSlot
                    key={slot.id}
                    slot={slot}
                    canRemove={editable && slot.tag !== 'organizer'}
                    canDrop={!isOrg && slot.isYou && !view.locked && !!onDropOut}
                    onRemove={() => run(() => removePlayerAction(slot.id))}
                    onDrop={() => onDropOut?.()}
                    pending={pending}
                  />
                ),
              )}
            </div>
          </article>
        );
      })}

      <p className={styles.toast} role="status" aria-live="polite">
        {error}
      </p>

      {isOrg && (
        <div className={styles.orgActions}>
          {!view.locked && (
            <Button
              disabled={pending || view.teeTimes.length >= 6}
              onClick={() => run(() => addTeeTimeAction(view.id))}
            >
              <PlusIcon /> Add another tee time
            </Button>
          )}
          <Button
            aria-pressed={view.locked}
            variant={view.locked ? 'danger' : 'default'}
            disabled={pending}
            onClick={() => run(() => setLockedAction(view.id, !view.locked))}
          >
            {view.locked ? 'Unlock the outing' : 'Lock it in'}
          </Button>
          {children}
          <p className={styles.hint}>Removing someone texts them. Locking stops new claims and drop-outs.</p>
        </div>
      )}
      {!isOrg && children}
    </section>
  );
}

function OpenSlot(props: {
  label: string;
  aria: string;
  fresh: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[styles.open, props.fresh && styles.fresh].filter(Boolean).join(' ')}
      aria-label={props.disabled ? props.aria : `${props.aria}. Grab it`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function FilledSlot({
  slot,
  canRemove,
  canDrop,
  onRemove,
  onDrop,
  pending,
}: {
  slot: SlotView;
  canRemove: boolean;
  canDrop: boolean;
  onRemove: () => void;
  onDrop: () => void;
  pending: boolean;
}) {
  const isGuest = slot.tag === 'guest';
  const name = slot.isYou ? `${slot.name} (you)` : (slot.name ?? '');
  const background = slot.isYou
    ? 'var(--sun)'
    : isGuest
      ? 'var(--white)'
      : PALETTE[slot.colorKey % PALETTE.length];
  return (
    <div className={styles.filled}>
      <div className={styles.avatar} style={{ background }} aria-hidden="true">
        {isGuest ? '+1' : (slot.name ?? '?').charAt(0).toUpperCase()}
      </div>
      <div className={styles.who}>
        <div className={styles.whoName}>{name}</div>
        {slot.tag && <div className={styles.whoTag}>{slot.tag}</div>}
        {canDrop && (
          <button type="button" className={styles.dropOut} onClick={onDrop} disabled={pending}>
            Drop out
          </button>
        )}
      </div>
      {canRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove ${slot.name}`}
          onClick={onRemove}
          disabled={pending}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
