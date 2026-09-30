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

/**
 * Checkbox for the KC snapshot estimates on backlogged items. Disabled
 * (and shown unchecked) while backlogged items are hidden, since there's
 * nothing for it to act on then.
 */
export function EstimatesToggle({
  shown,
  disabled,
  onChange,
}: {
  shown: boolean;
  disabled: boolean;
  onChange: (shown: boolean) => void;
}) {
  return (
    <label
      className={`mb-4 inline-flex items-center gap-2 py-1 font-mono text-xs uppercase tracking-wide text-parchment-dim ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:text-parchment"
      }`}
      title="Backlogged items' luck estimated from the count on their collection log page."
    >
      <input
        type="checkbox"
        checked={shown && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brass disabled:cursor-not-allowed"
      />
      Show luck estimates
    </label>
  );
}

/** A result without its KC snapshot, for when estimates are hidden. */
export function withoutEstimate<T extends { snapshot?: unknown }>(r: T): T {
  if (r.snapshot === undefined) return r;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { snapshot, ...rest } = r;
  return rest as T;
}
