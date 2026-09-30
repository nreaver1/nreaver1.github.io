import type { LeaderboardEntry, LeaderboardResponse, LuckLabel, PlayerLuckResponse, SnapshotLuck } from "./types";
import { MIN_RATED_DROPS, isRated, overallLuck } from "./overall";

// Drop dates relative to now, like seed-demo.sql's `now() - interval`.
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

// A few demo players, each built to exercise a different part of the UI:
// every luck label (spooned/average/dry/desert), estimated vs exact
// probabilities, the "not yet supported" (multi_roll) path, and the
// "backfilled" (obtained before tracking, luck unknown) path.

const ZEZIMA: PlayerLuckResponse = {
  ign: "Zezima",
  demo: true,
  results: [
    {
      item_id: 4207,
      source_name: "The Gauntlet",
      kc_received: 12,
      date_received: daysAgo(150),
      probability: 0.0428,
      label: "spooned",
      estimated: false,
      supported: true,
      backfilled: false,
    },
    {
      item_id: 20997,
      source_name: "Chambers of Xeric",
      kc_received: 1900,
      date_received: daysAgo(40),
      probability: 0.91,
      label: "dry",
      estimated: true,
      supported: true,
      backfilled: false,
    },
    {
      item_id: 11832,
      source_name: "General Graardor",
      kc_received: 508,
      date_received: daysAgo(100),
      probability: 0.6321,
      label: "average",
      estimated: false,
      supported: true,
      backfilled: false,
    },
    {
      item_id: 19677,
      source_name: "General Graardor",
      kc_received: 15,
      date_received: daysAgo(135),
      probability: 0.365,
      label: "average",
      estimated: false,
      supported: true,
      backfilled: false,
    },
    {
      item_id: 26235,
      source_name: "Zaryte crossbow drop source",
      kc_received: 3120,
      date_received: daysAgo(20),
      probability: 0.997,
      label: "desert",
      estimated: false,
      supported: true,
      backfilled: false,
    },
    {
      item_id: 11834,
      source_name: "General Graardor",
      kc_received: 40,
      date_received: daysAgo(140),
      probability: 0.075,
      label: "spooned",
      estimated: false,
      supported: true,
      backfilled: false,
    },
    {
      // Guaranteed on the 50th kill: the pity badge.
      item_id: 21907,
      source_name: "Vorkath",
      kc_received: 50,
      date_received: daysAgo(90),
      probability: 1,
      label: "desert",
      estimated: true,
      supported: true,
      backfilled: false,
      pity: true,
    },
    {
      item_id: 27382,
      source_name: "Tumeken's Warden",
      kc_received: 640,
      date_received: daysAgo(30),
      probability: NaN,
      label: "average",
      estimated: true,
      supported: false,
      backfilled: false,
    },
    {
      item_id: 26374,
      source_name: "Amoxliatl",
      kc_received: null,
      date_received: null,
      probability: NaN,
      label: "average",
      estimated: false,
      supported: false,
      backfilled: true,
    },
  ],
  mostSpooned: null,
  driest: null,
};
ZEZIMA.mostSpooned = ZEZIMA.results[0];
ZEZIMA.driest = ZEZIMA.results[4];

// A newer account: only a couple of drops, mostly average luck.
const NEWSCAPE: PlayerLuckResponse = {
  ign: "Newscape",
  demo: true,
  results: [
    {
      item_id: 11812,
      source_name: "General Graardor",
      kc_received: 260,
      date_received: daysAgo(20),
      probability: 0.412,
      label: "average",
      estimated: false,
      supported: true,
      backfilled: false,
    },
    {
      item_id: 4207,
      source_name: "The Gauntlet",
      kc_received: 205,
      date_received: daysAgo(10),
      probability: 0.545,
      label: "average",
      estimated: false,
      supported: true,
      backfilled: false,
    },
  ],
  mostSpooned: null,
  driest: null,
};
NEWSCAPE.mostSpooned = NEWSCAPE.results[0];
NEWSCAPE.driest = NEWSCAPE.results[1];

