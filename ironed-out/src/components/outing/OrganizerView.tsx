'use client';

import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui';
import type { Feed } from '@/server/domain/feed';
import type { OutingView } from '@/server/domain/outings';
import { DeleteOuting } from './DeleteOuting';
import type { OrganizerActions } from './organizer-actions';
import { SinceBanner } from './SinceBanner';
import { TeeSheet } from './TeeSheet';

/** The organizer's tee sheet with controls, plus what the crew changed since they last looked. */
export function OrganizerView({
  view,
  feed,
  markSeen,
  actions,
  shareHref,
}: {
  view: OutingView;
  feed: Feed;
  markSeen: (lastEventId: number) => Promise<void>;
  actions: OrganizerActions;
  shareHref: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const baselined = useRef(false);
  useEffect(() => {
    if (!feed.hasRecord && !baselined.current) {
      baselined.current = true;
      void markSeen(view.lastEventId);
    }
  }, [feed.hasRecord, markSeen, view.lastEventId]);

  return (
    <>
      {!dismissed && (
        <SinceBanner
          feed={feed}
          inOuting={false}
          grab={null}
          onSeen={() => {
            setDismissed(true);
            void markSeen(view.lastEventId);
          }}
        />
      )}
      <TeeSheet view={view} mode="organizer" organizer={actions} newTeeTimeIds={[]}>
        <ButtonLink href={shareHref} variant="primary">
          Share the link again
        </ButtonLink>
      </TeeSheet>
      <DeleteOuting view={view} onDelete={actions.deleteOuting} />
    </>
  );
}
