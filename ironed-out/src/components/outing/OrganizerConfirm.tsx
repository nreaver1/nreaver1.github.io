'use client';

import { useState, useTransition } from 'react';
import type { ClaimActionState } from '@/app/t/[token]/actions';
import { FormError } from '@/components/forms/FormError';
import { Button, Card, Input, Sheet } from '@/components/ui';
import styles from './claim.module.css';

/**
 * For the booker of a partner outing on a device we don't know yet: confirm the mobile number the
 * booking was made with and this browser gets the organizer controls.
 */
export function OrganizerConfirm({
  organizerName,
  smsDemo,
  start: startAction,
  confirm: confirmAction,
}: {
  organizerName: string;
  smsDemo: boolean;
  start: (input: { phone: string }) => Promise<ClaimActionState>;
  confirm: (input: { phone: string; code: string }) => Promise<ClaimActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<ClaimActionState>({});
  const [pending, start] = useTransition();

  const sendCode = () =>
    start(async () => {
      const r = await startAction({ phone });
      setState(r);
      if (r.ok) setStep('code');
    });

  const check = () =>
    start(async () => {
      const r = await confirmAction({ phone, code });
      setState(r);
      // On success the page re-renders with the organizer controls.
    });

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Are you {organizerName}? Manage this outing
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Manage this outing">
        {step === 'phone' && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
            noValidate
          >
            <p className={styles.lede}>
              Enter the mobile number you booked with. We’ll text a code, then this device can change the tee
              sheet.
            </p>
            <FormError message={state.fields ? undefined : state.error} />
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
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Sending…' : 'Text me a code'}
            </Button>
          </form>
        )}
        {step === 'code' && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              check();
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
              {pending ? 'Checking…' : 'Manage the outing'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep('phone');
                setState({});
              }}
            >
              Change number
            </Button>
          </form>
        )}
      </Sheet>
    </>
  );
}
