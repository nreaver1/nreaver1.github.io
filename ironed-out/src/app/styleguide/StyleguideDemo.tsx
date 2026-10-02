'use client';

import { useState } from 'react';
import { Button, Card, Input, Pill, PillGroup, Sheet, Stepper } from '@/components/ui';

const INTERVALS = [8, 9, 10, 12].map((v) => ({ value: v, label: String(v) }));

export function StyleguideDemo() {
  const [minutes, setMinutes] = useState(10);
  const [teeTimes, setTeeTimes] = useState(3);
  const [text, setText] = useState(true);
  const [email, setEmail] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main className="page">
      <h1 style={{ fontSize: 46 }}>Styleguide</h1>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 30 }}>Buttons</h2>
        <Button variant="primary">Create &amp; get the link</Button>
        <Button>I already have one</Button>
        <Button variant="danger">Drop out</Button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button size="sm" variant="primary" style={{ flexGrow: 1 }}>
            Open invite
          </Button>
          <Button size="sm" style={{ flexGrow: 1 }}>
            Share link
          </Button>
        </div>
        <Button variant="ghost">Forgot password?</Button>
        <Button disabled>Disabled</Button>
      </section>

      <Card raised>
        <span className="muted">Next up</span>
        <h2 style={{ fontSize: 32, color: 'var(--fairway-dark)' }}>Mount Pleasant</h2>
        <span>Sat, Oct 3 · 7:40, 7:50, 8:00 AM</span>
      </Card>
      <Card tone="success">You&apos;re in. No changes since you joined.</Card>
      <Card tone="highlight">Dave dropped out. A spot opened at 7:50 AM.</Card>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 30 }}>Inputs</h2>
        <Input label="Your name" placeholder="Chris" autoComplete="name" />
        <Input label="Mobile number" type="tel" placeholder="(410) 555-0199" hint="We'll text you a code." />
        <Input
          label="Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          error="That code didn't match."
        />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 30 }}>Pills &amp; steppers</h2>
        <Stepper
          label="Tee times"
          value={teeTimes}
          min={1}
          max={6}
          onChange={setTeeTimes}
          decrementLabel="One fewer tee time"
          incrementLabel="One more tee time"
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>Minutes apart</span>
          <PillGroup label="Minutes apart" options={INTERVALS} value={minutes} onChange={setMinutes} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>Someone grabs a spot</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill selected={text} onSelectedChange={setText}>
              Text
            </Pill>
            <Pill selected={email} onSelectedChange={setEmail}>
              Email
            </Pill>
          </div>
        </div>
      </section>

      <Button variant="primary" onClick={() => setSheetOpen(true)}>
        Open the claim sheet
      </Button>
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Grab 7:50 AM">
        <p className="muted">No account needed. We&apos;ll text a code to confirm it&apos;s you.</p>
        <Input label="Your name" placeholder="Chris" />
        <Button variant="primary" onClick={() => setSheetOpen(false)}>
          Text me a code
        </Button>
      </Sheet>
    </main>
  );
}
