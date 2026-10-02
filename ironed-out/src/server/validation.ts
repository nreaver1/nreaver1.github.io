import type { z } from 'zod';
import { DomainError } from './errors';

/**
 * Validates input at a domain boundary. On failure throws `invalid_input` with the first message
 * per field in `details.fields`, so forms can show errors next to the right input.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) fields[String(issue.path[0] ?? 'form')] ??= issue.message;
    throw new DomainError('invalid_input', Object.values(fields)[0] ?? 'Check the form.', { fields });
  }
  return r.data;
}