// Exercises the empty state.
const EMPTY_LOGS: PlayerLuckResponse = {
  ign: "EmptyLogs",
  demo: true,
  results: [],
  mostSpooned: null,
  driest: null,
};

// The next three mirror the extra live demo players in
// osrs-luck-database/supabase/seed-demo.sql, with the probabilities the
// live API returns for them.
const flat = (
  item_id: number,
  source_name: string,
  kc_received: number,
  probability: number,
  label: PlayerLuckResponse["results"][number]["label"],
  days: number,
) => ({
  item_id,
  source_name,
  kc_received,
  date_received: daysAgo(days),
  probability,
  label,
  estimated: false,
  supported: true,
  backfilled: false,
});

const backfilled = (item_id: number, source_name: string, snapshot?: SnapshotLuck) => ({
  item_id,
  source_name,
  kc_received: null,
  date_received: null,
  probability: NaN,
  label: "average" as const,
  estimated: false,
  supported: false,
  backfilled: true,
  ...(snapshot ? { snapshot } : {}),
});

const snapshot = (kc: number, quantity: number, probability: number, label: SnapshotLuck["label"]) => ({
  kc,
  quantity,
  probability,
  label,
});

// Everything early.
const SPOONFED: PlayerLuckResponse = {
  ign: "Spoonfed",
  demo: true,
  results: [
    flat(12922, "Zulrah", 20, 0.038, "spooned", 80),
    flat(21992, "Vorkath", 90, 0.03, "spooned", 60),
    flat(13231, "Cerberus", 15, 0.028, "spooned", 45),
    flat(12819, "Corporeal Beast", 200, 0.048, "spooned", 20),
  ],
  mostSpooned: null,
  driest: null,
};
SPOONFED.mostSpooned = SPOONFED.results[2];
SPOONFED.driest = SPOONFED.results[3];

// Everything late (and an IGN with a space).
const DRY_BONES: PlayerLuckResponse = {
  ign: "Dry Bones",
  demo: true,
  results: [
    flat(12816, "Corporeal Beast", 30000, 0.998, "desert", 300),
    flat(12004, "Kraken", 1500, 0.977, "dry", 200),
    flat(13200, "Zulrah", 20000, 0.953, "dry", 100),
    flat(23757, "The Gauntlet", 2400, 0.699, "average", 50),
  ],
  mostSpooned: null,
  driest: null,
};
DRY_BONES.mostSpooned = DRY_BONES.results[3];
DRY_BONES.driest = DRY_BONES.results[0];

