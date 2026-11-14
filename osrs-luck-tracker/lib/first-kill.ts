import type { LuckResult } from "./types";

/**
 * A tracked drop that came on the player's very first kill of its source.
 * Worked out here from `kc_received`, not stored. A backfilled item has no
 * KC, so it never counts. On a page that counts several modes (The Gauntlet
 * and Corrupted Gauntlet), `kc_received` is only the drop's own mode's
 * count, so any kills in another mode rule it out. Mirrored by
 * LuckCheckMessage.isFirstKill in the plugin.
 */
export function isFirstKill(r: LuckResult): boolean {
  if (r.backfilled || r.kc_received !== 1) return false;
  return (r.modes ?? []).every((m) => m.source_name === r.source_name || m.kc === 0);
}
