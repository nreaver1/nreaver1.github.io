'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './ui';

/** Submit button that disables itself and shows `pendingLabel` while the form's action runs. */
export function SubmitButton({ children, pendingLabel, ...rest }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending} aria-busy={pending} {...rest}>
      {pending ? (pendingLabel ?? 'One sec…') : children}
    </Button>
  );
}
