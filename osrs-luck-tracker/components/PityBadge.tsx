/**
 * Marks a drop that came on the kill its pity timer guarantees it
 * (LuckResult.pity), e.g. Vorkath's head on the 50th kill.
 */
export default function PityBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Guaranteed by the pity timer on this kill"
      className={`inline-block border border-brass/60 px-1.5 py-px align-middle font-mono text-[0.65rem] font-normal uppercase leading-normal tracking-wide text-brass ${className}`}
    >
      Pity
    </span>
  );
}
