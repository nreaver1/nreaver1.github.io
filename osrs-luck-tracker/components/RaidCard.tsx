import type { RaidSummary } from "@/lib/types";
import LuckBar from "./LuckBar";
import LuckBadge from "./LuckBadge";
import SourceLink from "./SourceLink";

const MODE_LABELS: Record<string, string> = {
  entry: "Entry",
  normal: "Normal",
  expert: "Expert",
  challenge: "Challenge Mode",
  hard: "Hard Mode",
};
const MODE_ORDER = ["entry", "normal", "challenge", "hard", "expert"];

const oneDecimal = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const percent = (p: number) => `${(p * 100).toLocaleString(undefined, { maximumFractionDigits: p < 0.01 ? 2 : 1 })}%`;

function lastRaidLine(last: NonNullable<RaidSummary["last_raid"]>): string {
  const parts = [MODE_LABELS[last.mode] ?? last.mode];
  if (last.raid_level !== null) parts.push(`level ${last.raid_level}`);
  if (last.team_size !== null) parts.push(last.team_size === 1 ? "solo" : `team of ${last.team_size}`);
  if (last.personal_points !== null) parts.push(`${last.personal_points.toLocaleString()} points`);
  return parts.join(", ");
}

function lastRaidResult(last: NonNullable<RaidSummary["last_raid"]>): string | null {
  if (last.purple_mine) return "Purple!";
  if (last.purple) return "Purple for a teammate";
  if (last.purple === false) return "No purple";
  return null;
}

/**
 * A raid's completions by mode, and the purples from the raids the plugin
 * recorded against what a fair-luck player would expect from the same
 * raid levels and points.
 */
export default function RaidCard({ raid }: { raid: RaidSummary }) {
  const modes = MODE_ORDER.filter((m) => m in raid.mode_counts);
  const last = raid.last_raid;
  const result = last && lastRaidResult(last);

  return (
    <div className="border border-panel-border bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-lg font-medium text-parchment"><SourceLink source={raid.raid} /></p>
        <p className="font-mono text-xs tabular-nums text-parchment-dim">
          {raid.total.toLocaleString()} completions
        </p>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-parchment-dim">
        {modes.map((m) => (
          <li key={m}>
            <span className="uppercase tracking-wide">{MODE_LABELS[m] ?? m}</span>{" "}
            <span className="text-parchment">{(raid.mode_counts[m] ?? 0).toLocaleString()}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-xs">
          <span className="uppercase tracking-wide text-parchment-dim">Purples</span>
          {raid.tracked > 0 ? (
            <span className="tabular-nums text-parchment">
              {raid.purples} in {raid.tracked.toLocaleString()} tracked{" "}
              <span className="text-parchment-dim">({oneDecimal(raid.expected_purples)} expected)</span>
            </span>
          ) : (
            <span className="text-parchment-dim">
              {(raid.recorded ?? 0).toLocaleString()} raids recorded &middot; purple results not read yet
            </span>
          )}
        </div>
        {raid.probability !== null && raid.label !== null && (
          <div className="mt-1.5 flex items-center gap-3">
            <LuckBar
              probability={raid.probability}
              label={raid.label}
              description="of players would have more purples from these raids"
            />
            <LuckBadge probability={raid.probability} />
          </div>
        )}
      </div>

      {last && (
        <p className="mt-4 text-sm text-parchment-dim">
          Last raid: {lastRaidLine(last)}
          {last.unique_chance !== null && <> &middot; {percent(last.unique_chance)} purple chance</>}
          {result && (
            <>
              {" "}&middot;{" "}
              <span className={last.purple_mine ? "text-brass" : undefined}>{result}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
