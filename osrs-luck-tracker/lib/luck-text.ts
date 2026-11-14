// What each percentage on the site means, in one sentence or two. Used as
// the hover title and the screen-reader label of every percentage, so the
// two always say the same thing.
import type { HuntingMode, HuntingResult, LuckResult, PoolResult, RaidSummary } from "./types";
import { describePercentile } from "./overall";

/** Rounded like the percentage shown next to it. */
const pct = (p: number) => Math.round(p * 100);

const itemName = (r: { item_id: number; item_name?: string }) => r.item_name ?? `Item #${r.item_id}`;

/** "by 412 KC", or "by 120 Gauntlet + 30 Corrupted Gauntlet kills" when several modes count. */
function byKills(kc: number, modes: HuntingMode[] | undefined): string {
  if (modes && modes.length > 1) {
    return `by ${modes.map((m) => `${m.kc.toLocaleString()} ${m.name}`).join(" + ")} kills`;
  }
  return `by ${kc.toLocaleString()} KC`;
}

/** A tracked drop: how many players would have had it by the kill it came on. */
export function dropText(r: LuckResult): string {
  const p = pct(r.probability);
  const kc = r.kc_received ?? 0;
  // Only name the modes when a mode other than the drop's own counted.
  const modes = (r.modes ?? []).some((m) => m.source_name !== r.source_name) ? r.modes : undefined;
  let text =
    `${p}% of players would have had ${itemName(r)} ${byKills(kc, modes)}. ` +
    `Lower is luckier: ${p}% means ${100 - p} in 100 players would still be waiting.`;
  if (r.estimated) text += " Approximate: this rate depends on raid points or a pity timer.";
  if (r.pity) text += " Guaranteed by the pity timer on this kill.";
  return text;
}

/** A backlogged item's estimate from the count on its log page. */
export function snapshotLuckText(r: LuckResult): string {
  const s = r.snapshot!;
  return (
    `Estimate: ${pct(s.probability)}% of players would have more than ${s.quantity.toLocaleString()} ` +
    `${itemName(r)} by ${s.kc.toLocaleString()} KC, counting ties as half. Lower is luckier. ` +
    `Logged before tracking, so this rates the log page's count, not when the drop came.`
  );
}

/** An item the log shows is still missing. */
export function huntingText(h: HuntingResult): string {
  return `${pct(h.probability)}% of players would have had ${itemName(h)} ${byKills(h.kc, h.modes)}. Higher means more overdue.`;
}

export function poolUniquesText(pool: PoolResult): string {
  const s = pool.total!;
  return (
    `${pct(s.probability)}% of players would have more than ${s.count.toLocaleString()} uniques from ` +
    `${pool.source_name} by ${pool.kc.toLocaleString()} KC, counting ties as half. Lower is luckier.`
  );
}

export function poolSlotsText(pool: PoolResult): string {
  const s = pool.distinct;
  return (
    `${pct(s.probability)}% of players would have more than ${s.count} of these ${s.of} slots filled ` +
    `by ${pool.kc.toLocaleString()} KC, counting ties as half. Lower is luckier.`
  );
}

export function raidPurplesText(raid: RaidSummary): string {
  return (
    `${pct(raid.probability ?? 0)}% of players would have more than ${raid.purples} ${raid.purples === 1 ? "purple" : "purples"} from these ` +
    `${raid.tracked.toLocaleString()} raids, counting ties as half. Lower is luckier.`
  );
}

/** `details` is the last raid's line: mode, level, team size, points. */
export function lastRaidChanceText(ign: string, details: string): string {
  return `${ign}'s own chance of a purple from that raid (${details}).`;
}

/** The "Luckier than 97%" / "Drier than 88%" headline. */
export function overallText(ign: string, percentile: number, ratedDrops: number): string {
  const { side, pct: shown } = describePercentile(percentile);
  const comparison = side === "Luckier" ? "a higher (drier)" : "a lower (luckier)";
  return (
    `Of accounts with ${ratedDrops} rated drops and average luck, ${shown} would have ${comparison} ` +
    `average than ${ign}. Only drops tracked since the plugin was installed count.`
  );
}

export function averageDropText(ign: string, ratedDrops: number): string {
  return `The average of ${ign}'s ${ratedDrops} rated drop percentages. 50% is typical luck. Lower is luckier.`;
}
