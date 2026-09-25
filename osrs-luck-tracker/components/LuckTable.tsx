import type { LuckResult } from "@/lib/types";
import LuckBar from "./LuckBar";
import LuckBadge from "./LuckBadge";
import ItemIcon from "./ItemIcon";

function LuckCell({ r }: { r: LuckResult }) {
  if (r.backfilled) {
    return (
      <span className="font-mono text-xs text-parchment-dim">
        logged before tracking &mdash; luck unknown
      </span>
    );
  }
  if (!r.supported) {
    return (
      <span className="font-mono text-xs text-parchment-dim">
        not yet supported
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <LuckBar probability={r.probability} label={r.label} />
      {r.estimated && (
        <span className="font-mono text-xs text-parchment-dim">est.</span>
      )}
    </div>
  );
}

function KcCell({ r }: { r: LuckResult }) {
  if (r.kc_received === null) {
    return <span className="text-parchment-dim">&mdash;</span>;
  }
  return <>{r.kc_received.toLocaleString()}</>;
}

export default function LuckTable({ results }: { results: LuckResult[] }) {
  if (results.length === 0) {
    return (
      <p className="text-sm text-parchment-dim">
        No logged drops yet. Once the plugin syncs, they'll show up here.
      </p>
    );
  }

  return (
    <div>
      {/* Desktop / tablet: real table */}
      <table className="hidden w-full border-collapse text-sm sm:table">
        <thead>
          <tr className="border-b border-panel-border text-left font-mono text-xs uppercase tracking-wide text-parchment-dim">
            <th className="py-2 pr-4 font-normal">Item</th>
            <th className="py-2 pr-4 font-normal">Source</th>
            <th className="py-2 pr-4 font-normal">KC</th>
            <th className="py-2 pr-4 font-normal">Luck</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr
              key={`${r.item_id}-${r.source_name}`}
              className="border-b border-panel-border/60"
            >
              <td className="py-2 pr-4 text-parchment">
                <span className="flex items-center gap-3">
                  <ItemIcon itemId={r.item_id} name={r.item_name ?? `Item #${r.item_id}`} />
                  {r.item_name ?? `Item #${r.item_id}`}
                </span>
              </td>
              <td className="py-3 pr-4 text-parchment-dim">{r.source_name}</td>
              <td className="py-3 pr-4 font-mono tabular-nums text-parchment-dim">
                <KcCell r={r} />
              </td>
              <td className="py-3 pr-4">
                <LuckCell r={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: stacked ledger cards, same data, no horizontal scroll */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {results.map((r) => (
          <li
            key={`${r.item_id}-${r.source_name}`}
            className="border border-panel-border bg-panel p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <ItemIcon itemId={r.item_id} name={r.item_name ?? `Item #${r.item_id}`} />
              <div className="min-w-0 flex-1">
                <p className="text-parchment">{r.item_name ?? `Item #${r.item_id}`}</p>
                <p className="mt-0.5 font-mono text-xs text-parchment-dim">
                  {r.source_name} · <KcCell r={r} /> {r.kc_received !== null && "KC"}
                </p>
              </div>
              {r.supported && !r.backfilled && <LuckBadge label={r.label} />}
            </div>
            <div className="mt-3">
              <LuckCell r={r} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
