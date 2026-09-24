import type { LuckLabel } from "@/lib/types";

// Casino terminology throughout, per the design direction. Jackpot is the
// one state that keeps the loud, capitalized, flame-colored treatment —
// everything else stays quiet and sentence-case, matching the "hot rod as
// reward feedback, not wallpaper" principle: only the exciting moment
// gets to shout.
const LABEL_TEXT: Record<LuckLabel, string> = {
  spooned: "JACKPOT",
  average: "even money",
  dry: "dry streak",
  desert: "desert",
};

const LABEL_CLASS: Record<LuckLabel, string> = {
  spooned: "font-bold uppercase tracking-wide text-flame3",
  average: "text-parchment-dim",
  dry: "text-dry-bright",
  desert: "text-dry-bright",
};

export default function LuckBadge({ label }: { label: LuckLabel }) {
  return (
    <span className={`font-mono text-xs ${LABEL_CLASS[label]}`}>
      {LABEL_TEXT[label]}
    </span>
  );
}
