import type { HuntingResult } from "@/lib/types";
import { luckTier, type LuckTier } from "@/lib/luck-tier";
import LuckBar from "./LuckBar";
import { TierText } from "./LuckBadge";
import ItemIcon from "./ItemIcon";
import SourceLink from "./SourceLink";

const HUNTING_DESCRIPTION = "of players would have had it by this KC";

const itemName = (h: HuntingResult) => h.item_name ?? `Item #${h.item_id}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

// Not having a drop yet is never lucky, so the spooned tiers read as
// "still early" here; from even money up the usual tiers apply.
const STILL_EARLY: LuckTier = { text: "still early", tone: "even", range: "under 42%", max: 0.42, inclusive: false };

function HuntingBadge({ probability }: { probability: number }) {
  const tier = luckTier(probability);
  return <TierText tier={tier.tone === "jackpot" || tier.tone === "lucky" ? STILL_EARLY : tier} />;
}

// The flame fill is reserved for jackpots; a hunt that's barely started is plain brass.
const barLabel = (h: HuntingResult) => (h.label === "spooned" ? "average" : h.label);

interface Group {
  source_name: string;
  kc: number;
  updated_at: string;
  /** Driest first: the most common drop still missing leads. */
  items: HuntingResult[];
}

/**
 * One group per source, the most recently raised kill count first (the
 * bosses played lately on top), then the most kills. Every row from a
 * source shares its page's kill count, so the group shows it once.
 */
export function groupHunting(hunting: HuntingResult[]): Group[] {
  const bySource = new Map<string, Group>();
  for (const h of hunting) {
    const group = bySource.get(h.source_name);
    if (!group) {
      bySource.set(h.source_name, { source_name: h.source_name, kc: h.kc, updated_at: h.updated_at ?? "", items: [h] });
      continue;
    }
    group.items.push(h);
    group.kc = Math.max(group.kc, h.kc);
    if ((h.updated_at ?? "") > group.updated_at) group.updated_at = h.updated_at ?? "";
  }
  const groups = [...bySource.values()];
  for (const g of groups) {
    g.items.sort((a, b) => b.probability - a.probability || itemName(a).localeCompare(itemName(b)));
  }
  return groups.sort(
    (a, b) => b.updated_at.localeCompare(a.updated_at) || b.kc - a.kc || a.source_name.localeCompare(b.source_name),
  );
}

function HuntingCard({ group }: { group: Group }) {
  const [lead, ...rest] = group.items;
  return (
    <div className="border border-panel-border bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-lg font-medium text-parchment"><SourceLink source={group.source_name} /></p>
        <p className="font-mono text-xs tabular-nums text-parchment-dim">
          {group.kc.toLocaleString()} KC &middot; {group.items.length} missing
        </p>
      </div>

      {/* The most overdue drop, with its bar, stands for the page. */}
      <div className="mt-4">
        <div className="flex items-center gap-2 text-sm text-parchment">
          <ItemIcon itemId={lead.item_id} name={itemName(lead)} />
          <span className="min-w-0 truncate">{itemName(lead)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <LuckBar probability={lead.probability} label={barLabel(lead)} description={HUNTING_DESCRIPTION} />
          <HuntingBadge probability={lead.probability} />
        </div>
      </div>

      {rest.length > 0 && (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none py-1 font-mono text-xs uppercase tracking-wide text-parchment-dim hover:text-parchment">
            <span className="text-brass group-open:hidden">&#9656;</span>
            <span className="hidden text-brass group-open:inline">&#9662;</span> {rest.length} more still missing
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {rest.map((h) => (
              <li key={h.item_id} className="flex items-center gap-2">
                <ItemIcon itemId={h.item_id} name={itemName(h)} />
                <span className="min-w-0 flex-1 truncate text-parchment-dim">{itemName(h)}</span>
                <span
                  className="font-mono text-xs tabular-nums text-parchment-dim"
                  aria-label={`${pct(h.probability)} ${HUNTING_DESCRIPTION}`}
                >
                  {pct(h.probability)}
                </span>
                <span className="w-24 shrink-0 text-right">
                  <HuntingBadge probability={h.probability} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Items the player's collection log shows they don't have yet, grouped
 * by boss like the pool cards: each card leads with the drop a fair
 * player would most likely have had by now, and the rest fold away.
 */
export default function HuntingGroups({ hunting }: { hunting: HuntingResult[] }) {
  if (hunting.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groupHunting(hunting).map((group) => (
        <HuntingCard key={group.source_name} group={group} />
      ))}
    </div>
  );
}
