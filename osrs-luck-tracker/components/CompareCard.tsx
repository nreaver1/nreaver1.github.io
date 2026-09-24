import Link from "next/link";
import type { LuckResult, PlayerLuckResponse } from "@/lib/types";

function Highlight({ label, result, hot = false }: { label: string; result: LuckResult | null; hot?: boolean }) {
  return (
    <div className="mt-3">
      <p
        className={`font-mono text-xs uppercase tracking-wide ${
          hot ? "font-bold text-flame3" : "text-parchment-dim"
        }`}
      >
        {label}
      </p>
      {result ? (
        <p className="mt-0.5 text-sm text-parchment">
          {result.item_name ?? `Item #${result.item_id}`}{" "}
          <span className="font-mono text-xs text-parchment-dim">
            {Math.round(result.probability * 100)}%
          </span>
        </p>
      ) : (
        <p className="mt-0.5 text-sm text-parchment-dim">&mdash;</p>
      )}
    </div>
  );
}

/** Compact per-player summary for the comparison view. */
export default function CompareCard({
  player,
  soloHref,
  removeHref,
}: {
  player: PlayerLuckResponse;
  soloHref: string;
  removeHref: string;
}) {
  const logged = player.results.length;
  return (
    <div className="relative h-full border border-panel-border bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={soloHref}
          className="min-w-0 break-words text-lg font-medium text-parchment underline-offset-4 hover:underline"
        >
          {player.ign}
        </Link>
        <Link
          href={removeHref}
          aria-label={`Remove ${player.ign} from the comparison`}
          title="Remove from comparison"
          // Padding pulled back with negative margin: a thumb-sized hit area
          // without shifting the visible glyph.
          className="-m-3 p-3 font-mono text-lg leading-none text-parchment-dim hover:text-brass"
        >
          &times;
        </Link>
      </div>
      <p className="mt-0.5 font-mono text-xs text-parchment-dim">
        {logged} logged {logged === 1 ? "drop" : "drops"}
      </p>
      <Highlight label="Jackpot" result={player.mostSpooned} hot />
      <Highlight label="Dry streak" result={player.driest} />
    </div>
  );
}
