import type { LuckResult } from "@/lib/types";
import LuckBar from "./LuckBar";
import ItemIcon from "./ItemIcon";

/** Flame-gradient border and glow, reserved for jackpot/spooned cards. */
export const HOT_CARD_CLASS =
  "border border-transparent bg-panel bg-clip-padding shadow-[0_0_30px_-8px_rgba(255,138,0,0.35)] [background-image:linear-gradient(#161F19,#161F19),linear-gradient(135deg,#F0D078,#FF8A00_60%,#C9A227)] [background-origin:border-box] [background-clip:padding-box,border-box]";

/** The crimson counterpart for the dry-streak card, matching the dry tone. */
export const DRY_CARD_CLASS =
  "border border-transparent bg-panel bg-clip-padding shadow-[0_0_30px_-8px_rgba(184,18,58,0.35)] [background-image:linear-gradient(#161F19,#161F19),linear-gradient(135deg,#E8607F,#B8123A_60%,#7A0C27)] [background-origin:border-box] [background-clip:padding-box,border-box]";

export default function SummaryCard({
  title,
  result,
  hot = false,
  dry = false,
}: {
  title: string;
  result: LuckResult | null;
  /** The one card allowed to show off — flame-gradient chrome border and
   * glow, reserved for the jackpot/spooned card per the design brief. */
  hot?: boolean;
  /** Crimson border and glow for the dry-streak card. */
  dry?: boolean;
}) {
  return (
    <div
      className={
        hot
          ? `relative p-5 ${HOT_CARD_CLASS}`
          : dry
            ? `relative p-5 ${DRY_CARD_CLASS}`
            : "relative border border-panel-border bg-panel p-5"
      }
    >
      {/* Ticket-stub notches, left and right */}
      <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink" />
      <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink" />

      <p
        className={
          hot
            ? "font-mono text-xs font-bold uppercase tracking-wide text-flame3"
            : dry
              ? "font-mono text-xs font-bold uppercase tracking-wide text-dry-bright"
              : "font-mono text-xs uppercase tracking-wide text-parchment-dim"
        }
      >
        {title}
      </p>

      {result ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <ItemIcon itemId={result.item_id} name={result.item_name ?? `Item #${result.item_id}`} size="lg" />
            <p className="text-xl font-medium text-parchment">
              {result.item_name ?? `Item #${result.item_id}`}
            </p>
          </div>
          <p className="mt-1 font-mono text-sm text-parchment-dim">
            {result.kc_received !== null ? `${result.kc_received.toLocaleString()} KC` : ""}
            {result.kc_received !== null ? " · " : ""}{result.source_name}
            {result.estimated ? " · estimated" : ""}
          </p>
          <div className="mt-4">
            <LuckBar probability={result.probability} label={result.label} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-parchment-dim">Not enough data yet.</p>
      )}
    </div>
  );
}
