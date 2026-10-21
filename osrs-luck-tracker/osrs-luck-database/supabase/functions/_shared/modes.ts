// Log pages whose header counts more than one mode ("Gauntlet
// completions" and "Corrupted Gauntlet completions"). Each mode is its own
// drop_rates source with its own rates (the `variants` in
// data/clog_sources.json), but they fill the same log slots, so an empty
// slot is one hunt across every mode. Still-hunting rows are stored per
// (item, mode) with that mode's count, and get-player-luck merges them
// (huntingLuckAcrossModes in calculations.ts).

// Page source -> the kill-count name of the page's own count, and its
// variant sources in log header order.
export const PAGE_MODES: Record<string, { base: string; variants: string[] }> = {
  "The Gauntlet": { base: "Gauntlet", variants: ["Corrupted Gauntlet"] },
  "The Nightmare": { base: "Nightmare", variants: ["Phosani's Nightmare"] },
  "Callisto and Artio": { base: "Callisto", variants: ["Artio"] },
  "Venenatis and Spindel": { base: "Venenatis", variants: ["Spindel"] },
  "Vet'ion and Calvar'ion": { base: "Vet'ion", variants: ["Calvar'ion"] },
};

const PAGE_OF_VARIANT = new Map(
  Object.entries(PAGE_MODES).flatMap(([page, m]) => m.variants.map((v) => [v, page] as const)),
);

/** The log page a source's slots are on: the page for a variant, else the source itself. */
export function pageOf(source: string): string {
  return PAGE_OF_VARIANT.get(source) ?? source;
}

/** Every source that fills the same log slots as `source`, the page's own first. */
export function siblingSources(source: string): string[] {
  const page = pageOf(source);
  return [page, ...(PAGE_MODES[page]?.variants ?? [])];
}

/** How a mode reads to a player: the kill-count name ("Gauntlet", "Corrupted Gauntlet"). */
export function modeName(source: string): string {
  return PAGE_MODES[source]?.base ?? source;
}
