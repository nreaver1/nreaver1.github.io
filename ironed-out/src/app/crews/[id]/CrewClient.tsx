'use client';

import { useState, useTransition } from 'react';
import { CloseIcon } from '@/components/icons';
import { Button, ButtonLink, Card, Sheet } from '@/components/ui';
import type { CrewView } from '@/server/domain/crews';
import { leaveCrewAction, removeCrewMemberAction, rotateCrewLinkAction } from '../actions';
import styles from '../crews.module.css';

const PALETTE = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-3)',
  'var(--avatar-4)',
  'var(--avatar-5)',
];

export function CrewClient({ crew, url }: { crew: CrewView; url: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r?.error) setError(r.error);
    });

  return (
    <>
      <Card as="section" aria-labelledby="crew-name">
        <h2 id="crew-name" className={`display ${styles.crewName}`}>
          {crew.name}
        </h2>
        <ul className={styles.members} aria-label="Members">
          {crew.members.map((m) => (
            <li
              key={m.userId}
              className={[styles.member, m.status === 'pending' && styles.pending].filter(Boolean).join(' ')}
              style={
                m.status === 'pending'
                  ? undefined
                  : { background: PALETTE[m.name.charCodeAt(0) % PALETTE.length] }
              }
            >
              {m.status === 'pending'
                ? `${m.name} · invited`
                : m.isYou
                  ? `${m.name.split(' ')[0]} · you`
                  : m.name}
              {crew.isOwner && !m.isYou && (
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${m.name} from the crew`}
                  disabled={pending}
                  onClick={() => act(() => removeCrewMemberAction(crew.id, m.userId))}
                >
                  <CloseIcon size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className={styles.invite}>
          <div style={{ fontSize: 19 }}>Invite friends to the crew</div>
          <div className={styles.linkRow}>
            <output className={styles.link} aria-label="Crew invite link">
              {url.replace(/^https?:\/\//, '')}
            </output>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <p className="muted" style={{ fontSize: 16 }}>
            Members get a text when you post a new outing.
          </p>
          {crew.isOwner && (
            <Button
              variant="ghost"
              style={{ alignSelf: 'flex-start' }}
              disabled={pending}
              onClick={() => act(() => rotateCrewLinkAction(crew.id))}
            >
              Make a new link (the old one stops working)
            </Button>
          )}
        </div>
      </Card>
      <p className={styles.toast} role="status" aria-live="polite">
        {error}
      </p>
      <ButtonLink href={`/outings/new?crew=${crew.id}`} variant="primary">
        Start an outing with this crew
      </ButtonLink>
      <ButtonLink href="/crews/new">Make a new crew</ButtonLink>
      <Button variant="ghost" style={{ color: 'var(--red-text)' }} onClick={() => setLeaving(true)}>
        {crew.isOwner && crew.members.length === 1 ? 'Delete this crew' : 'Leave this crew'}
      </Button>

      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title={crew.isOwner && crew.members.length === 1 ? 'Delete the crew?' : 'Leave the crew?'}
      >
        <p>
          {crew.isOwner && crew.members.length === 1
            ? 'It’s just you, so the crew goes away. Outings you already made stay.'
            : 'You won’t hear about new outings from this crew anymore.'}
        </p>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await leaveCrewAction(crew.id);
              setLeaving(false);
              return r;
            })
          }
        >
          {pending ? 'One sec…' : 'Yes, leave'}
        </Button>
        <Button variant="ghost" onClick={() => setLeaving(false)}>
          Never mind
        </Button>
      </Sheet>
    </>
  );
}
