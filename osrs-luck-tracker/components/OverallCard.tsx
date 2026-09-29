import { MIN_RATED_DROPS, type OverallLuck } from "@/lib/overall";
import { luckTier } from "@/lib/luck-tier";
import LuckBadge from "./LuckBadge";
import { HOT_CARD_CLASS } from "./SummaryCard";

// Keeps "99.97%" from rounding up to a claim of 100%.
function formatPct(fraction: number): string {
  const pct = fraction * 100;
  if (pct >= 99.95) return "99.9%+";
  if (pct >= 99) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

const HEADLINE_CLASS = {
  jackpot: "text-flame3",
  lucky: "text-brass-bright",
  even: "text-parchment",
  unlucky: "text-dry-bright/75",
  dry: "text-dry-bright",
} as const;

/** The account's luck across every rated drop, as a percentile. */
export default function OverallCard({ overall }: { overall: OverallLuck | null }) {
  const tier = overall ? luckTier(overall.percentile) : null;
  const hot = tier?.tone === "jackpot";

  return (
    <div className={hot ? `p-5 ${HOT_CARD_CLASS}` : "border border-panel-border bg-panel p-5"}>
      <p
        className={
          hot
            ? "font-mono text-xs font-bold uppercase tracking-wide text-flame3"
            : "font-mono text-xs uppercase tracking-wide text-parchment-dim"
        }
      >
        Overall luck
      </p>

      {overall && tier ? (
        <>
          <p className={`mt-2 font-serif text-3xl font-medium sm:text-4xl ${HEADLINE_CLASS[tier.tone]}`}>
            {overall.percentile <= 0.5
              ? `Luckier than ${formatPct(1 - overall.percentile)}`
              : `Drier than ${formatPct(overall.percentile)}`}
          </p>
          <p className="mt-1 text-sm text-parchment-dim">
            of accounts with {overall.ratedDrops} rated drops.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-parchment-dim">
            <LuckBadge probability={overall.percentile} />
            <span>Average drop {Math.round(overall.average * 100)}%</span>
            {overall.unrated > 0 && (
              <span>
                {overall.unrated} backlogged or unrated {overall.unrated === 1 ? "drop" : "drops"} not counted
              </span>
            )}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-parchment-dim">
          Needs at least {MIN_RATED_DROPS} rated drops to call it.
        </p>
      )}
    </div>
  );
}
