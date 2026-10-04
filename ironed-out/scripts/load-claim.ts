/**
 * Load test for the claim endpoint (SPEC §10 M9). Creates one outing through the partner API, then
 * fires many concurrent claims at a few spots so most of them collide, and checks the invariants
 * afterwards: every spot holds at most one golfer, every 201 is on the sheet, and no golfer holds
 * two spots. Prints latency percentiles and a status histogram; exits 1 if an invariant breaks.
 *
 *   pnpm load:claim --url http://localhost:3100 --client-id … --client-secret … \
 *     [--claims 200] [--concurrency 40] [--hot 6]
 *
 * Runs against any deployment you have an API client for. Don't point it at production without
 * a throwaway partner tenant.
 */

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? process.argv[i + 1] : fallback;
  if (v === undefined) throw new Error(`--${name} is required`);
  return v;
}

const base = arg('url', 'http://localhost:3000').replace(/\/$/, '');
const clientId = arg('client-id', process.env.LOAD_CLIENT_ID);
const clientSecret = arg('client-secret', process.env.LOAD_CLIENT_SECRET);
const total = Number(arg('claims', '200'));
const concurrency = Number(arg('concurrency', '40'));
const hot = Number(arg('hot', '6')); // claims aim at this many spots, so they fight over them

type Slot = { id: string; status: string; player?: { id: string; name: string } | null };
type Outing = { id: string; open_count: number; tee_times: { slots: Slot[] }[] };

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

async function main() {
  const tokenRes = await fetch(`${base}/api/v1/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token: token } = await json<{ access_token: string }>(tokenRes);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const courses = await json<{ data: { id: string }[] }>(
    await fetch(`${base}/api/v1/courses?scope=all&limit=1`, { headers: auth }),
  );
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14 + ((6 - d.getUTCDay() + 7) % 7));
  const outing = await json<Outing>(
    await fetch(`${base}/api/v1/outings`, {
      method: 'POST',
      headers: { ...auth, 'Idempotency-Key': `load-${Date.now()}` },
      body: JSON.stringify({
        course_id: courses.data[0]!.id,
        play_date: d.toISOString().slice(0, 10),
        tee_times: { first: '07:00', count: 6, players_each: 5, interval_minutes: 10 },
        external_ref: `LOAD-${Date.now()}`,
        organizer: { name: 'Load Organizer' },
      }),
    }),
  );
  const open = outing.tee_times.flatMap((t) => t.slots).filter((s) => s.status === 'open');
  const targets = open.slice(0, Math.min(hot, open.length));
  console.log(
    `Outing ${outing.id}: ${open.length} open spots; ${total} claims at ${targets.length} of them, ${concurrency} at a time.`,
  );

  const statuses = new Map<string, number>();
  const latencies: number[] = [];
  const winners: { slotId: string; name: string }[] = [];
  let next = 0;
  const started = Date.now();
  async function worker() {
    while (next < total) {
      const n = next++;
      const slot = targets[n % targets.length]!;
      const name = `Golfer ${n}`;
      const t0 = performance.now();
      const res = await fetch(`${base}/api/v1/slots/${slot.id}/claim`, {
        method: 'POST',
        headers: { ...auth, 'Idempotency-Key': `load-claim-${outing.id}-${n}` },
        body: JSON.stringify({ player: { name } }),
      });
      latencies.push(performance.now() - t0);
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      const key = `${res.status}${body.code ? ` ${body.code}` : ''}`;
      statuses.set(key, (statuses.get(key) ?? 0) + 1);
      if (res.status === 201) winners.push({ slotId: slot.id, name });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (Date.now() - started) / 1000;

  const final = await json<Outing>(await fetch(`${base}/api/v1/outings/${outing.id}`, { headers: auth }));
  const slots = final.tee_times.flatMap((t) => t.slots);
  const problems: string[] = [];
  const winnersBySlot = new Map<string, string[]>();
  for (const w of winners) winnersBySlot.set(w.slotId, [...(winnersBySlot.get(w.slotId) ?? []), w.name]);
  for (const [slotId, names] of winnersBySlot) {
    if (names.length > 1) problems.push(`spot ${slotId} was given to ${names.join(', ')}`);
    const s = slots.find((x) => x.id === slotId);
    if (s?.player?.name !== names[0])
      problems.push(`spot ${slotId} shows ${s?.player?.name ?? 'nobody'}, not ${names[0]}`);
  }
  for (const t of targets) {
    if (!winnersBySlot.has(t.id)) problems.push(`spot ${t.id} was never claimed`);
  }
  const names = slots.map((s) => s.player?.name).filter(Boolean);
  if (new Set(names).size !== names.length) problems.push('a golfer holds two spots');

  latencies.sort((a, b) => a - b);
  console.log(`\n${total} claims in ${elapsed.toFixed(1)} s (${(total / elapsed).toFixed(1)}/s)`);
  console.log(
    `latency ms  p50 ${pct(latencies, 50).toFixed(0)}  p95 ${pct(latencies, 95).toFixed(0)}  p99 ${pct(latencies, 99).toFixed(0)}  max ${latencies.at(-1)?.toFixed(0)}`,
  );
  console.log('responses  ', Object.fromEntries([...statuses].sort()));
  console.log(`winners     ${winners.length} (expected ${targets.length})`);
  if (problems.length) {
    console.error(`\nINVARIANTS BROKEN:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('invariants  ok: one golfer per spot, every 201 on the sheet, no double-booking');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
