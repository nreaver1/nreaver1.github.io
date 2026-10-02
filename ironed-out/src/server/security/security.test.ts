import { describe, expect, it } from 'vitest';
import { maskPhone, normalizePhone } from '../phone';
import { signDevice, verifyDevice } from './device';
import { derivedToken, randomToken } from './tokens';

describe('tokens', () => {
  it('random tokens are base62 and unique', () => {
    const a = randomToken();
    expect(a).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(new Set(Array.from({ length: 200 }, () => randomToken())).size).toBe(200);
  });

  it('derived tokens are stable per secret and input', () => {
    expect(derivedToken('s1', 'x')).toBe(derivedToken('s1', 'x'));
    expect(derivedToken('s1', 'x')).not.toBe(derivedToken('s2', 'x'));
    expect(derivedToken('s1', 'x')).not.toBe(derivedToken('s1', 'y'));
  });
});

describe('phones', () => {
  it.each([
    ['(410) 555-0199', '+14105550199'],
    ['410.555.0199', '+14105550199'],
    ['1 410 555 0199', '+14105550199'],
    ['+1 410 555 0199', '+14105550199'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('%s → %s', (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each(['555-0199', '011 410 555 0199', '(110) 555-0199', 'call me', ''])('rejects %s', (input) =>
    expect(normalizePhone(input)).toBeNull(),
  );

  it('masks all but the last four digits', () => expect(maskPhone('+14105550199')).toBe('•••-•••-0199'));
});

describe('device cookie', () => {
  const secret = 'device-secret-0123456789-0123456789';
  const player = '01928f1e-7a3b-7c1d-8e2f-123456789abc';

  it('round-trips and expires after 90 days', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const { value } = signDevice(secret, player, now);
    expect(verifyDevice(secret, value, now)).toBe(player);
    expect(verifyDevice(secret, value, new Date('2026-12-29T00:00:00Z'))).toBe(player);
    expect(verifyDevice(secret, value, new Date('2027-01-01T00:00:00Z'))).toBeNull();
  });

  it('rejects tampering and other secrets', () => {
    const { value } = signDevice(secret, player);
    const other = '01928f1e-7a3b-7c1d-8e2f-000000000000';
    expect(verifyDevice(secret, value.replace(player, other))).toBeNull();
    expect(verifyDevice('another-secret-0123456789-0123456789', value)).toBeNull();
    expect(verifyDevice(secret, 'garbage')).toBeNull();
  });
});
