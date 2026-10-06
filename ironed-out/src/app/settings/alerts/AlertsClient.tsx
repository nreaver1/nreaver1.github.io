'use client';

import { useState, useTransition } from 'react';
import { CheckIcon } from '@/components/icons';
import { FormError } from '@/components/forms/FormError';
import { Button, Card, Input, Pill, Sheet, Switch } from '@/components/ui';
import type { AlertSettings, AlertType } from '@/server/domain/notifications';
import {
  confirmPhoneAction,
  resumeTextsAction,
  setAlertPrefAction,
  setQuietHoursAction,
  startPhoneAction,
  type AlertsActionState,
} from './actions';
import styles from './alerts.module.css';

const ROWS: { type: AlertType; label: string }[] = [
  { type: 'join', label: 'Someone grabs a spot' },
  { type: 'drop', label: 'Someone drops out' },
  { type: 'change', label: 'Tee times change' },
  { type: 'remind_day', label: 'Day-before reminder' },
  { type: 'remind_2h', label: '2 hours before' },
  { type: 'canceled', label: 'Outing is canceled' },
];

export type RecentMessage = {
  id: string;
  channel: 'sms' | 'email';
  kind: string;
  status: string;
  body: string | null;
  when: string;
};

export function AlertsClient({
  initial,
  phoneDisplay,
  smsDemo,
  recent,
}: {
  initial: AlertSettings;
  phoneDisplay: string | null;
  smsDemo: boolean;
  recent: RecentMessage[];
}) {
  const [prefs, setPrefs] = useState(initial.prefs);
  const [quiet, setQuiet] = useState(initial.quietHours);
  const [error, setError] = useState<string | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [, start] = useTransition();

  const flip = (type: AlertType, channel: 'sms' | 'email') => {
    const on = !prefs[type][channel];
    setPrefs((p) => ({ ...p, [type]: { ...p[type], [channel]: on } }));
    start(async () => {
      const r = await setAlertPrefAction(type, channel, on);
      if (r.error) {
        setError(r.error);
        setPrefs((p) => ({ ...p, [type]: { ...p[type], [channel]: !on } }));
      }
    });
  };

  return (
    <>
      <Card className={styles.phone}>
        <div>
          <div className="muted" style={{ fontSize: 16 }}>
            Texts go to
          </div>
          <div style={{ fontSize: 20 }}>{phoneDisplay ?? 'No number yet'}</div>
        </div>
        {phoneDisplay ? (
          <div className={styles.verified}>
            <CheckIcon size={18} /> Verified
          </div>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setPhoneOpen(true)}>
            Add number
          </Button>
        )}
      </Card>
      {phoneDisplay && (
        <Button variant="ghost" onClick={() => setPhoneOpen(true)} style={{ alignSelf: 'flex-start' }}>
          Use a different number
        </Button>
      )}

      {initial.smsOptedOut && (
        <Card tone="highlight" role="status">
          <span>You replied STOP, so we’re not texting you. Emails still go out.</span>
          <Button size="sm" onClick={() => start(async () => void (await resumeTextsAction()))}>
            Turn texts back on
          </Button>
        </Card>
      )}

      <Card className={styles.rows} as="section" aria-label="Alert settings">
        {ROWS.map((row) => (
          <div key={row.type} className={styles.row} role="group" aria-label={row.label}>
            <div className={styles.label}>{row.label}</div>
            <div className={styles.pills}>
              <Pill
                className={styles.pill}
                selected={prefs[row.type].sms}
                onSelectedChange={() => flip(row.type, 'sms')}
              >
                Text
              </Pill>
              <Pill
                className={styles.pill}
                selected={prefs[row.type].email}
                onSelectedChange={() => flip(row.type, 'email')}
              >
                Email
              </Pill>
            </div>
          </div>
        ))}
        <div className={styles.row}>
          <div className={styles.label}>
            Quiet hours
            <span className={styles.sub}>No texts 10 PM to 7 AM</span>
          </div>
          <Switch
            label="Quiet hours"
            checked={quiet}
            onCheckedChange={(on) => {
              setQuiet(on);
              start(async () => void (await setQuietHoursAction(on)));
            }}
          />
        </div>
      </Card>
      <p className={styles.toast} role="status" aria-live="polite">
        {error}
      </p>
      <p className="muted" style={{ fontSize: 16 }}>
        Reply STOP to any text to opt out. Standard message rates may apply.
      </p>

      {recent.length > 0 && (
        <section aria-labelledby="recent" className={styles.recent}>
          <h2 id="recent" className={styles.recentTitle}>
            {smsDemo ? 'Texts we would have sent' : 'Recent alerts'}
          </h2>
          {smsDemo && (
            <p className="muted" style={{ fontSize: 16 }}>
              Demo mode: texts aren’t hooked up yet, so here’s what would have landed on your phone.
            </p>
          )}
          <ul className={styles.messages}>
            {recent.map((m) => (
              <li key={m.id} className={m.channel === 'sms' ? styles.bubble : styles.email}>
                <span className={styles.meta}>
                  {m.channel === 'sms' ? 'Text' : 'Email'} ·{' '}
                  {m.status === 'sent' ? m.when : `${m.status}, ${m.when}`}
                </span>
                {m.body ??
                  (m.status !== 'pending'
                    ? 'Not sent'
                    : m.kind.startsWith('remind')
                      ? 'Reminder scheduled'
                      : 'Waiting to send…')}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PhoneSheet open={phoneOpen} onClose={() => setPhoneOpen(false)} smsDemo={smsDemo} />
    </>
  );
}

function PhoneSheet({ open, onClose, smsDemo }: { open: boolean; onClose: () => void; smsDemo: boolean }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<AlertsActionState & { step?: 'phone' | 'code' }>({ step: 'phone' });
  const [pending, start] = useTransition();
  const close = () => {
    setState({ step: 'phone' });
    setCode('');
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={state.step === 'code' ? 'Check your texts' : 'Your mobile number'}
    >
      {state.step !== 'code' ? (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await startPhoneAction(phone);
              setState({ ...r, step: r.ok ? 'code' : 'phone' });
            });
          }}
          noValidate
        >
          <FormError message={state.fields ? undefined : state.error} />
          <Input
            label="Mobile number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(410) 555-0199"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={state.fields?.phone}
          />
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Sending…' : 'Text me a code'}
          </Button>
          <p className="muted" style={{ fontSize: 14 }}>
            By continuing you agree to get texts about your outings. Reply STOP anytime.
          </p>
        </form>
      ) : (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await confirmPhoneAction(phone, code);
              if (r.ok) close();
              else setState((s) => ({ ...s, error: r.error, fields: r.fields }));
            });
          }}
          noValidate
        >
          <p className="muted">We sent a 6-digit code to {state.phoneMasked}.</p>
          {smsDemo && state.demoCode && (
            <Card tone="highlight" role="note">
              <span>
                <strong>Demo mode:</strong> here’s your code:
              </span>
              <span className="display" style={{ fontSize: 40, letterSpacing: 6, color: 'var(--red-text)' }}>
                {state.demoCode}
              </span>
            </Card>
          )}
          <Input
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={state.fields?.code ?? state.error}
          />
          <Button type="submit" variant="primary" disabled={pending || code.length !== 6}>
            {pending ? 'Checking…' : 'Verify'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
