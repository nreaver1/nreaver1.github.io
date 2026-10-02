import { isDomainError } from '@/server/errors';

/** What a server action hands back to a form. */
export type FormState = {
  error?: string;
  fields?: Record<string, string>;
  /** Echo of non-secret inputs so the form can keep them after an error. */
  values?: Record<string, string>;
  ok?: boolean;
  message?: string;
};

export const emptyForm: FormState = {};

/** Converts expected domain failures into form state; anything else is re-thrown. */
export function toFormState(e: unknown, values?: Record<string, string>): FormState {
  if (isDomainError(e)) {
    const fields = (e.details?.fields as Record<string, string> | undefined) ?? undefined;
    return { error: fields ? undefined : e.message, fields, values };
  }
  throw e;
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
}

/** Only allow same-site relative redirect targets. */
export function safeNext(next: string, fallback = '/home'): string {
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}
