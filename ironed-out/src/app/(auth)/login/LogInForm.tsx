'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormError } from '@/components/forms/FormError';
import styles from '@/components/forms/forms.module.css';
import { SubmitButton } from '@/components/SubmitButton';
import { buttonClassName, Input } from '@/components/ui';
import { emptyForm } from '@/web/form-state';
import { logInAction } from '../actions';

export function LogInForm({ next }: { next: string }) {
  const [state, action] = useActionState(logInAction, emptyForm);
  const ghost = buttonClassName({ variant: 'ghost' });
  return (
    <form action={action} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next} />
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
      <Input
        label="Password"
        name="password"
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        required
        error={state.fields?.password}
      />
      <SubmitButton pendingLabel="Logging in…">Log in</SubmitButton>
      <div className={styles.links}>
        <Link href="/forgot" className={ghost}>
          Forgot password?
        </Link>
        <Link href={{ pathname: '/signup', query: next !== '/home' ? { next } : {} }} className={ghost}>
          Create account
        </Link>
      </div>
    </form>
  );
}
