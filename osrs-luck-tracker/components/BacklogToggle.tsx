/**
 * Checkbox for showing items imported from the collection log (logged
 * before tracking started, so their luck is unknown). Only rendered when
 * there's at least one such item.
 */
export default function BacklogToggle({
  shown,
  count,
  onChange,
}: {
  shown: boolean;
  count: number;
  onChange: (shown: boolean) => void;
}) {
  return (
    <label
      className="mb-4 inline-flex cursor-pointer items-center gap-2 py-1 font-mono text-xs uppercase tracking-wide text-parchment-dim hover:text-parchment"
      title="Items logged before tracking started. Their luck is unknown."
    >
      <input
        type="checkbox"
        checked={shown}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brass"
      />
      Show backlogged items ({count.toLocaleString()})
    </label>
  );
}
