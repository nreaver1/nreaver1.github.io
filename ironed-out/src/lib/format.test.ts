import { describe, expect, it } from 'vitest';
import { formatPhoneInput } from './format';

describe('formatPhoneInput', () => {
  it.each([
    ['', ''],
    ['41', '41'],
    ['4105', '(410) 5'],
    ['410555', '(410) 555'],
    ['4105550199', '(410) 555-0199'],
    ['41055501999999', '(410) 555-0199'],
    ['410-abc-555.01#99', '(410) 555-0199'],
    ['+1 (410) 555-0199', '(410) 555-0199'],
    ['14105550199', '(410) 555-0199'],
  ])('%j → %j', (raw, out) => {
    expect(formatPhoneInput(raw)).toBe(out);
  });

  it('lets backspace remove the digit before the dash or paren', () => {
    expect(formatPhoneInput('(410) 555-')).toBe('(410) 555');
    expect(formatPhoneInput('(410) ')).toBe('410');
  });
});
