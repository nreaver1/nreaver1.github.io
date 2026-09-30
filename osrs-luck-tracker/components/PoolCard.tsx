import type { PoolResult, PoolScore } from "@/lib/types";
import LuckBar from "./LuckBar";
import LuckBadge from "./LuckBadge";
import ItemIcon from "./ItemIcon";

const oneDecimal = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

function ScoreRow({ label, value, score, description }: {
  label: string;
  value: string;
  score: PoolScore;
  description: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-xs">
        <span className="uppercase tracking-wide text-parchment-dim">{label}</span>
        <span className="tabular-nums text-parchment">
          {value} <span className="text-parchment-dim">({oneDecimal(score.expected)} expected)</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <LuckBar probability={score.probability} label={score.label} description={description} />
        <LuckBadge probability={score.probability} />
      </div>
    </div>
  );
}

/**
 * A log page rated as a whole: total uniques and how much of the page is
 * filled in, each against what a fair player would have by the same kill
 * count. Stands in for the per-item estimates and "still hunting" rows of
 * the page's pooled items, which would all repeat the same number.
 */
export default function PoolCard({ pool }: { pool: PoolResult }) {
  const name = (id: number) => pool.item_names?.[String(id)] ?? `Item #${id}`;
  const obtained = new Set(pool.obtained_ids);
  const missing = pool.item_ids.filter((id) => !obtained.has(id));

  return (
    <div className="border border-panel-border bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-lg font-medium text-parchment">{pool.source_name}</p>
        <p className="font-mono text-xs tabular-nums text-parchment-dim">
          {pool.kc.toLocaleString()} KC at last log read
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {pool.total && (
          <ScoreRow
            label="Uniques"
            value={pool.total.count.toLocaleString()}
            score={pool.total}
            description="of players would have more uniques by this KC"
          />
        )}
        <ScoreRow
          label="Log slots"
          value={`${pool.distinct.count} of ${pool.distinct.of}`}
          score={pool.distinct}
          description="of players would have more of these slots filled by this KC"
        />
      </div>

      <details className="group mt-4">
        <summary className="cursor-pointer list-none py-1 font-mono text-xs uppercase tracking-wide text-parchment-dim hover:text-parchment">
          <span className="text-brass group-open:hidden">&#9656;</span>
          <span className="hidden text-brass group-open:inline">&#9662;</span> {pool.obtained_ids.length} obtained
          &middot; {missing.length} still hunting
        </summary>
        <ul className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          {pool.item_ids.map((id) => {
            const q = pool.quantities[String(id)];
            return (
              <li key={id} className={`flex items-center gap-2 ${obtained.has(id) ? "text-parchment" : "text-parchment-dim/70"}`}>
                <ItemIcon itemId={id} name={name(id)} />
                <span className="min-w-0 truncate">{name(id)}</span>
                {obtained.has(id) && q !== undefined && q > 1 && (
                  <span className="font-mono text-xs tabular-nums text-parchment-dim">&times;{q}</span>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
