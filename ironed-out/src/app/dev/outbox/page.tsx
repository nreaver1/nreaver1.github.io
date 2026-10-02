import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { getOutbox } from '@/web/services';

export const metadata: Metadata = { title: 'Dev outbox', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Dev only: emails that would have been sent (no email provider is configured locally). */
export default function OutboxPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const messages = getOutbox().messages;
  return (
    <main className="page">
      <h1 style={{ fontSize: 46 }}>Dev outbox</h1>
      {messages.length === 0 && <p className="muted">Nothing sent yet.</p>}
      {messages.map((m, i) => (
        <Card key={i} as="article">
          <span className="muted">
            To {m.to} · {m.sentAt.toLocaleTimeString()}
          </span>
          <strong>{m.subject}</strong>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{m.text}</pre>
        </Card>
      ))}
    </main>
  );
}
