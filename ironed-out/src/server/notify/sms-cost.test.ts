import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { compose } from '../domain/notifications';
import type { OutingView } from '../domain/outings';
import { isGsm7, smsSegments, toGsm7 } from './gsm';
import { DemoSms } from './sms';
import { SmsCodeVerifier } from './verify';

describe('GSM-7 normalization', () => {
  it('replaces typographic characters and strips accents GSM-7 lacks', () => {
    expect(toGsm7('Mike’s outing · 7:40 – 8:00… “ok”')).toBe('Mike\'s outing - 7:40 - 8:00... "ok"');
    expect(toGsm7('José Núñez')).toBe('José Nuñez'); // é and ñ are GSM-7, ú isn't
    expect(toGsm7('Zoë Åberg')).toBe('Zoe Åberg');
    expect(isGsm7(toGsm7('Mike’s outing · 7:40'))).toBe(true);
  });

  it('keeps characters with no stand-in instead of mangling names', () => {
    expect(toGsm7('李 ⛳')).toBe('李 ⛳');
  });

  it('counts segments the way carriers bill them', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('a'.repeat(306))).toBe(2);
    expect(smsSegments('’'.repeat(70))).toBe(1);
    expect(smsSegments(`${'a'.repeat(100)}’`)).toBe(2); // one curly quote: UCS-2
  });
});

const tee = (startsAt: string, names: (string | null)[]) => ({
  id: startsAt,
  startsAt,
  capacity: names.length,
  filled: names.filter(Boolean).length,
  slots: names.map((name, position) => ({
    id: `${startsAt}-${position}`,
    position,
    open: !name,
    name,
    tag: null,
    isYou: name === 'Mike Brennan',
    isYourGuest: false,
    colorKey: position,
  })),
});

const view: OutingView = {
  id: 'o1',
  version: 3,
  course: {
    id: 'c1',
    name: 'Mount Pleasant Golf Course',
    address: '6001 Hillen Rd, Baltimore, MD',
    city: 'Baltimore',
    region: 'MD',
  },
  organizerName: 'Mike Brennan',
  playDate: '2026-10-17',
  timezone: 'America/New_York',
  priceCents: 4500,
  note: '',
  locked: false,
  isOrganizer: true,
  isMember: true,
  viewerTeeTimeId: null,
  teeTimes: [
    tee('2026-10-17T11:40:00.000Z', ['Mike Brennan', 'Dave Kowalski', 'Jen O’Neil', null]),
    tee('2026-10-17T11:50:00.000Z', [null, null, null, null]),
    tee('2026-10-17T12:00:00.000Z', [null, null, null, null]),
  ],
  openCount: 9,
  totalCount: 12,
  lastEventId: 9,
};

describe('message templates', () => {
  const link = 'https://ironed-out-alpha.vercel.app/t/BYvoBHs3L1dE4YLlJGpSEE';
  const ev = (type: Parameters<typeof compose>[2][number]['type'], payload: Record<string, unknown>) => ({
    type,
    payload,
    actorName: (payload.playerName as string | undefined) ?? 'Mike Brennan',
  });
  const cases = {
    new_outing: compose('new_outing', view, [], link),
    removed: compose('removed', view, [], link),
    remind_day: compose('remind_day', view, [], link),
    remind_2h: compose('remind_2h', view, [], link),
    claimed: compose(
      'change',
      view,
      [ev('slot_claimed', { playerName: 'Jen O’Neil', startsAt: '2026-10-17T11:40:00.000Z', guestCount: 1 })],
      link,
    ),
    dropped: compose(
      'change',
      view,
      [ev('slot_released', { playerName: 'Dave Kowalski', startsAt: '2026-10-17T11:40:00.000Z' })],
      link,
    ),
    several: compose(
      'change',
      view,
      [
        ev('tee_time_added', { startsAt: '2026-10-17T12:10:00.000Z' }),
        ev('slot_released', { playerName: 'Dave Kowalski', startsAt: '2026-10-17T11:40:00.000Z' }),
        ev('outing_updated', { fields: ['note'] }),
      ],
      link,
    ),
  };

  it.each(Object.entries(cases))('%s is GSM-7 once normalized and fits in 2 segments', (_, msg) => {
    expect(msg).not.toBeNull();
    const text = toGsm7(msg!.sms);
    expect(isGsm7(text), text).toBe(true);
    expect(smsSegments(text), text).toBeLessThanOrEqual(2);
  });
});

describe('texted claim codes', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.pg.close();
  });

  it('texts our own code (one segment, with the autofill line) and checks it', async () => {
    const sms = new DemoSms();
    const verifier = new SmsCodeVerifier(t.db, 'sms-test-secret-0123456789-0123456789', sms, 'ironed.test');
    const started = await verifier.start('+14105550177', 'claim');
    expect(started.demoCode).toBeUndefined(); // never shown on screen
    const [sent] = sms.sent;
    expect(sent?.to).toBe('+14105550177');
    const code = /code: (\d{6})/.exec(sent!.body)?.[1];
    expect(sent!.body.endsWith(`@ironed.test #${code}`)).toBe(true);
    expect(smsSegments(sent!.body)).toBe(1);
    expect(await verifier.check('+14105550177', '000000' === code ? '111111' : '000000', 'claim')).toBe(
      'wrong',
    );
    expect(await verifier.check('+14105550177', code!, 'claim')).toBe('ok');
  });
});
