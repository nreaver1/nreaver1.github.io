import type { LuckResult } from "@/lib/types";
import type { ComparisonRow } from "@/lib/compare";
import LuckBadge from "./LuckBadge";
import ItemIcon from "./ItemIcon";

const FILL_CLASS: Record<LuckResult["label"], string> = {
  spooned: "bg-flame",
  average: "bg-brass",
  dry: "bg-dry",
  desert: "bg-dry",
};

/** One player's result for one item, sized to sit in a table column. */
function Cell({ r }: { r: LuckResult | null }) {
  if (!r) {
    return <span className="font-mono text-xs text-parchment-dim/60">not logged</span>;
  }

  const kc = r.kc_received !== null ? `${r.kc_received.toLocaleString()} KC` : null;

  if (r.backfilled) {
    return <span className="font-mono text-xs text-parchment-dim">obtained &middot; luck unknown</span>;
  }
  if (!r.supported) {
    return (
      <span className="font-mono text-xs text-parchment-dim">
        {kc ? `${kc} · ` : ""}not yet supported
      </span>
    );
  }

  const pct = Math.round(r.probability * 100);
  return (
    <div>
      <p className="font-mono text-sm tabular-nums text-parchment">
        {kc}
        {r.estimated && <span className="text-xs text-parchment-dim"> est.</span>}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <div
          className="h-1 w-16 shrink-0 bg-panel-border"
          role="img"
          aria-label={`${pct}% likely to have taken this long or less`}
        >
          <div className={`h-full ${FILL_CLASS[r.label]}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className="font-mono text-xs tabular-nums text-parchment-dim">{pct}%</span>
      </div>
      <div className="mt-0.5">
        <LuckBadge label={r.label} />
      </div>
    </div>
  );
}

/**
 * The same result as a phone row: name and numbers on one line, the luck
 * bar full-width underneath, so each player costs two short lines.
 */
function MobileRow({ name, r, luckiest }: { name: string; r: LuckResult | null; luckiest: boolean }) {
  let detail: React.ReactNode;
  let bar: React.ReactNode = null;

  if (!r) {
    detail = <span className="text-parchment-dim/60">not logged</span>;
  } else if (r.backfilled) {
    detail = <span className="text-parchment-dim">luck unknown</span>;
  } else if (!r.supported) {
    detail = (
      <span className="text-parchment-dim">
        {r.kc_received !== null ? `${r.kc_received.toLocaleString()} KC · ` : ""}not supported
      </span>
    );
  } else {
    const pct = Math.round(r.probability * 100);
    detail = (
      <>
        <span className="tabular-nums text-parchment">
          {r.kc_received !== null ? `${r.kc_received.toLocaleString()} KC` : ""}
          {r.estimated && <span className="text-parchment-dim"> est.</span>}
        </span>
        <span className="tabular-nums text-parchment-dim">{pct}%</span>
        <LuckBadge label={r.label} />
      </>
    );
    bar = (
      <div
        className="mt-1.5 h-1 bg-panel-border"
        role="img"
        aria-label={`${pct}% likely to have taken this long or less`}
      >
        <div className={`h-full ${FILL_CLASS[r.label]}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
        <span className={`min-w-0 truncate text-sm ${luckiest ? "text-brass" : "text-parchment"}`}>
          {luckiest && <span aria-hidden="true">&#9733; </span>}
          {name}
          {luckiest && <span className="sr-only"> (luckiest)</span>}
        </span>
        <span className="flex shrink-0 items-baseline gap-2">{detail}</span>
      </div>
      {bar}
    </div>
  );
}

export default function ComparisonTable({
  players,
  rows,
}: {
  players: string[];
  rows: ComparisonRow[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-parchment-dim">None of these players have logged drops yet.</p>;
  }

  return (
    <div>
      {/* Tablet / desktop: one column per player. If the columns still
          don't fit, the table scrolls sideways with the item column pinned. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-panel-border text-left font-mono text-xs uppercase tracking-wide text-parchment-dim">
              <th className="sticky left-0 z-10 min-w-[11rem] bg-ink py-2 pr-4 font-normal">Item</th>
              {players.map((name) => (
                <th key={name} className="min-w-[9rem] py-2 pl-3 pr-4 font-normal normal-case text-parchment">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-panel-border/60 align-top">
                <td className="sticky left-0 z-10 bg-ink py-3 pr-4">
                  <div className="flex items-start gap-3">
                    <ItemIcon itemId={row.item_id} name={row.item_name} />
                    <div className="min-w-0">
                      <p className="text-parchment">{row.item_name}</p>
                      <p className="mt-0.5 font-mono text-xs text-parchment-dim">{row.source_name}</p>
                    </div>
                  </div>
                </td>
                {row.cells.map((cell, i) => (
                  <td
                    key={players[i]}
                    // Every player column has left padding so the winner's
                    // brass edge (2px border + 10px padding) doesn't shift
                    // its value out of line with the others.
                    className={`py-3 pr-4 ${
                      row.luckiest[i] ? "border-l-2 border-l-brass bg-brass/[0.06] pl-2.5" : "pl-3"
                    }`}
                  >
                    {row.luckiest[i] && (
                      <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-brass">
                        <span aria-hidden="true">&#9733; </span>Luckiest
                      </p>
                    )}
                    <Cell r={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per item, a two-line row per player inside */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.key} className="border border-panel-border bg-panel px-4 py-3">
            <div className="flex items-start gap-3">
              <ItemIcon itemId={row.item_id} name={row.item_name} />
              <div className="min-w-0">
                <p className="text-parchment">{row.item_name}</p>
                <p className="mt-0.5 font-mono text-xs text-parchment-dim">{row.source_name}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {row.cells.map((cell, i) => (
                <MobileRow key={players[i]} name={players[i]} r={cell} luckiest={row.luckiest[i]} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
