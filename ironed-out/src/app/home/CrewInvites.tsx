'use client';

import { useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';
import type { InviteForYou } from '@/server/domain/crews';
import { acceptCrewInviteAction, declineCrewInviteAction } from '../crews/actions';

/** "Mike invited you to Saturday Hackers" with Join / No thanks. */
export function CrewInvites({ invites }: { invites: InviteForYou[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {invites.map((i) => (
        <Card key={i.inviteId} tone="highlight" as="section" aria-label={`Invite to ${i.crewName}`}>
          <span>
            {i.fromName.split(' ')[0]} invited you to <strong>{i.crewName}</strong>. Join to hear about their
            tee times.
          </span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await acceptCrewInviteAction(i.inviteId);
                  if (r?.error) setError(r.error);
                })
              }
            >
              Join {i.crewName}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => start(async () => void (await declineCrewInviteAction(i.inviteId)))}
            >
              No thanks
            </Button>
          </div>
        </Card>
      ))}
      {error && (
        <p role="alert" style={{ color: 'var(--red-text)' }}>
          {error}
        </p>
      )}
    </>
  );
}
