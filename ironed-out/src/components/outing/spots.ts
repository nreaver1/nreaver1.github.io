import { formatTime } from '@/lib/format';
import type { OutingView } from '@/server/domain/outings';

export function teeSummary(view: Pick<OutingView, 'teeTimes' | 'timezone'>): string {
  const first = view.teeTimes[0];
  if (!first) return 'No tee times yet';
  const t = formatTime(first.startsAt, view.timezone);
  return view.teeTimes.length === 1 ? t : `${view.teeTimes.length} tee times from ${t}`;
}

export function spotsText(view: Pick<OutingView, 'openCount' | 'totalCount'>): string {
  return view.openCount === 0
    ? `Full! ${view.totalCount} of ${view.totalCount}`
    : `${view.openCount} of ${view.totalCount} spots open`;
}
