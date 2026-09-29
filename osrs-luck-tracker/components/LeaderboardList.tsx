import type { LeaderboardEntry } from "@/lib/types";
import { playerHref } from "@/lib/compare";
import PlayerLink from "./PlayerLink";
import ItemIcon from "./ItemIcon";
import LuckBadge from "./LuckBadge";
import DemoBadge from "./DemoBadge";
import { DRY_CARD_CLASS, HOT_CARD_CLASS } from "./SummaryCard";
import { describePercentile } from "@/lib/overall";

/** One side of the leaderboard: players ranked by overall luck percentile. */
export default function LeaderboardList({
  title,
  blurb,
  highlightLabel,
  entries,
  hot = false,
}: {
  title: string;
  blurb: string;
  /** What the highlighted drop is, e.g. "best pull". */
  highlightLabel: string;
  entries: LeaderboardEntry[];
  hot?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={`p-5 ${hot ? HOT_CARD_CLASS : DRY_CARD_CLASS}`}
    >
      <h2
        className={
          hot
            ? "font-mono text-sm font-bold uppercase tracking-wide text-flame3"
            : "font-mono text-sm font-bold uppercase tracking-wide text-dry-bright"
        }
      >
        {title}
      </h2>
      <p className="mt-1 text-sm text-parchment-dim">{blurb}</p>

      {entries.length === 0 ? (
        <p className="mt-6 font-mono text-xs text-parchment-dim">Nobody here yet.</p>
      ) : (
        <ol className="mt-4">
          {entries.map((e, i) => {
            const item = e.highlight.item_name ?? `Item #${e.highlight.item_id}`;
            const headline = describePercentile(e.percentile);
            return (
              <li key={e.ign} className="flex items-center gap-3 border-t py-3 first:border-t-0">
                <span
                  className={`w-6 shrink-0 text-center font-mono text-lg ${
                    i === 0 ? (hot ? "flame-text" : "text-dry-bright") : "text-parchment-dim"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <PlayerLink
                    href={playerHref(e.ign)}
                    className="break-words text-lg font-medium text-parchment underline-offset-4 hover:underline"
                  >
                    {e.ign}
                  </PlayerLink>
                  {e.demo && <DemoBadge className="ml-2" />}
                  <p className="mt-1 flex items-center gap-2 font-mono text-xs text-parchment-dim">
                    <ItemIcon itemId={e.highlight.item_id} name={item} size="sm" />
                    <span className="min-w-0">
                      {highlightLabel}: <span className="text-parchment">{item}</span>
                      {e.highlight.kc_received !== null && ` at ${e.highlight.kc_received.toLocaleString()} KC`}
                      {" · "}
                      {e.rated_drops} rated {e.rated_drops === 1 ? "drop" : "drops"}
                      {" · "}avg {Math.round(e.average_probability * 100)}%
                    </span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-parchment-dim">
                    {headline.side} than
                  </p>
                  <p className="font-mono text-lg tabular-nums text-parchment">{headline.pct}</p>
                  <LuckBadge probability={e.percentile} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
