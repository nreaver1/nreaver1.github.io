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

const DEMO_PLAYERS: Record<string, PlayerLuckResponse> = {
  zezima: ZEZIMA,
  newscape: NEWSCAPE,
  emptylogs: EMPTY_LOGS,
};

export const DEMO_IGNS = ["Zezima", "Newscape", "EmptyLogs"];

export function mockPlayerLuck(ign: string): PlayerLuckResponse | null {
  return DEMO_PLAYERS[ign.trim().toLowerCase()] ?? null;
}
