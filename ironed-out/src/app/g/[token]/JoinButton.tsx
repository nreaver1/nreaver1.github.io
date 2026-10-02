'use client';

import { useState, useTransition } from 'react';
import { FormError } from '@/components/forms/FormError';
import { Button } from '@/components/ui';
import { joinCrewAction } from '../../crews/actions';

export function JoinButton({ token, name }: { token: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <FormError message={error ?? undefined} />
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await joinCrewAction(token);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? 'Joining…' : `Join as ${name.split(' ')[0]}`}
      </Button>
    </>
  );
}
