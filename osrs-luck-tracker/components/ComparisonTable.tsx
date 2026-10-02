"use client";

import { useState } from "react";
import type { LuckResult } from "@/lib/types";
import type { ComparisonRow } from "@/lib/compare";
import BacklogToggle, { EstimatesToggle, withoutEstimate } from "./BacklogToggle";
import LuckBadge from "./LuckBadge";
import PityBadge from "./PityBadge";
import ItemIcon from "./ItemIcon";
import { compareResults, SNAPSHOT_DESCRIPTION, snapshotText, type SortDir } from "./LuckTable";
import SourceLink from "./SourceLink";

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

  if (r.backfilled && r.snapshot) {
    // Drawn like a rated cell, but it's never a comparison winner
    // (lib/compare.ts) and the backlog line says it's an estimate.
    const snapPct = Math.round(r.snapshot.probability * 100);
    return (
      <div>
        <p className="font-mono text-sm tabular-nums text-parchment">
          {snapshotText(r.snapshot)}
          <span className="text-xs text-parchment-dim"> est.</span>
        </p>
        <div className="mt-1 flex items-center gap-2">
          <div
            className="h-1 w-16 shrink-0 bg-panel-border"
            role="img"
            aria-label={`${snapPct}% ${SNAPSHOT_DESCRIPTION}`}
          >
            <div className={`h-full ${FILL_CLASS[r.snapshot.label]}`} style={{ width: `${Math.min(snapPct, 100)}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums text-parchment-dim">{snapPct}%</span>
        </div>
        <div className="mt-0.5">
          <LuckBadge probability={r.snapshot.probability} />
        </div>
        <p className="mt-1 font-mono text-xs text-parchment-dim">logged before tracking</p>
      </div>
    );
  }
  if (r.backfilled) {
    return <span className="font-mono text-xs text-parchment-dim">logged before tracking &mdash; luck unknown</span>;
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
      <div className="mt-0.5 flex items-center gap-2">
        <LuckBadge probability={r.probability} />
        {r.pity && <PityBadge />}
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
  } else if (r.backfilled && r.snapshot) {
    const snapPct = Math.round(r.snapshot.probability * 100);
    detail = (
      <>
        <span className="tabular-nums text-parchment">
          {snapshotText(r.snapshot)}
          <span className="text-parchment-dim"> est.</span>
        </span>
        <span className="tabular-nums text-parchment-dim">{snapPct}%</span>
        <LuckBadge probability={r.snapshot.probability} />
      </>
    );
    bar = (
      <div className="mt-1.5 h-1 bg-panel-border" role="img" aria-label={`${snapPct}% ${SNAPSHOT_DESCRIPTION}`}>
        <div className={`h-full ${FILL_CLASS[r.snapshot.label]}`} style={{ width: `${Math.min(snapPct, 100)}%` }} />
      </div>
    );
  } else if (r.backfilled) {
    detail = <span className="text-parchment-dim">backlog &middot; luck unknown</span>;
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
        <LuckBadge probability={r.probability} />
        {r.pity && <PityBadge />}
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

// "shared" is buildComparisonRows' order: drops more players have first.
type CompareSort =
  | { by: "shared" }
  | { by: "item" | "source"; dir: SortDir }
  | { by: "player"; index: number; dir: SortDir };
type ColumnSort = Exclude<CompareSort, { by: "shared" }>;

const DEFAULT_SORT: CompareSort = { by: "shared" };

// The column a sort is on, ignoring direction.
const columnId = (s: CompareSort) => (s.by === "player" ? `player-${s.index}` : s.by);
const sortId = (s: CompareSort) => (s.by === "shared" ? "shared" : `${columnId(s)}-${s.dir}`);

function sortOptions(players: string[]): { sort: CompareSort; label: string }[] {
  return [
    { sort: { by: "shared" }, label: "Most shared first" },
    ...players.flatMap((name, index): { sort: CompareSort; label: string }[] => [
      { sort: { by: "player", index, dir: "asc" }, label: `${name}: luckiest first` },
      { sort: { by: "player", index, dir: "desc" }, label: `${name}: driest first` },
    ]),
    { sort: { by: "item", dir: "asc" }, label: "Item A–Z" },
    { sort: { by: "item", dir: "desc" }, label: "Item Z–A" },
    { sort: { by: "source", dir: "asc" }, label: "Source A–Z" },
    { sort: { by: "source", dir: "desc" }, label: "Source Z–A" },
  ];
}

function sortRows(rows: ComparisonRow[], sort: CompareSort): ComparisonRow[] {
  if (sort.by === "shared") return rows;
  const shared = new Map(rows.map((row, i) => [row.key, i]));
  return [...rows].sort((a, b) => {
    if (sort.by === "player") {
      // A player's column sorts like their own luck table; drops they
      // haven't logged go last, in the default order.
      const ca = a.cells[sort.index];
      const cb = b.cells[sort.index];
      if (ca && cb) return compareResults(ca, cb, { key: "luck", dir: sort.dir });
      if (ca || cb) return ca ? -1 : 1;
      return shared.get(a.key)! - shared.get(b.key)!;
    }
    const c =
      sort.by === "item" ? a.item_name.localeCompare(b.item_name) : a.source_name.localeCompare(b.source_name);
    if (c !== 0) return sort.dir === "asc" ? c : -c;
    return sort.by === "item"
      ? a.source_name.localeCompare(b.source_name)
      : a.item_name.localeCompare(b.item_name);
  });
}

function HeaderButton({
  label,
  column,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  column: ColumnSort;
  sort: CompareSort;
  onSort: (column: ColumnSort) => void;
  className?: string;
}) {
  const active = sort.by !== "shared" && columnId(sort) === columnId(column);
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 py-1 hover:text-parchment ${active ? "text-brass" : ""} ${className}`}
    >
      {label}
      <span aria-hidden className={active ? "" : "invisible"}>
        {active && sort.dir === "desc" ? "▼" : "▲"}
      </span>
    </button>
  );
}

/** A row where everyone who has the item logged it before tracking started. */
function isBacklogOnly(row: ComparisonRow) {
  return row.cells.every((c) => c === null || c.backfilled);
}

export default function ComparisonTable({
  players,
  rows: allRows,
}: {
  players: string[];
  rows: ComparisonRow[];
}) {
  const [showBacklog, setShowBacklog] = useState(false);
  const [showEstimates, setShowEstimates] = useState(false);
  const [sort, setSort] = useState<CompareSort>(DEFAULT_SORT);

  if (allRows.length === 0) {
    return <p className="text-sm text-parchment-dim">None of these players have logged drops yet.</p>;
  }

  const backlogCount = allRows.filter(isBacklogOnly).length;
  const hasEstimates = allRows.some((row) => row.cells.some((c) => c?.snapshot));
  const visible = showBacklog ? allRows : allRows.filter((row) => !isBacklogOnly(row));
  // As in LuckTable, backlogged cells sort by their snapshot even while
  // estimates are hidden, so the toggle never reorders rows.
  const sorted = sortRows(visible, sort);
  // Estimates never pick the luckiest player, so only the cells change.
  // Rows that mix backlogged and tracked cells stay when backlog is
  // hidden, and the disabled checkbox reads unchecked, so hide them there too.
  const rows = showEstimates && showBacklog
    ? sorted
    : sorted.map((row) => ({ ...row, cells: row.cells.map((c) => (c ? withoutEstimate(c) : c)) }));

  // Clicking the sorted column flips it; another column starts ascending
  // (A–Z, or luckiest first for a player).
  const sortBy = (column: ColumnSort) =>
    setSort((s) =>
      s.by !== "shared" && columnId(s) === columnId(column)
        ? { ...column, dir: s.dir === "asc" ? "desc" : "asc" }
        : { ...column, dir: "asc" },
    );
  const options = sortOptions(players);

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
        {/* Unlike LuckTable this stays on wide screens too: it's the only
            way back to the default order. */}
        {rows.length > 1 && (
          <label className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-parchment-dim">
            Sort
            <select
              value={sortId(sort)}
              onChange={(e) => setSort(options.find((o) => sortId(o.sort) === e.target.value)?.sort ?? DEFAULT_SORT)}
              className="max-w-[16rem] border border-panel-border bg-panel px-2 py-1.5 normal-case tracking-normal text-parchment"
            >
              {options.map((o) => (
                <option key={sortId(o.sort)} value={sortId(o.sort)}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-parchment-dim">
          Every drop here was logged before tracking started.
        </p>
      )}

      {/* Tablet / desktop: one column per player. If the columns still
          don't fit, the table scrolls sideways with the item column pinned. */}
      <div className={`hidden overflow-x-auto ${rows.length > 0 ? "md:block" : ""}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-panel-border text-left font-mono text-xs uppercase tracking-wide text-parchment-dim">
              <th className="sticky left-0 z-10 min-w-[11rem] bg-ink py-2 pr-4 font-normal">
                <HeaderButton label="Item" column={{ by: "item", dir: "asc" }} sort={sort} onSort={sortBy} className="uppercase tracking-wide" />
                <span aria-hidden className="mx-1">/</span>
                <HeaderButton label="Source" column={{ by: "source", dir: "asc" }} sort={sort} onSort={sortBy} className="uppercase tracking-wide" />
              </th>
              {players.map((name, index) => (
                <th
                  key={name}
                  className="min-w-[9rem] py-2 pl-3 pr-4 font-normal normal-case text-parchment"
                  aria-sort={
                    sort.by === "player" && sort.index === index
                      ? sort.dir === "asc" ? "ascending" : "descending"
                      : undefined
                  }
                >
                  <HeaderButton label={name} column={{ by: "player", index, dir: "asc" }} sort={sort} onSort={sortBy} />
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
                      <p className="mt-0.5 font-mono text-xs text-parchment-dim"><SourceLink source={row.source_name} /></p>
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
                <p className="mt-0.5 font-mono text-xs text-parchment-dim"><SourceLink source={row.source_name} /></p>
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
