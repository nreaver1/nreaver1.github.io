"use client";

import { useState } from "react";
import type { HuntingResult } from "@/lib/types";
import { luckTier, type LuckTier } from "@/lib/luck-tier";
import LuckBar from "./LuckBar";
import { TierText } from "./LuckBadge";
import ItemIcon from "./ItemIcon";

const HUNTING_DESCRIPTION = "of players would have had it by this KC";

const itemName = (h: HuntingResult) => h.item_name ?? `Item #${h.item_id}`;

// Not having a drop yet is never lucky, so the spooned tiers read as
// "still early" here; from even money up the usual tiers apply.
const STILL_EARLY: LuckTier = { text: "still early", tone: "even", range: "under 42%", max: 0.42, inclusive: false };

function HuntingBadge({ probability }: { probability: number }) {
  const tier = luckTier(probability);
  return <TierText tier={tier.tone === "jackpot" || tier.tone === "lucky" ? STILL_EARLY : tier} />;
}

// The flame fill is reserved for jackpots; a hunt that's barely started is plain brass.
const barLabel = (h: HuntingResult) => (h.label === "spooned" ? "average" : h.label);

function KcText({ h }: { h: HuntingResult }) {
  return <>{h.kc.toLocaleString()} KC, none yet</>;
}

type SortKey = "item" | "source" | "kc" | "chance";
type SortDir = "asc" | "desc";
interface Sort {
  key: SortKey;
  dir: SortDir;
}

const SORT_VALUE: Record<SortKey, (h: HuntingResult) => string | number> = {
  item: itemName,
  source: (h) => h.source_name,
  kc: (h) => h.kc,
  chance: (h) => h.probability,
};

// The direction a column starts in when first clicked: names A–Z, numbers biggest first.
const FIRST_DIR: Record<SortKey, SortDir> = {
  item: "asc",
  source: "asc",
  kc: "desc",
  chance: "desc",
};

const DEFAULT_SORT: Sort = { key: "chance", dir: "desc" }; // driest first

function sortHunting(hunting: HuntingResult[], { key, dir }: Sort) {
  const value = SORT_VALUE[key];
  return [...hunting].sort((ha, hb) => {
    const a = value(ha);
    const b = value(hb);
    const c = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : (a as number) - (b as number);
    if (c !== 0) return dir === "asc" ? c : -c;
    // Then by item and source, for a stable order.
    return itemName(ha).localeCompare(itemName(hb)) || ha.source_name.localeCompare(hb.source_name);
  });
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "item", label: "Item" },
  { key: "source", label: "Source" },
  { key: "kc", label: "So far" },
  { key: "chance", label: "Would have it by now" },
];

// Phone cards have no header row, so they get a dropdown instead.
const MOBILE_SORTS: { sort: Sort; label: string }[] = [
  { sort: { key: "chance", dir: "desc" }, label: "Driest first" },
  { sort: { key: "chance", dir: "asc" }, label: "Earliest first" },
  { sort: { key: "kc", dir: "desc" }, label: "Most KC" },
  { sort: { key: "kc", dir: "asc" }, label: "Least KC" },
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

/**
 * Items the player's collection log shows they don't have yet, with the
 * chance a fair player would have had the drop by now. Driest first by
 * default, and sortable by any column like the drop table.
 */
export default function HuntingTable({ hunting: allHunting }: { hunting: HuntingResult[] }) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);

  if (allHunting.length === 0) return null;

  const hunting = sortHunting(allHunting, sort);

  // Clicking the sorted column flips it; another column starts in its own direction.
  const sortBy = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_DIR[key] },
    );

  return (
    <div>
      {hunting.length > 1 && (
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

      {/* Desktop / tablet */}
      <table className="hidden w-full border-collapse text-sm sm:table">
        <thead>
          <tr className="border-b border-panel-border text-left font-mono text-xs uppercase tracking-wide text-parchment-dim">
            {COLUMNS.map((c) => (
              <SortHeader key={c.key} column={c} sort={sort} onSort={sortBy} />
            ))}
          </tr>
        </thead>
        <tbody>
          {hunting.map((h) => (
            <tr key={`${h.item_id}-${h.source_name}`} className="border-b border-panel-border/60">
              <td className="py-2 pr-4 text-parchment">
                <span className="flex items-center gap-3">
                  <ItemIcon itemId={h.item_id} name={itemName(h)} />
                  {itemName(h)}
                </span>
              </td>
              <td className="py-3 pr-4 text-parchment-dim">{h.source_name}</td>
              <td className="whitespace-nowrap py-3 pr-4 font-mono tabular-nums text-parchment-dim">
                <KcText h={h} />
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  <LuckBar probability={h.probability} label={barLabel(h)} description={HUNTING_DESCRIPTION} />
                  <HuntingBadge probability={h.probability} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: stacked cards, like the drop table */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {hunting.map((h) => (
          <li key={`${h.item_id}-${h.source_name}`} className="border border-panel-border bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <ItemIcon itemId={h.item_id} name={itemName(h)} />
              <div className="min-w-0 flex-1">
                <p className="text-parchment">{itemName(h)}</p>
                <p className="mt-0.5 font-mono text-xs text-parchment-dim">
                  {h.source_name} · <KcText h={h} />
                </p>
              </div>
              <HuntingBadge probability={h.probability} />
            </div>
            <div className="mt-3">
              <LuckBar probability={h.probability} label={barLabel(h)} description={HUNTING_DESCRIPTION} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
