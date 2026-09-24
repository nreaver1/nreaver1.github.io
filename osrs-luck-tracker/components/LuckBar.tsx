import type { LuckLabel } from "@/lib/types";

const LABEL_FILL_CLASS: Record<LuckLabel, string> = {
  spooned: "bg-flame",
  average: "bg-brass",
  dry: "bg-dry",
  desert: "bg-dry",
};

export default function LuckBar({
  probability,
  label,
}: {
  probability: number;
  label: LuckLabel;
}) {
  const pct = Math.round(probability * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 w-24 shrink-0 bg-panel-border sm:w-32"
        role="img"
        aria-label={`${pct}% likely to have taken this long or less`}
      >
        <div
          className={`h-full ${LABEL_FILL_CLASS[label]}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="font-mono text-sm tabular-nums text-parchment-dim">
        {pct}%
      </span>
    </div>
  );
}
