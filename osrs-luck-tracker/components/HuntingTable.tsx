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

/**
 * Items the player's collection log shows they don't have yet, with the
 * chance a fair player would have had the drop by now. The API sends them
 * driest first, which is the order worth reading.
 */
export default function HuntingTable({ hunting }: { hunting: HuntingResult[] }) {
  if (hunting.length === 0) return null;

  return (
    <div>
      {/* Desktop / tablet */}
      <table className="hidden w-full border-collapse text-sm sm:table">
        <thead>
          <tr className="border-b border-panel-border text-left font-mono text-xs uppercase tracking-wide text-parchment-dim">
            <th className="py-3 pr-4 font-normal">Item</th>
            <th className="py-3 pr-4 font-normal">Source</th>
            <th className="py-3 pr-4 font-normal">So far</th>
            <th className="py-3 pr-4 font-normal">Would have it by now</th>
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
