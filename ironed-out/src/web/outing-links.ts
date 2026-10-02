import 'server-only';
import { googleCalendarUrl, type CalendarEvent } from '@/server/domain/calendar';
import type { OutingView } from '@/server/domain/outings';

/** Calendar event for the viewer's tee time (or the first one). */
export function calendarEventFor(view: OutingView, url: string): CalendarEvent | null {
  const tee = view.teeTimes.find((t) => t.id === view.viewerTeeTimeId) ?? view.teeTimes[0];
  if (!tee) return null;
  const place = [view.course.address, view.course.city, view.course.region].filter(Boolean).join(', ');
  return {
    uid: `${view.id}-${tee.id}@ironedout`,
    title: `Golf at ${view.course.name}`,
    start: new Date(tee.startsAt),
    durationMinutes: 270,
    location: `${view.course.name}, ${place}`,
    description: [
      `Organized by ${view.organizerName} with Ironed Out.`,
      view.note ? `Note: ${view.note}` : '',
      view.priceCents != null ? `$${(view.priceCents / 100).toFixed(0)} per player, paid at the course.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    url,
  };
}

export function calendarLinks(view: OutingView, pageUrl: string, icsPath: string) {
  const event = calendarEventFor(view, pageUrl);
  return event ? { ics: icsPath, google: googleCalendarUrl(event) } : null;
}
