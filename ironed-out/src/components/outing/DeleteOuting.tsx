'use client';

import { useState, useTransition } from 'react';
import { deleteOutingAction } from '@/app/outings/actions';
import { Button, Sheet } from '@/components/ui';
import type { OutingView } from '@/server/domain/outings';

/** Organizer-only "Delete this outing" with a confirmation sheet. Success redirects to Home. */
export function DeleteOuting({ view }: { view: OutingView }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Everyone but the organizer's own spot.
  const others = view.totalCount - view.openCount - 1;

  return (
    <>
      <Button variant="ghost" style={{ color: 'var(--red-text)' }} onClick={() => setOpen(true)}>
        Delete this outing
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Delete the outing?">
        <p>
          {others > 0
            ? `The tee sheet and the invite link go away. We’ll text or email the ${others === 1 ? 'player' : `${others} players`} who signed up that it’s canceled.`
            : 'The tee sheet and the invite link go away. This can’t be undone.'}
        </p>
        {error && (
          <p role="alert" style={{ color: 'var(--red-text)' }}>
            {error}
          </p>
        )}
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await deleteOutingAction(view.id);
              if (r?.error) setError(r.error);
            })
          }
        >
          {pending ? 'One sec…' : 'Yes, delete it'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </Sheet>
    </>
  );
}
