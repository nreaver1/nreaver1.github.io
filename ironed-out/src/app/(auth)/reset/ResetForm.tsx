'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/forms/FormError';
import styles from '@/components/forms/forms.module.css';
import { SubmitButton } from '@/components/SubmitButton';
import { Input } from '@/components/ui';
import { emptyForm } from '@/web/form-state';
import { resetAction } from '../actions';

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetAction, emptyForm);
  return (
    <form action={action} className={styles.form} noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <Input
        label="New password"
        name="password"
        type="password"
        placeholder="8+ characters"
        autoComplete="new-password"
        required
        minLength={8}
        error={state.fields?.password}
      />
      <SubmitButton pendingLabel="Saving…">Save and log in</SubmitButton>
    </form>
  );
}
