// Raids tracked per completion (migration 0011). Each completion the
// plugin sees is a raid_completions row with the game's own completion
// counts for every mode right after it, and raid-specific details (for
// ToA: raid level and the player's points). A raid's drops are rated
// against that history rather than one assumed "typical" raid.
//
// A raid's log page is its single drop_rates source: modes are just
// counters on the page, so "Tombs of Amascut: Expert Mode" drops are
// stored under "Tombs of Amascut". For raid drops, kc_received is the
// page's total completions across every mode, and roll_context holds
// { mode, mode_counts, raid_id } (see RaidRollContext).

export interface RaidConfig {
  // Mode keys in log header order, and how the game's completion message
  // names each ("Your completed Tombs of Amascut: Expert Mode count is: 3").
  modes: Record<string, string>;
  // The most personal points the plugin can send for one raid.
  maxPersonalPoints: number;
}

export const RAIDS: Record<string, RaidConfig> = {
  "Chambers of Xeric": {
    modes: {
      normal: "Chambers of Xeric",
      challenge: "Chambers of Xeric Challenge Mode",
    },
    // Points aren't capped in the raid; this only stops nonsense.
    maxPersonalPoints: 5_000_000,
  },
  "Theatre of Blood": {
    modes: {
      entry: "Theatre of Blood: Entry Mode",
      normal: "Theatre of Blood",
      hard: "Theatre of Blood: Hard Mode",
    },
    // ToB's points never reach the client, so the plugin sends none.
    maxPersonalPoints: 0,
  },
  "Tombs of Amascut": {
    modes: {
      entry: "Tombs of Amascut: Entry Mode",
      normal: "Tombs of Amascut",
      expert: "Tombs of Amascut: Expert Mode",
    },
    maxPersonalPoints: 64_000,
  },
};

export type ModeCounts = Record<string, number>;

/** What the plugin sends for one completion (/record-raid, and with a raid drop). */
export interface RaidRecordInput {
  raid: string; // the log page
  mode: string;
  mode_counts: ModeCounts; // every mode's completion count right after this raid
  team_size: number | null;
  personal_points: number | null;
  purple: boolean | null; // a unique dropped for someone on the team
  purple_mine: boolean | null; // ...and it was this player's
  details: Record<string, unknown>; // ToA: { raid_level }; CoX: { total_points, reward_indicator }; ToB: { chests }
  completed_at: string;
}

/** A stored raid_completions row, as the luck calculation reads it. */
export interface RaidCompletion {
  id?: string;
  raid: string;
  mode: string;
  mode_kc: number;
  total_kc: number;
  mode_counts: ModeCounts;
  team_size: number | null;
  personal_points: number | null;
  purple: boolean | null;
  purple_mine: boolean | null;
  details: Record<string, unknown> | null;
  completed_at: string;
}

export interface RaidRollContext {
  mode?: string;
  mode_counts?: ModeCounts;
  raid_id?: string;
}

export const isRaidPage = (source: string): boolean => source in RAIDS;

/** The (page, mode) a completion-count name belongs to, if it's a tracked raid's. */
export function raidModeForKcName(kcName: string): { raid: string; mode: string } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [raid, config] of Object.entries(RAIDS)) {
    for (const [mode, name] of Object.entries(config.modes)) {
      if (norm(name) === norm(kcName)) return { raid, mode };
    }
  }
  return null;
}

export const totalOf = (counts: ModeCounts): number =>
  Object.values(counts).reduce((sum, n) => sum + n, 0);

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000;

const MAX_SUBMISSION_LAG_DAYS = 3;

/**
 * Validates a plugin-sent completion. Returns the record, or an error
 * message for a 400.
 */
