// Kill-count names (as the plugin's KillCountMessage parses them from
// "Your X kill count is: N") whose drop_rates source has a different name.
// Rates are stored per collection log page (data/clog_sources.json), so a
// page that covers several bosses or a reward chest needs a mapping here.
// Names that differ only by case, punctuation or a leading "The" already
// match without one.
export const KC_ALIASES: Record<string, string> = {
  "Dagannoth Rex": "Dagannoth Kings",
  "Dagannoth Prime": "Dagannoth Kings",
  "Dagannoth Supreme": "Dagannoth Kings",
  "Barrows chest": "Barrows Chests",
  "TzTok-Jad": "The Fight Caves",
  "TzKal-Zuk": "The Inferno",
  "Lunar Chest": "Moons of Peril",
  "Sol Heredit": "Fortis Colosseum",
  // The second boss of each wilderness pair has its own rates ("Artio").
  "Callisto": "Callisto and Artio",
  "Venenatis": "Venenatis and Spindel",
  "Vet'ion": "Vet'ion and Calvar'ion",
  "Royal Titan": "Royal Titans",
  "Branda the Fire Queen": "Royal Titans",
  "Eldric the Ice King": "Royal Titans",
};

// Same rule as the plugin's BackfillPlanner.normalize: ignore case,
// punctuation and a leading "The".
export function normalizeSource(name: string): string {
  return name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
}

/** The drop_rates source a kill-count name refers to, out of `sources`. */
export function matchSource(kcName: string, sources: string[]): string | undefined {
  const exact = sources.find((s) => s === kcName) ??
    sources.find((s) => normalizeSource(s) === normalizeSource(kcName));
  if (exact) return exact;
  const alias = Object.entries(KC_ALIASES)
    .find(([kc]) => normalizeSource(kc) === normalizeSource(kcName))?.[1];
  return alias === undefined ? undefined : sources.find((s) => s === alias);
}
