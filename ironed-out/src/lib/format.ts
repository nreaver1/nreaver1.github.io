/** Display helpers shared by server and client. Everything is formatted in the outing's zone. */

export function formatTime(at: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(
    new Date(at),
  );
}

/** "7:40 · 7:50 · 8:00 AM" — shared AM/PM suffix when every time has the same one. */
export function formatTimeList(times: (Date | string)[], timeZone: string): string {
  const parts = times.map((t) => formatTime(t, timeZone));
  const suffixes = new Set(parts.map((p) => p.slice(-2)));
  if (suffixes.size === 1 && parts.length > 1) {
    return parts.map((p) => p.slice(0, -3)).join(' · ') + ' ' + [...suffixes][0];
  }
  return parts.join(' · ');
}

/** "Sat, Oct 10" for a YYYY-MM-DD calendar date (no time zone shifting). */
export function formatPlayDate(playDate: string): string {
  const [y, m, d] = playDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Minutes after midnight → "7:40 AM". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatPrice(cents: number | null): string | null {
  if (cents == null) return null;
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** "~12 min", "~1 hr 35m", "far". */
export function formatDrive(minutes: number | null): string {
  if (minutes == null || minutes > 600) return 'far';
  if (minutes < 60) return `~${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 5) * 5;
  return `~${h} hr${m ? ` ${m}m` : ''}`;
}

/** "Mike Golfer" → "Mike G." (what non-members see on an invite page). */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Today's date (YYYY-MM-DD) in a zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The next `count` Saturdays and Sundays on or after today, as YYYY-MM-DD. */
export function upcomingWeekendDates(today: string, count = 6): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 60; i++) {
    const date = new Date(Date.UTC(y!, m! - 1, d! + i));
    const dow = date.getUTCDay();
    if (dow === 6 || dow === 0) out.push(date.toISOString().slice(0, 10));
  }
  return out;
}
