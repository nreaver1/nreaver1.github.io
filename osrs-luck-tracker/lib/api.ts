import type { LeaderboardResponse, LuckResult, PlayerLuckResponse, PoolResult } from "./types";
import itemNames from "./item-names.json";
import { mockLeaderboard, mockPlayerLuck } from "./mock-data";

// Point this at your deployed Supabase edge function, e.g.
// https://<project>.supabase.co/functions/v1/get-player-luck
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

// Every call through Supabase's API gateway needs a valid apikey header,
// regardless of the verify_jwt setting on the function itself — this is
// how the gateway identifies which project you're calling. get-player-luck
// is a public read, so this is the low-privilege publishable key
// (publishable_...), safe to ship in client-side bundles. Never put a
// secret key (sb_secret_...) here.
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function resolveItemName(itemId: number): string {
  return (itemNames as Record<string, string>)[String(itemId)] ?? `Item #${itemId}`;
}

const named = (r: LuckResult): LuckResult => ({ ...r, item_name: resolveItemName(r.item_id) });

const namedPool = (p: PoolResult): PoolResult => ({
  ...p,
  item_names: Object.fromEntries(p.item_ids.map((id) => [String(id), resolveItemName(id)])),
});

export async function getPlayerLuck(
  ign: string,
): Promise<PlayerLuckResponse | null> {
  if (!API_BASE) {
    const mock = mockPlayerLuck(ign);
    return mock
      ? {
          ...mock,
          results: mock.results.map((r) => ({
            ...r,
            item_name: resolveItemName(r.item_id),
          })),
          mostSpooned: mock.mostSpooned
            ? { ...mock.mostSpooned, item_name: resolveItemName(mock.mostSpooned.item_id) }
            : null,
          driest: mock.driest
            ? { ...mock.driest, item_name: resolveItemName(mock.driest.item_id) }
            : null,
          hunting: (mock.hunting ?? []).map((h) => ({ ...h, item_name: resolveItemName(h.item_id) })),
          pools: (mock.pools ?? []).map(namedPool),
        }
      : null;
  }

  const res = await fetch(
    `${API_BASE}/get-player-luck?ign=${encodeURIComponent(ign)}`,
    {
      cache: "no-store",
      headers: { apikey: PUBLISHABLE_KEY },
    },
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);

  const data: PlayerLuckResponse = await res.json();
  return {
    ...data,
    results: data.results.map((r) => ({ ...r, item_name: resolveItemName(r.item_id) })),
    mostSpooned: data.mostSpooned
      ? { ...data.mostSpooned, item_name: resolveItemName(data.mostSpooned.item_id) }
      : null,
    driest: data.driest
      ? { ...data.driest, item_name: resolveItemName(data.driest.item_id) }
      : null,
    hunting: (data.hunting ?? []).map((h) => ({ ...h, item_name: resolveItemName(h.item_id) })),
    pools: (data.pools ?? []).map(namedPool),
  };
}

/**
 * The luckiest and driest players who opted in from the plugin. Null when
 * the backend has leaderboards switched off (LEADERBOARD_ENABLED).
 */
export async function getLeaderboard(): Promise<LeaderboardResponse | null> {
  const data = API_BASE ? await fetchLeaderboard() : mockLeaderboard();
  if (!data) return null;
  const withNames = (entries: LeaderboardResponse["luckiest"]) =>
    entries.map((e) => ({ ...e, highlight: named(e.highlight) }));
  return { ...data, luckiest: withNames(data.luckiest), driest: withNames(data.driest) };
}

async function fetchLeaderboard(): Promise<LeaderboardResponse | null> {
  const res = await fetch(`${API_BASE}/leaderboard`, {
    cache: "no-store",
    headers: { apikey: PUBLISHABLE_KEY },
  });
  if (res.status === 501) return null;
  if (!res.ok) throw new Error(`Leaderboard failed (${res.status})`);
  return res.json();
}
