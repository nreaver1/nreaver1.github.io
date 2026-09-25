import { LUCK_TIERS } from "@/lib/luck-tier";
import { TierText } from "./LuckBadge";

/**
 * Collapsible key to the luck wording. A native <details>, so it opens
 * and closes by keyboard and screen reader without any JavaScript.
 */
export default function LuckScale() {
  return (
    <details className="group border border-panel-border bg-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-mono text-xs uppercase tracking-wide text-parchment-dim hover:text-brass [&::-webkit-details-marker]:hidden">
        How to read the odds
        <span aria-hidden="true" className="text-base leading-none text-brass transition-transform group-open:rotate-180">
          &#9662;
        </span>
      </summary>
      <div className="border-t border-panel-border px-4 pb-4 pt-3">
        <p className="text-sm leading-relaxed text-parchment-dim">
          The percentage is the chance you&apos;d have had the drop by the kill count you got it.
          Lower means luckier: 10% means 9 in 10 players would still be waiting.
          <span className="font-mono text-xs"> est.</span> marks rates that depend on raid points
          or a pity timer, so they&apos;re approximate.
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-1.5">
          {LUCK_TIERS.map((tier) => (
            <div key={tier.text} className="contents">
              <dt className="font-mono text-xs tabular-nums text-parchment-dim">{tier.range}</dt>
              <dd>
                <TierText tier={tier} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
