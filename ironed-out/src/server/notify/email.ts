export type EmailMessage = { to: string; subject: string; text: string };

export interface Mailer {
  readonly kind: 'resend' | 'outbox';
  send(message: EmailMessage): Promise<void>;
}

/**
 * Keeps messages in memory instead of sending them. Used in tests and in dev, where the
 * /dev/outbox page shows them. Never logs message bodies (they can contain reset links).
 */
export class OutboxMailer implements Mailer {
  readonly kind = 'outbox';
  readonly messages: (EmailMessage & { sentAt: Date })[] = [];
  constructor(private readonly limit = 50) {}
  async send(message: EmailMessage) {
    this.messages.unshift({ ...message, sentAt: new Date() });
    this.messages.length = Math.min(this.messages.length, this.limit);
  }
}

/** Resend (https://resend.com) over plain fetch. */
export class ResendMailer implements Mailer {
  readonly kind = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send({ to, subject, text }: EmailMessage) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
  }
}
