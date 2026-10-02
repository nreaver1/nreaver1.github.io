/**
 * Phone numbers. US-first: 10 digits (or 11 starting with 1) become +1XXXXXXXXXX. Other
 * countries must be typed with a leading +.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    if (digits.startsWith('1')) return digits.length === 11 && isNanp(digits.slice(1)) ? `+${digits}` : null;
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10 && isNanp(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1') && isNanp(digits.slice(1))) return `+${digits}`;
  return null;
}

/** North American numbers: area code and exchange can't start with 0 or 1. */
function isNanp(ten: string): boolean {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten);
}

/** "+14105550199" → "•••-•••-0199". Safe for logs and UI. */
export function maskPhone(e164: string): string {
  return `•••-•••-${e164.slice(-4)}`;
}
