'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/forms/FormError';
import styles from '@/components/forms/forms.module.css';
import { SubmitButton } from '@/components/SubmitButton';
import { Input } from '@/components/ui';
import { emptyForm } from '@/web/form-state';
import { deleteAccountAction } from './actions';

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, emptyForm);
  return (
    <form action={action} className={styles.form} noValidate>
      <FormError message={state.error} />
      <Input
        label="Your password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fields?.password}
      />
      <SubmitButton variant="danger" pendingLabel="Deleting…">
        Delete my account
      </SubmitButton>
    </form>
  );
}