// Imported an existing log (with seed-demo.sql's KC snapshots); one drop
// tracked since.
const BACKLOGGED: PlayerLuckResponse = {
  ign: "Backlogged",
  demo: true,
  results: [
    backfilled(11832, "General Graardor", snapshot(1100, 1, 0.864, "dry")),
    backfilled(11834, "General Graardor", snapshot(1100, 3, 0.439, "average")),
    backfilled(11836, "General Graardor", snapshot(1100, 2, 0.668, "average")),
    // Barrows is pooled (BACKLOGGED.pools below), so these have no per-item estimate.
    backfilled(4708, "Barrows Chests"),
    backfilled(4718, "Barrows Chests"),
    backfilled(4712, "Barrows Chests"),
    backfilled(4720, "Barrows Chests"),
    backfilled(4730, "Barrows Chests"),
    backfilled(4745, "Barrows Chests"),
    backfilled(4755, "Barrows Chests"),
    backfilled(4759, "Barrows Chests"),
    flat(13227, "Cerberus", 700, 0.74, "average", 3),
  ],
  mostSpooned: null,
  driest: null,
};
// Mirrors seed-demo.sql's hunting_items, driest first as the API sorts them.
const hunting = (item_id: number, source_name: string, kc: number, probability: number, label: LuckLabel) => ({
  item_id,
  source_name,
  kc,
  probability,
  label,
});
BACKLOGGED.hunting = [
  hunting(11812, "General Graardor", 1100, 0.8855, "dry"),
  hunting(12650, "General Graardor", 1100, 0.1975, "average"),
];
// Mirrors seed-demo.sql's log_pages row, with the numbers get-player-luck returns for it.
const BARROWS_PIECES = [
  4708, 4710, 4712, 4714, 4716, 4718, 4720, 4722, 4724, 4726, 4728, 4730, 4732, 4734, 4736, 4738, 4745, 4747, 4749,
  4751, 4753, 4755, 4757, 4759,
];
BACKLOGGED.pools = [
  {
    source_name: "Barrows Chests",
    kc: 200,
    item_ids: BARROWS_PIECES,
    obtained_ids: [4708, 4712, 4718, 4720, 4730, 4745, 4755, 4759],
    quantities: { "4708": 1, "4712": 1, "4718": 2, "4720": 1, "4730": 1, "4745": 1, "4755": 1, "4759": 1 },
    total: { count: 9, expected: 13.725, probability: 0.9041, label: "dry" },
    distinct: { count: 8, of: 24, expected: 10.455, probability: 0.8388, label: "dry" },
  },
];
DRY_BONES.hunting = [
  hunting(12819, "Corporeal Beast", 30420, 0.9994, "desert"),
  hunting(12921, "Zulrah", 20108, 0.9934, "desert"),
];
BACKLOGGED.mostSpooned = BACKLOGGED.results[BACKLOGGED.results.length - 1];
BACKLOGGED.driest = BACKLOGGED.results[BACKLOGGED.results.length - 1];

const DEMO_PLAYERS: Record<string, PlayerLuckResponse> = {
  zezima: ZEZIMA,
  newscape: NEWSCAPE,
  emptylogs: EMPTY_LOGS,
  spoonfed: SPOONFED,
  "dry bones": DRY_BONES,
  backlogged: BACKLOGGED,
};

export const DEMO_IGNS = ["Zezima", "Newscape", "EmptyLogs", "Spoonfed", "Dry Bones", "Backlogged"];

export function mockPlayerLuck(ign: string): PlayerLuckResponse | null {
  return DEMO_PLAYERS[ign.trim().toLowerCase()] ?? null;
}

// Mock-mode leaderboard, ranked the way /leaderboard ranks
// (osrs-luck-database/supabase/functions/_shared/leaderboard.ts): the
// percentile of each player's average rated-drop probability, at least
// MIN_RATED_DROPS drops, luckiest below 50% and driest above. Every demo
// player is opted in, as in seed-demo.sql.

export function mockLeaderboard(): LeaderboardResponse {
  const scored = Object.values(DEMO_PLAYERS).flatMap((p) => {
    const overall = overallLuck(p.results);
    if (!overall) return [];
    const { average, percentile } = overall;
    const rated = p.results.filter(isRated);
    const byP = [...rated].sort((a, b) => a.probability - b.probability);
    return [{ ign: p.ign, rated, average, percentile, best: byP[0], worst: byP[byP.length - 1] }];
  });
  const entry = (p: (typeof scored)[number], highlight: LeaderboardEntry["highlight"]): LeaderboardEntry => ({
    ign: p.ign,
    demo: true,
    rated_drops: p.rated.length,
    average_probability: p.average,
    percentile: p.percentile,
    highlight,
  });
  return {
    min_rated_drops: MIN_RATED_DROPS,
    luckiest: scored
      .filter((p) => p.average < 0.5)
      .sort((a, b) => a.percentile - b.percentile || a.average - b.average || b.rated.length - a.rated.length)
      .map((p) => entry(p, p.best)),
    driest: scored
      .filter((p) => p.average > 0.5)
      .sort((a, b) => b.percentile - a.percentile || b.average - a.average || b.rated.length - a.rated.length)
      .map((p) => entry(p, p.worst)),
  };
}
