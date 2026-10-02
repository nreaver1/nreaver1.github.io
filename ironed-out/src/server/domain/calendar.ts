/** Calendar export for an outing (SPEC §3.8): an .ics file and a Google Calendar link. */

export type CalendarEvent = {
  uid: string;
  title: string;
  start: Date;
  durationMinutes: number;
  location: string;
  description: string;
  url: string;
};

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** RFC 5545 text escaping. */
const esc = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

/** Folds lines longer than 75 octets, as RFC 5545 requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export function toIcs(e: CalendarEvent, now = new Date()): string {
  const end = new Date(e.start.getTime() + e.durationMinutes * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ironed Out//Outings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    `LOCATION:${esc(e.location)}`,
    `DESCRIPTION:${esc(e.description)}`,
    `URL:${e.url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(e.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
    .map(fold)
    .join('\r\n');
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const end = new Date(e.start.getTime() + e.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(end)}`,
    location: e.location,
    details: `${e.description}\n${e.url}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
