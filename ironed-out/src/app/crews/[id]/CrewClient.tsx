'use client';

import { useState, useTransition } from 'react';
import { FormError } from '@/components/forms/FormError';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { Button, ButtonLink, Card, Input, Sheet } from '@/components/ui';
import type { CrewView } from '@/server/domain/crews';
import {
  cancelCrewInviteAction,
  inviteToCrewAction,
  leaveCrewAction,
  removeCrewMemberAction,
  rotateCrewLinkAction,
  type InviteActionResult,
} from '../actions';
import styles from '../crews.module.css';

const PALETTE = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-3)',
  'var(--avatar-4)',
  'var(--avatar-5)',
];

function CopyButton({
  text,
  label = 'Copy',
  size = 'sm' as const,
}: {
  text: string;
  label?: string;
  size?: 'sm';
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Copied!' : label}
    </Button>
  );
}

export function CrewClient({ crew, url, appUrl }: { crew: CrewView; url: string; appUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [inviting, setInviting] = useState(false);
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
              className={styles.member}
              style={{ background: PALETTE[m.name.charCodeAt(0) % PALETTE.length] }}
            >
              {m.isYou ? `${m.name.split(' ')[0]} · you` : m.name}
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
          {crew.invited.map((i) => (
            <li key={i.inviteId} className={[styles.member, styles.pending].join(' ')}>
              {i.name} · invited
            </li>
          ))}
        </ul>
        <div className={styles.invite}>
          <div style={{ fontSize: 19 }}>Invite friends to the crew</div>
          <div className={styles.linkRow}>
            <output className={styles.link} aria-label="Crew invite link">
              {url.replace(/^https?:\/\//, '')}
            </output>
            <CopyButton text={url} />
          </div>
          <p className="muted" style={{ fontSize: 16 }}>
            Members get a text when you post a new outing.
          </p>
          {crew.isOwner && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setInviting(true)}
                style={{ alignSelf: 'flex-start' }}
              >
                <PlusIcon size={18} /> Invite someone by text or email
              </Button>
              <Button
                variant="ghost"
                style={{ alignSelf: 'flex-start' }}
                disabled={pending}
                onClick={() => act(() => rotateCrewLinkAction(crew.id))}
              >
                Make a new link (the old one stops working)
              </Button>
            </>
          )}
        </div>
      </Card>

      {crew.isOwner && crew.invited.length > 0 && (
        <Card as="section" aria-labelledby="invited-title">
          <h2 id="invited-title" className="display" style={{ fontSize: 26 }}>
            Waiting on
          </h2>
          <ul className={styles.inviteList}>
            {crew.invited.map((i) => (
              <li key={i.inviteId} className={styles.inviteRow}>
                <span className={styles.inviteWho}>
                  <span>{i.name}</span>
                  <span className="muted" style={{ fontSize: 15 }}>
                    {i.contact}
                  </span>
                </span>
                <span className={styles.inviteActions}>
                  {i.token && <CopyButton text={`${appUrl}/g/${i.token}`} label="Copy link" />}
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Cancel ${i.name}'s invite`}
                    disabled={pending}
                    onClick={() => act(() => cancelCrewInviteAction(i.inviteId))}
                  >
                    <CloseIcon size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

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

      <InviteSheet open={inviting} onClose={() => setInviting(false)} crewId={crew.id} crewName={crew.name} />

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

function InviteSheet({
  open,
  onClose,
  crewId,
  crewName,
}: {
  open: boolean;
  onClose: () => void;
  crewId: string;
  crewName: string;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [result, setResult] = useState<InviteActionResult>({});
  const [pending, start] = useTransition();
  const close = () => {
    setName('');
    setContact('');
    setResult({});
    onClose();
  };
  const first = name.trim().split(/\s+/)[0] || 'them';
  const demo =
    result.channel === 'sms' ? result.smsDemo : result.channel === 'email' ? result.emailDemo : false;

  return (
    <Sheet open={open} onClose={close} title={result.ok ? `${first} is invited` : `Invite to ${crewName}`}>
      {!result.ok ? (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => setResult(await inviteToCrewAction(crewId, name, contact)));
          }}
          noValidate
        >
          <p className="muted">We’ll send them a link to join. They’ll show as invited until they do.</p>
          <FormError message={result.fields ? undefined : result.error} />
          <Input
            label="Their name"
            placeholder="Alex"
            autoComplete="off"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={result.fields?.name}
          />
          <Input
            label="Mobile number or email"
            placeholder="(410) 555-0199 or alex@example.com"
            autoComplete="off"
            inputMode="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            error={result.fields?.contact}
          />
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Sending…' : 'Send the invite'}
          </Button>
        </form>
      ) : (
        <>
          <p role="status">
            {result.channel === 'skipped'
              ? `That number replied STOP to our texts, so we didn’t text ${first}. Send them the link yourself.`
              : demo
                ? `Demo mode: ${result.channel === 'sms' ? 'texts' : 'emails'} aren’t hooked up yet, so nothing was sent. Copy ${first}’s link and send it yourself.`
                : `We ${result.channel === 'sms' ? 'texted' : 'emailed'} ${first} a link to join.`}
          </p>
          {result.url && (
            <div className={styles.linkRow}>
              <output className={styles.link} aria-label={`${first}'s invite link`}>
                {result.url.replace(/^https?:\/\//, '')}
              </output>
              <CopyButton text={result.url} />
            </div>
          )}
          <Button
            variant="primary"
            onClick={() => {
              setName('');
              setContact('');
              setResult({});
            }}
          >
            Invite someone else
          </Button>
          <Button variant="ghost" onClick={close}>
            Done
          </Button>
        </>
      )}
    </Sheet>
  );
}