export function parseRaidRecord(v: unknown): RaidRecordInput | string {
  const r = v as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return "raid must be an object";
  const raid = r.raid;
  if (typeof raid !== "string" || !isRaidPage(raid)) return "raid must be a tracked raid's log page";
  const config = RAIDS[raid];
  const mode = r.mode;
  if (typeof mode !== "string" || !(mode in config.modes)) return "mode is not one of this raid's modes";

  const counts = r.mode_counts as Record<string, unknown> | null;
  if (!counts || typeof counts !== "object") return "mode_counts must be an object";
  const modeCounts: ModeCounts = {};
  for (const m of Object.keys(config.modes)) {
    const n = counts[m] ?? 0;
    if (!isCount(n)) return `mode_counts.${m} must be a non-negative integer`;
    modeCounts[m] = n;
  }
  if (Object.keys(counts).some((k) => !(k in config.modes))) return "mode_counts has an unknown mode";
  if (modeCounts[mode] < 1) return "mode_counts must include this raid";

  const teamSize = r.team_size ?? null;
  if (teamSize !== null && !(Number.isInteger(teamSize) && (teamSize as number) >= 1 && (teamSize as number) <= 8)) {
    return "team_size must be 1 to 8";
  }
  const points = r.personal_points ?? null;
  const maxPoints = config.maxPersonalPoints;
  if (points !== null && !(Number.isInteger(points) && (points as number) >= 0 && (points as number) <= maxPoints)) {
    return `personal_points must be 0 to ${maxPoints.toLocaleString("en-US")}`;
  }
  const purple = r.purple ?? null;
  const purpleMine = r.purple_mine ?? null;
  if ((purple !== null && typeof purple !== "boolean") || (purpleMine !== null && typeof purpleMine !== "boolean")) {
    return "purple and purple_mine must be booleans";
  }
  if (purpleMine === true && purple === false) return "purple_mine needs purple";

  const details: Record<string, unknown> = {};
  const rawDetails = (r.details ?? {}) as Record<string, unknown>;
  if (raid === "Tombs of Amascut") {
    const level = rawDetails.raid_level ?? null;
    if (level !== null && !(Number.isInteger(level) && (level as number) >= 0 && (level as number) <= 600)) {
      return "details.raid_level must be 0 to 600";
    }
    if (level !== null) details.raid_level = level;
  } else if (raid === "Chambers of Xeric") {
    // The team's points (RAIDS_CLIENT_PARTYSCORE), which set the unique
    // rolls, and the raw reward indicator varbit, kept so purple detection
    // can be worked out from real raids later.
    const total = rawDetails.total_points ?? null;
    if (total !== null && !(Number.isInteger(total) && (total as number) >= 0 && (total as number) <= 20_000_000)) {
      return "details.total_points must be 0 to 20,000,000";
    }
    if (total !== null && points !== null && (total as number) < (points as number)) {
      return "details.total_points can't be below personal_points";
    }
    if (total !== null) details.total_points = total;
    const indicator = rawDetails.reward_indicator ?? null;
    if (indicator !== null && !(Number.isInteger(indicator) && (indicator as number) >= 0 && (indicator as number) <= 1023)) {
      return "details.reward_indicator must be 0 to 1,023";
    }
    if (indicator !== null) details.reward_indicator = indicator;
  } else if (raid === "Theatre of Blood") {
    // The raw treasure room chest varbits, kept like CoX's indicator.
    const chests = rawDetails.chests ?? null;
    if (chests !== null) {
      if (!Array.isArray(chests) || chests.length > 5 || chests.some((v) => !(Number.isInteger(v) && v >= 0 && v <= 1023))) {
        return "details.chests must be up to five integers 0 to 1,023";
      }
      details.chests = chests;
    }
  }

  const completedAt = r.completed_at == null ? new Date() : new Date(String(r.completed_at));
  if (Number.isNaN(completedAt.getTime())) return "completed_at must be an ISO timestamp";
  const lagDays = (Date.now() - completedAt.getTime()) / 86_400_000;
  if (lagDays > MAX_SUBMISSION_LAG_DAYS || lagDays < -1) return "completed_at outside acceptable window";

  return {
    raid,
    mode,
    mode_counts: modeCounts,
    team_size: teamSize as number | null,
    personal_points: points as number | null,
    purple: purple as boolean | null,
    purple_mine: purpleMine as boolean | null,
    details,
    completed_at: completedAt.toISOString(),
  };
}

/**
 * Raids 1..total of one raid page in order, for a raid model to rate.
 * Recorded raids sit at their total_kc; the rest take their mode from the
 * counts at the end that recorded raids don't account for, in log order.
 * Which untracked raid was which mode doesn't matter: per-raid chances
 * only depend on the mode, and pity (ToA's jewels) on the position.
 */
export function raidSequenceOf<R>(
  raid: string,
  total: number,
  recorded: RaidCompletion[],
  countsAtEnd: ModeCounts,
  fromRecord: (r: RaidCompletion) => R,
  untracked: (mode: string) => R,
): R[] {
  const slots: (R | null)[] = new Array(Math.max(0, total)).fill(null);
  const trackedByMode: Record<string, number> = {};
  for (const r of recorded) {
    if (r.raid !== raid || r.total_kc < 1 || r.total_kc > total || slots[r.total_kc - 1]) continue;
    slots[r.total_kc - 1] = fromRecord(r);
    trackedByMode[r.mode] = (trackedByMode[r.mode] ?? 0) + 1;
  }
  const untrackedModes: string[] = [];
  for (const mode of Object.keys(RAIDS[raid]?.modes ?? {})) {
    const n = Math.max(0, (countsAtEnd[mode] ?? 0) - (trackedByMode[mode] ?? 0));
    for (let i = 0; i < n; i++) untrackedModes.push(mode);
  }
  let next = 0;
  return slots.map((slot) => slot ?? untracked(untrackedModes[next++] ?? "normal"));
}

/** The row to insert for a completion. */
export function raidRow(accountHash: string, r: RaidRecordInput) {
  return {
    account_hash: accountHash,
    raid: r.raid,
    mode: r.mode,
    mode_kc: r.mode_counts[r.mode],
    total_kc: totalOf(r.mode_counts),
    mode_counts: r.mode_counts,
    team_size: r.team_size,
    personal_points: r.personal_points,
    purple: r.purple,
    purple_mine: r.purple_mine,
    details: r.details,
    completed_at: r.completed_at,
  };
}
