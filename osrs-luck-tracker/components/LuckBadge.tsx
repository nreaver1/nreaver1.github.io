import { luckTier, type LuckTier, type LuckTone } from "@/lib/luck-tier";

// Casino terminology throughout, per the design direction. Jackpot is the
// one state that keeps the loud, capitalized, flame-colored treatment —
// everything else stays quiet and sentence-case, matching the "hot rod as
// reward feedback, not wallpaper" principle: only the exciting moment
// gets to shout. The lucky and unlucky tiers in between take a softer
// version of their side's colour.
const TONE_CLASS: Record<LuckTone, string> = {
  jackpot: "font-bold uppercase tracking-wide text-flame3",
  lucky: "text-brass-bright",
  even: "text-parchment-dim",
  unlucky: "text-dry-bright/75",
  dry: "text-dry-bright",
};

/** A tier's text in its colour; the legend uses this directly. */
export function TierText({ tier }: { tier: LuckTier }) {
  return <span className={`font-mono text-xs ${TONE_CLASS[tier.tone]}`}>{tier.text}</span>;
}

export default function LuckBadge({ probability }: { probability: number }) {
  return <TierText tier={luckTier(probability)} />;
}
