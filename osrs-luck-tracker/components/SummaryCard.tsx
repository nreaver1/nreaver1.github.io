import type { LuckResult } from "@/lib/types";
import LuckBar from "./LuckBar";

export default function SummaryCard({
  title,
  result,
  hot = false,
}: {
  title: string;
  result: LuckResult | null;
  /** The one card allowed to show off — flame-gradient chrome border and
   * glow, reserved for the jackpot/spooned card per the design brief. */
  hot?: boolean;
}) {
  return (
    <div
      className={
        hot
          ? "relative border border-transparent bg-panel bg-clip-padding p-5 shadow-[0_0_30px_-8px_rgba(255,138,0,0.35)] [background-image:linear-gradient(#161F19,#161F19),linear-gradient(135deg,#F0D078,#FF8A00_60%,#C9A227)] [background-origin:border-box] [background-clip:padding-box,border-box]"
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
            : "font-mono text-xs uppercase tracking-wide text-parchment-dim"
        }
      >
        {title}
      </p>

      {result ? (
        <>
          <p className="mt-2 text-xl font-medium text-parchment">
            {result.item_name ?? `Item #${result.item_id}`}
          </p>
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
