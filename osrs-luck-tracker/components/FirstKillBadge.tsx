import type { LuckResult } from "@/lib/types";
import { isFirstKill } from "@/lib/first-kill";

/**
 * Marks a drop that came on the player's first kill of its source
 * (isFirstKill). Shaped like PityBadge, in the jackpot gold, since it's
 * one of the moments the flame colors are kept for. Renders nothing for
 * any other drop, so callers can drop it in unconditionally.
 */
export default function FirstKillBadge({ r, className = "" }: { r: LuckResult; className?: string }) {
  if (!isFirstKill(r)) return null;
  return (
    <span
      title="Dropped on the first kill"
      className={`inline-block border border-flame3/60 px-1.5 py-px align-middle font-mono text-[0.65rem] font-normal uppercase leading-normal tracking-wide text-flame3 ${className}`}
    >
      First kill
    </span>
  );
}
