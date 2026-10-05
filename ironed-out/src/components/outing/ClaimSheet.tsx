'use client';

import { useEffect, useState, useTransition } from 'react';
import type { ClaimActionState } from '@/app/t/[token]/actions';
import { FormError } from '@/components/forms/FormError';
import { WindFlag } from '@/components/illustrations/WindFlag';
import { Button, Card, Input, Sheet, Stepper } from '@/components/ui';
import styles from './claim.module.css';

export type ClaimTarget = { slotId: string; time: string };

export type ClaimActions = {
  startClaim?: (input: {
    slotId: string;
    name: string;
    phone: string;
    guests: number;
  }) => Promise<ClaimActionState>;
  confirmClaim?: (input: {
    slotId: string;
    name: string;
    phone: string;
    guests: number;
    code: string;
  }) => Promise<ClaimActionState>;
  claimDirect: (input: { slotId: string; guests: number }) => Promise<ClaimActionState>;
  forgetDevice?: () => Promise<void>;
};

type Step = 'details' | 'code' | 'done';

export function ClaimSheet({
  target,
  onClose,
  openSpots,
  knownName,
  actions,
  smsDemo,
  onTaken,
  onClaimed,
  calendar,
}: {
  target: ClaimTarget | null;
  onClose: () => void;
  /** Open spots in the whole outing right now (guests max = open − 1). */
  openSpots: number;
  /** Set when we already know the viewer (account or verified device): no code needed. */
  knownName: string | null;
  actions: ClaimActions;
  smsDemo: boolean;
  /** The spot went to someone else; the parent offers the next open one. */
  onTaken: () => void;
  /** Called once a claim succeeds. */
  onClaimed?: () => void;
  calendar: { ics: string; google: string } | null;
}) {
  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(0);
  const [code, setCode] = useState('');
  const [state, setState] = useState<ClaimActionState>({});
  const [result, setResult] = useState<{ time: string; guests: number } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, start] = useTransition();

  // Reset when a new spot is picked (adjusting state during render, per the React docs).
  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    if (target) {
      setStep('details');
      setCode('');
      if (state.reason === 'slot_taken' || state.reason === 'slot_gone') {
        // We moved them to the next open spot; say why, and keep what they typed.
        setState({
          error: `${state.error ?? 'That spot was taken.'} Here’s the next open one: ${target.time}.`,
        });
      } else {
        setGuests(0);
        setState({});
      }
    }
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const guestMax = Math.max(0, Math.min(4, openSpots - 1));
  const time = target?.time ?? '';

  const handle = (r: ClaimActionState, next?: () => void) => {
    setState(r);
    if (r.reason === 'slot_taken' || r.reason === 'slot_gone') onTaken();
    if (r.ok) next?.();
    if (r.ok && r.startsAt) onClaimed?.();
  };

  const sendCode = () =>
    start(async () => {
      if (!target || !actions.startClaim) return;
      const r = await actions.startClaim({ slotId: target.slotId, name, phone, guests });
      handle(r, () => {
        setStep('code');
        setCooldown(30);
      });
    });

  const confirm = () =>
    start(async () => {
      if (!target || !actions.confirmClaim) return;
      const r = await actions.confirmClaim({ slotId: target.slotId, name, phone, guests, code });
      handle(r, () => {
        setResult({ time, guests: r.guestCount ?? guests });
        setStep('done');
      });
    });

  const grabDirect = () =>
    start(async () => {
      if (!target) return;
      const r = await actions.claimDirect({ slotId: target.slotId, guests });
      handle(r, () => {
        setResult({ time, guests: r.guestCount ?? guests });
        setStep('done');
      });
    });

  const close = () => {
    setStep('details');
    setResult(null);
    onClose();
  };

  const title = step === 'done' ? 'You’re in!' : step === 'code' ? 'Check your texts' : `Grab ${time}`;
  const guestStepper = (
    <Stepper
      label="Bringing a buddy?"
      hint={guestMax === 0 ? 'No room for guests right now' : `Up to ${guestMax} more`}
      value={guests}
      min={0}
      max={guestMax}
      onChange={setGuests}
      format={(v) => `+${v}`}
      decrementLabel="One fewer guest"
      incrementLabel="One more guest"
    />
  );

  return (
    <Sheet open={!!target || step === 'done'} onClose={close} title={title}>
      {step === 'details' && knownName && (
        <>
          <p className={styles.lede}>
            Grabbing it as <strong>{knownName}</strong>.
          </p>
          <FormError message={state.error} />
          {guestStepper}
          <Button variant="primary" onClick={grabDirect} disabled={pending}>
            {pending ? 'Grabbing…' : `Grab ${time}`}
          </Button>
          {actions.forgetDevice && (
            <Button variant="ghost" onClick={() => start(() => actions.forgetDevice!())}>
              Not {knownName}? Use a different number
            </Button>
          )}
        </>
      )}

      {step === 'details' && !knownName && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
          noValidate
        >
          <p className={styles.lede}>No account needed. We’ll text a code to confirm it’s you.</p>
          <FormError message={state.fields ? undefined : state.error} />
          <Input
            label="Your name"
            name="name"
            placeholder="Chris"
            autoComplete="name"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={state.fields?.name}
          />
          <Input
            label="Mobile number"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="(410) 555-0199"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={state.fields?.phone}
          />
          {guestStepper}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Sending…' : 'Text me a code'}
          </Button>
          <p className={styles.fine}>
            By continuing you agree to get texts about this outing. Reply STOP anytime.
          </p>
        </form>
      )}

      {step === 'code' && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          noValidate
        >
          <p className={styles.lede}>
            We sent a 6-digit code to {state.phoneMasked ?? 'your phone'}. It expires in 10 minutes.
          </p>
          {smsDemo && state.demoCode && (
            <Card tone="highlight" role="note" className={styles.demo}>
              <span>
                <strong>Demo mode:</strong> texts aren’t hooked up yet, so here’s your code:
              </span>
              <span className={`display ${styles.demoCode}`}>{state.demoCode}</span>
            </Card>
          )}
          <FormError message={state.fields ? undefined : state.error} />
          <Input
            label="Code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            className={styles.codeInput}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={state.fields?.code}
          />
          <Button type="submit" variant="primary" disabled={pending || code.length !== 6}>
            {pending ? 'Checking…' : 'Lock in my spot'}
          </Button>
          <Button variant="ghost" disabled={pending || cooldown > 0} onClick={sendCode}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Button>
          <Button variant="ghost" onClick={() => setStep('details')}>
            Change number
          </Button>
        </form>
      )}

      {step === 'done' && result && (
        <div className={styles.done}>
          <svg viewBox="0 0 220 120" width="220" height="120" className={styles.cup} aria-hidden="true">
            <path d="M0 96 Q110 70 220 96 L220 120 L0 120Z" fill="#6FA35F" stroke="#2B2A26" strokeWidth="2" />
            <ellipse cx="128" cy="92" rx="16" ry="5" fill="#2B2A26" />
            <line x1="134" y1="92" x2="134" y2="22" stroke="#2B2A26" strokeWidth="3" strokeLinecap="round" />
            <WindFlag x={134} top={22} length={34} height={20} />
            <g className={styles.ballDrop}>
              <circle cx="122" cy="84" r="7" fill="#FFFFFF" stroke="#2B2A26" strokeWidth="2" />
            </g>
          </svg>
          <p className={styles.doneText} role="status">
            You’re in for {result.time}
            {result.guests ? `, plus ${result.guests} ${result.guests === 1 ? 'guest' : 'guests'}` : ''}.
            We’ll text you if anything changes.
          </p>
          {calendar && (
            <div className={styles.calendar}>
              <a className={styles.calLink} href={calendar.ics}>
                Add to Apple / Outlook calendar
              </a>
              <a className={styles.calLink} href={calendar.google} target="_blank" rel="noreferrer">
                Add to Google Calendar
              </a>
            </div>
          )}
          <Button variant="primary" onClick={close}>
            Sweet
          </Button>
        </div>
      )}
    </Sheet>
  );
}
