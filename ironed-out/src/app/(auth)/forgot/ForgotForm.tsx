'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/forms/FormError';
import styles from '@/components/forms/forms.module.css';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Input } from '@/components/ui';
import { emptyForm } from '@/web/form-state';
import { forgotAction } from '../actions';

export function ForgotForm() {
  const [state, action] = useActionState(forgotAction, emptyForm);
  if (state.ok) {
    return (
      <Card tone="success" role="status">
        {state.message}
      </Card>
    );
  }
  return (
    <form action={action} className={styles.form} noValidate>
      <FormError message={state.error} />
      <Input
        label="Email"
        name="email"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fields?.email}
      />
      <SubmitButton pendingLabel="Sending…">Email me a reset link</SubmitButton>
    </form>
  );
}
