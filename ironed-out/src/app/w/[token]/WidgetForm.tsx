'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/forms/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { emptyForm, type FormState } from '@/web/form-state';

/** One-button form on the widget page ("Make the invite link", "Manage the tee sheet"). */
export function WidgetForm({
  action,
  label,
  pendingLabel,
  variant = 'primary',
}: {
  action: (prev: FormState) => Promise<FormState>;
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'default';
}) {
  const [state, formAction] = useActionState(action, emptyForm);
  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FormError message={state.error} />
      <SubmitButton pendingLabel={pendingLabel} variant={variant}>
        {label}
      </SubmitButton>
    </form>
  );
}
