"use client";

import { useState } from "react";
import type { LuckResult, SnapshotLuck } from "@/lib/types";
import BacklogToggle, { EstimatesToggle, withoutEstimate } from "./BacklogToggle";
import LuckBar from "./LuckBar";
import LuckBadge from "./LuckBadge";
import ItemIcon from "./ItemIcon";
import PityBadge from "./PityBadge";

export const SNAPSHOT_DESCRIPTION = "chance a fair player has more by this KC, counting ties as half";

/** "2 by 200 KC": the log page's count when it was imported. */
export function snapshotText(s: SnapshotLuck) {
  return `${s.quantity.toLocaleString()} by ${s.kc.toLocaleString()} KC`;
}

// The phone card already shows the badge in its header, so only the
// desktop row asks for it here.
function LuckCell({ r, showBadge = false }: { r: LuckResult; showBadge?: boolean }) {
  if (r.backfilled && r.snapshot) {
    // Rates the count at import, not a drop: always an estimate, and the
    // backlog line under it says so.
    return (
      <div>
        <div className="flex items-center gap-3">
          <LuckBar probability={r.snapshot.probability} label={r.snapshot.label} description={SNAPSHOT_DESCRIPTION} />
          <span className="font-mono text-xs text-parchment-dim">est.</span>
          {showBadge && <LuckBadge probability={r.snapshot.probability} />}
        </div>
        <p className="mt-1 font-mono text-xs text-parchment-dim">
          logged before tracking &middot; {snapshotText(r.snapshot)}
        </p>
      </div>
    );
  }
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
      {showBadge && <LuckBadge probability={r.probability} />}
      {r.pity && <PityBadge />}
    </div>
  );
}

function KcCell({ r }: { r: LuckResult }) {
  if (r.kc_received === null) {
    return <span className="text-parchment-dim">&mdash;</span>;
  }
  return <>{r.kc_received.toLocaleString()}</>;
}

// Formatted in UTC, the game's own clock, so the server render and the
// browser always agree on the day.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function DateCell({ r }: { r: LuckResult }) {
  if (!r.date_received) {
    return <span className="text-parchment-dim">&mdash;</span>;
  }
  return <time dateTime={r.date_received}>{dateFormat.format(new Date(r.date_received))}</time>;
}

type SortKey = "item" | "source" | "kc" | "date" | "luck";
type SortDir = "asc" | "desc";
interface Sort {
  key: SortKey;
  dir: SortDir;
}

const itemName = (r: LuckResult) => r.item_name ?? `Item #${r.item_id}`;

// Each column's value, or null when there's nothing to compare (no KC or
// date for backlogged items, no rated luck for backlogged or unsupported
// ones). Nulls always sort last, whichever way the column is sorted.
const SORT_VALUE: Record<SortKey, (r: LuckResult) => string | number | null> = {
  item: itemName,
  source: (r) => r.source_name,
  kc: (r) => r.kc_received,
  date: (r) => (r.date_received ? Date.parse(r.date_received) : null),
  luck: (r) => (r.supported && !r.backfilled ? r.probability : null),
};

// The direction a column starts in when first clicked.
const FIRST_DIR: Record<SortKey, SortDir> = {
  item: "asc",
  source: "asc",
  kc: "asc",
  date: "desc",
  luck: "asc",
};

const DEFAULT_SORT: Sort = { key: "luck", dir: "asc" }; // luckiest first

function compareValues(a: string | number, b: string | number) {
  return typeof a === "string" && typeof b === "string"
    ? a.localeCompare(b)
    : (a as number) - (b as number);
}

function sortResults(results: LuckResult[], { key, dir }: Sort) {
  const value = SORT_VALUE[key];
  return [...results].sort((ra, rb) => {
    const a = value(ra);
    const b = value(rb);
    if (a !== null && b !== null) {
      const c = compareValues(a, b);
      if (c !== 0) return dir === "asc" ? c : -c;
    } else if (a !== b) {
      return a === null ? 1 : -1;
    }
    // Unrated luck: unsupported above backlogged, and backlogged items
    // with a snapshot ordered by it, above those without. Then by item,
    // for a stable order.
    if (key === "luck" && ra.backfilled !== rb.backfilled) return ra.backfilled ? 1 : -1;
    if (key === "luck" && ra.backfilled) {
      const sa = ra.snapshot?.probability ?? null;
      const sb = rb.snapshot?.probability ?? null;
      if (sa !== null && sb !== null && sa !== sb) return dir === "asc" ? sa - sb : sb - sa;
      if (sa !== sb) return sa === null ? 1 : -1;
    }
    return itemName(ra).localeCompare(itemName(rb)) || ra.source_name.localeCompare(rb.source_name);
  });
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "item", label: "Item" },
  { key: "source", label: "Source" },
  { key: "kc", label: "KC" },
  { key: "date", label: "Obtained" },
  { key: "luck", label: "Luck" },
];

