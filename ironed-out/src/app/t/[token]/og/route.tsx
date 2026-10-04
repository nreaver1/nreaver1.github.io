import { ImageResponse } from 'next/og';
import { formatPlayDate, formatTime } from '@/lib/format';
import { resolveInviteAnyTenant } from '@/server/domain/invites';
import { getOutingView } from '@/server/domain/outings';
import { getServices } from '@/web/services';

const W = 1200;
const H = 630;

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };
const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

/** Fetches a Google font subset as TTF (what the image renderer needs). Null if offline. */
function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}:${text}`;
  if (!fontCache.has(key)) {
    fontCache.set(
      key,
      (async () => {
        try {
          const css = await fetch(
            `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`,
            { signal: AbortSignal.timeout(4000) },
          ).then((r) => r.text());
          const url = /src: url\((.+?)\) format\('(opentype|truetype)'\)/.exec(css)?.[1];
          if (!url) return null;
          return await fetch(url, { signal: AbortSignal.timeout(4000) }).then((r) => r.arrayBuffer());
        } catch {
          return null;
        }
      })(),
    );
  }
  return fontCache.get(key)!;
}

const shortCourse = (name: string) =>
  name.replace(/\s+(Golf Course|Golf Club|Golf Links|Country Club)$/i, '').replace(/^The\s+/, '');

const joinTimes = (times: string[]) => {
  const suffix =
    new Set(times.map((t) => t.slice(-2))).size === 1 && times.length > 1 ? times[0]!.slice(-3) : '';
  const parts = suffix ? times.map((t) => t.slice(0, -3)) : times;
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} & ${parts.at(-1)}${suffix}`
    : `${parts[0] ?? ''}${suffix}`;
};

/** GET /t/:token/og?v=<version> → the 1200×630 link preview (SPEC §3.10). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const services = await getServices();
  const found = await resolveInviteAnyTenant({ ...services, preferTenantId: services.tenantId }, token);
  const view = found
    ? await getOutingView({ ...services, tenantId: found.tenantId }, found.outingId, null)
    : null;

  const weekday = view
    ? new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
        new Date(`${view.playDate}T12:00:00Z`),
      )
    : '';
  const title = view ? `${weekday} at ${shortCourse(view.course.name)}` : 'Grab a tee time';
  const when = view
    ? `${formatPlayDate(view.playDate)} · ${joinTimes(view.teeTimes.map((t) => formatTime(t.startsAt, view.timezone)))}`
    : 'Ironed Out';
  const badge = view
    ? view.openCount === 0
      ? `All ${view.totalCount} spots are taken`
      : `${view.openCount} of ${view.totalCount} spots open. Tap to grab one`
    : 'This link has expired';

  const [caveat, patrick] = await Promise.all([
    googleFont('Caveat', 700, `Ironed Out${title}`),
    googleFont('Patrick Hand', 400, `${when}${badge}`),
  ]);
  const fonts: Font[] = [];
  if (caveat) fonts.push({ name: 'Caveat', data: caveat, weight: 700, style: 'normal' });
  if (patrick) fonts.push({ name: 'Patrick Hand', data: patrick, weight: 400, style: 'normal' });

  return new ImageResponse(
    <div
      style={{
        width: W,
        height: H,
        display: 'flex',
        position: 'relative',
        background: '#FBF6E9',
        border: '6px solid #2B2A26',
        fontFamily: 'Patrick Hand',
        color: '#2B2A26',
      }}
    >
      <svg width={W} height={H} viewBox="0 0 600 315" style={{ position: 'absolute', left: 0, top: 0 }}>
        <circle cx="540" cy="52" r="22" fill="#F2C14E" stroke="#2B2A26" strokeWidth="2.5" />
        <path
          d="M420 70 q7 -16 24 -9 q10 -14 26 -2 q16 0 12 14 z"
          fill="#FFFFFF"
          stroke="#2B2A26"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M0 240 Q160 200 320 228 T600 214 L600 315 L0 315Z"
          fill="#A8CC94"
          stroke="#2B2A26"
          strokeWidth="2.5"
        />
        <path
          d="M0 282 Q200 252 400 274 T600 268 L600 315 L0 315Z"
          fill="#6FA35F"
          stroke="#2B2A26"
          strokeWidth="2.5"
        />
        <ellipse cx="480" cy="232" rx="60" ry="13" fill="#4E8B4A" stroke="#2B2A26" strokeWidth="2.5" />
        <ellipse cx="486" cy="232" rx="8" ry="3" fill="#2B2A26" />
        <line x1="486" y1="232" x2="486" y2="122" stroke="#2B2A26" strokeWidth="3.5" strokeLinecap="round" />
        <path
          d="M486 122 L532 136 L486 150Z"
          fill="#C0392B"
          stroke="#2B2A26"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 72,
          top: 52,
          width: 820,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ fontFamily: 'Caveat', fontSize: 52, color: '#2F5E2C' }}>Ironed Out</div>
        <div style={{ fontFamily: 'Caveat', fontSize: 100, lineHeight: 0.95 }}>{title}</div>
        <div style={{ fontSize: 44, marginTop: 12 }}>{when}</div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            marginTop: 20,
            fontSize: 52,
            background: '#FFFFFF',
            color: '#A3301F',
            border: '5px solid #2B2A26',
            borderRadius: '28px 10px 26px 12px',
            padding: '4px 28px',
            boxShadow: '6px 6px 0 #2B2A26',
            transform: 'rotate(-1.5deg)',
          }}
        >
          {badge}
        </div>
      </div>
    </div>,
    {
      width: W,
      height: H,
      fonts: fonts.length ? fonts : undefined,
      headers: {
        // The ?v= version changes whenever the spot count does, so a version can be cached hard.
        'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
