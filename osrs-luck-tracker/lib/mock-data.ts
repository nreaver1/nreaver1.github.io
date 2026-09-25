import type { PlayerLuckResponse } from "./types";

// A few demo players, each built to exercise a different part of the UI:
// every luck label (spooned/average/dry/desert), estimated vs exact
// probabilities, the "not yet supported" (multi_roll) path, and the
// "backfilled" (obtained before tracking, luck unknown) path.

const ZEZIMA: PlayerLuckResponse = {
  ign: "Zezima",
  results: [
    {
      item_id: 4207,
      source_name: "The Gauntlet",
      kc_received: 12,
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
      probability: 0.075,
      label: "spooned",
      estimated: false,
      supported: true,
      backfilled: false,
    },
    {
      item_id: 27382,
      source_name: "Tumeken's Warden",
      kc_received: 640,
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
  results: [
    {
      item_id: 11812,
      source_name: "General Graardor",
      kc_received: 260,
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
) => ({ item_id, source_name, kc_received, probability, label, estimated: false, supported: true, backfilled: false });

const backfilled = (item_id: number, source_name: string) => ({
  item_id,
  source_name,
  kc_received: null,
  probability: NaN,
  label: "average" as const,
  estimated: false,
  supported: false,
  backfilled: true,
});

// Everything early.
const SPOONFED: PlayerLuckResponse = {
  ign: "Spoonfed",
  results: [
    flat(12922, "Zulrah", 20, 0.038, "spooned"),
    flat(21992, "Vorkath", 90, 0.03, "spooned"),
    flat(13231, "Cerberus", 15, 0.028, "spooned"),
    flat(12819, "Corporeal Beast", 200, 0.048, "spooned"),
  ],
  mostSpooned: null,
  driest: null,
};
SPOONFED.mostSpooned = SPOONFED.results[2];
SPOONFED.driest = SPOONFED.results[3];

// Everything late (and an IGN with a space).
const DRY_BONES: PlayerLuckResponse = {
  ign: "Dry Bones",
  results: [
    flat(12816, "Corporeal Beast", 30000, 0.998, "desert"),
    flat(12004, "Kraken", 1500, 0.977, "dry"),
    flat(13200, "Zulrah", 20000, 0.953, "dry"),
    flat(23757, "The Gauntlet", 2400, 0.699, "average"),
  ],
  mostSpooned: null,
  driest: null,
};
DRY_BONES.mostSpooned = DRY_BONES.results[3];
DRY_BONES.driest = DRY_BONES.results[0];

// Imported an existing log; one drop tracked since.
const BACKLOGGED: PlayerLuckResponse = {
  ign: "Backlogged",
  results: [
    backfilled(11832, "General Graardor"),
    backfilled(11834, "General Graardor"),
    backfilled(11836, "General Graardor"),
    backfilled(4708, "Barrows Chests"),
    backfilled(4718, "Barrows Chests"),
    flat(13227, "Cerberus", 700, 0.74, "average"),
  ],
  mostSpooned: null,
  driest: null,
};
BACKLOGGED.mostSpooned = BACKLOGGED.results[5];
BACKLOGGED.driest = BACKLOGGED.results[5];

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