// Phone cards have no header row, so they get a dropdown instead.
const MOBILE_SORTS: { sort: Sort; label: string }[] = [
  { sort: { key: "luck", dir: "asc" }, label: "Luckiest first" },
  { sort: { key: "luck", dir: "desc" }, label: "Driest first" },
  { sort: { key: "date", dir: "desc" }, label: "Newest first" },
  { sort: { key: "date", dir: "asc" }, label: "Oldest first" },
  { sort: { key: "kc", dir: "asc" }, label: "Lowest KC" },
  { sort: { key: "kc", dir: "desc" }, label: "Highest KC" },
  { sort: { key: "item", dir: "asc" }, label: "Item A–Z" },
  { sort: { key: "item", dir: "desc" }, label: "Item Z–A" },
  { sort: { key: "source", dir: "asc" }, label: "Source A–Z" },
  { sort: { key: "source", dir: "desc" }, label: "Source Z–A" },
];

const sortId = ({ key, dir }: Sort) => `${key}-${dir}`;

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: (typeof COLUMNS)[number];
  sort: Sort;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column.key;
  return (
    <th
      className="py-2 pr-4 font-normal"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`inline-flex items-center gap-1 py-1 uppercase tracking-wide hover:text-parchment ${
          active ? "text-brass" : ""
        }`}
      >
        {column.label}
        <span aria-hidden className={active ? "" : "invisible"}>
          {active && sort.dir === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}

export default function LuckTable({ results: allResults }: { results: LuckResult[] }) {
  const [showBacklog, setShowBacklog] = useState(true);
  const [showEstimates, setShowEstimates] = useState(false);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  if (allResults.length === 0) {
    return (
      <p className="text-sm text-parchment-dim">
        No logged drops yet. Once the plugin syncs, they&rsquo;ll show up here.
      </p>
    );
  }

  const backlogCount = allResults.filter((r) => r.backfilled).length;
  const hasEstimates = allResults.some((r) => r.snapshot);
  // Without its snapshot a backlogged row reads, and sorts, as "luck unknown".
  const visible = showBacklog ? allResults : allResults.filter((r) => !r.backfilled);
  const results = sortResults(showEstimates && showBacklog ? visible : visible.map(withoutEstimate), sort);

  // Clicking the sorted column flips it; another column starts in its own direction.
  const sortBy = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_DIR[key] },
    );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6">
        {backlogCount > 0 && (
          <div className="flex flex-wrap items-center gap-x-6">
            <BacklogToggle shown={showBacklog} count={backlogCount} onChange={setShowBacklog} />
            {hasEstimates && (
              <EstimatesToggle shown={showEstimates} disabled={!showBacklog} onChange={setShowEstimates} />
            )}
          </div>
        )}
        {results.length > 1 && (
          <label className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-parchment-dim sm:hidden">
            Sort
            <select
              value={sortId(sort)}
              onChange={(e) =>
                setSort(MOBILE_SORTS.find((o) => sortId(o.sort) === e.target.value)?.sort ?? DEFAULT_SORT)
              }
              className="border border-panel-border bg-panel px-2 py-1.5 normal-case tracking-normal text-parchment"
            >
              {MOBILE_SORTS.map((o) => (
                <option key={sortId(o.sort)} value={sortId(o.sort)}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {results.length === 0 && (
        <p className="text-sm text-parchment-dim">
          Every drop here was logged before tracking started.
        </p>
      )}

      {/* Desktop / tablet: real table */}
      <table className={`hidden w-full border-collapse text-sm ${results.length > 0 ? "sm:table" : ""}`}>
        <thead>
          <tr className="border-b border-panel-border text-left font-mono text-xs uppercase tracking-wide text-parchment-dim">
            {COLUMNS.map((c) => (
              <SortHeader key={c.key} column={c} sort={sort} onSort={sortBy} />
            ))}
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
                  <ItemIcon itemId={r.item_id} name={itemName(r)} />
                  {itemName(r)}
                </span>
              </td>
              <td className="py-3 pr-4 text-parchment-dim">{r.source_name}</td>
              <td className="py-3 pr-4 font-mono tabular-nums text-parchment-dim">
                <KcCell r={r} />
              </td>
              <td className="whitespace-nowrap py-3 pr-4 font-mono tabular-nums text-parchment-dim">
                <DateCell r={r} />
              </td>
              <td className="py-3 pr-4">
                <LuckCell r={r} showBadge />
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
              <ItemIcon itemId={r.item_id} name={itemName(r)} />
              <div className="min-w-0 flex-1">
                <p className="text-parchment">{itemName(r)}</p>
                <p className="mt-0.5 font-mono text-xs text-parchment-dim">
                  {r.source_name} · <KcCell r={r} /> {r.kc_received !== null && "KC"}
                  {r.date_received && (
                    <>
                      {" "}
                      · <DateCell r={r} />
                    </>
                  )}
                </p>
              </div>
              {r.supported && !r.backfilled && <LuckBadge probability={r.probability} />}
              {r.backfilled && r.snapshot && <LuckBadge probability={r.snapshot.probability} />}
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
