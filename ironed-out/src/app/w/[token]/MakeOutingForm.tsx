'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/forms/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { emptyForm, type FormState } from '@/web/form-state';

export function MakeOutingForm({ action }: { action: (prev: FormState) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, emptyForm);
  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Making your link…">Make the invite link</SubmitButton>
    </form>
  );
}
