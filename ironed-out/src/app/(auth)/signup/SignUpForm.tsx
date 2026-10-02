'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormError } from '@/components/forms/FormError';
import styles from '@/components/forms/forms.module.css';
import { SubmitButton } from '@/components/SubmitButton';
import { buttonClassName, Input } from '@/components/ui';
import { emptyForm } from '@/web/form-state';
import { signUpAction } from '../actions';

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUpAction, emptyForm);
  return (
    <form action={action} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <Input
        label="Your name"
        name="name"
        placeholder="Mike"
        autoComplete="name"
        required
        maxLength={60}
        defaultValue={state.values?.name}
        error={state.fields?.name}
      />
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
        placeholder="8+ characters"
        autoComplete="new-password"
        required
        minLength={8}
        error={state.fields?.password}
      />
      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
      <p className={styles.note}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" />
        </svg>
        Your password is salted and hashed. We never store or see it.
      </p>
      <Link
        href={{ pathname: '/login', query: next !== '/home' ? { next } : {} }}
        className={buttonClassName({ variant: 'ghost' })}
      >
        Already have one? Log in
      </Link>
    </form>
  );
}
