'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/forms/FormError';
import formStyles from '@/components/forms/forms.module.css';
import { SubmitButton } from '@/components/SubmitButton';
import { Input } from '@/components/ui';
import { emptyForm } from '@/web/form-state';
import { createCrewAction } from '../actions';

export function NewCrewForm() {
  const [state, action] = useActionState(createCrewAction, emptyForm);
  return (
    <form action={action} className={formStyles.form} noValidate>
      <FormError message={state.error} />
      <Input
        label="Crew name"
        name="name"
        placeholder="Saturday Hackers"
        maxLength={40}
        required
        defaultValue={state.values?.name}
        error={state.fields?.name}
      />
      <SubmitButton pendingLabel="Making it…">Make the crew</SubmitButton>
    </form>
  );
}
