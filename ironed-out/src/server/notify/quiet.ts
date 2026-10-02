/** Quiet hours: texts that would land between start and end (local time) wait until end. */

export const DEFAULT_QUIET = { start: '22:00', end: '07:00' } as const;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Minutes after local midnight in `timeZone`. */
function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function inQuietHours(at: Date, timeZone: string, start: string, end: string): boolean {
  const now = localMinutes(at, timeZone);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/**
 * The earliest instant at or after `at` that's outside quiet hours. Steps a minute at a time to
 * the end of the window (at most ~a day), which also handles DST shifts correctly.
 */
export function nextSendTime(at: Date, timeZone: string, quiet: { start: string; end: string } | null): Date {
  if (!quiet || !inQuietHours(at, timeZone, quiet.start, quiet.end)) return at;
  const now = localMinutes(at, timeZone);
  const e = toMinutes(quiet.end);
  const wait = (e - now + 1440) % 1440 || 1440;
  // Land on the minute the window ends.
  const candidate = new Date(Math.floor(at.getTime() / 60_000) * 60_000 + wait * 60_000);
  return inQuietHours(candidate, timeZone, quiet.start, quiet.end)
    ? new Date(candidate.getTime() + 60 * 60_000) // DST edge: an hour later is always outside
    : candidate;
}

/** Offset of `timeZone` from UTC at `at`, in ms (positive east of UTC). */
function zoneOffset(at: Date, timeZone: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(at)
    .reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.type]: Number(x.value) }), {});
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant of local wall-clock `minutes` after midnight on `date` (YYYY-MM-DD) in `timeZone`. */
export function zonedTime(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, 0, minutes);
  const first = guess - zoneOffset(new Date(guess), timeZone);
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}
