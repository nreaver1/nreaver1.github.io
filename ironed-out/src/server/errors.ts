export type DomainErrorCode =
  'invalid_input' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'gone';

/** An expected failure with a message that is safe to show to the user. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
