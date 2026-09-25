// A finer read of a luck percentage than the API's four labels, for display.
// `probability` is the chance of having the drop by this KC, so low is lucky.
//
// Each tier sits inside one of the backend's labels (labelFor in
// osrs-luck-database/supabase/functions/_shared/calculations.ts: spooned
// < 10%, dry > 80%, desert > 99%), so a tier's text never disagrees with
// the label's bar colour.

export type LuckTone = "jackpot" | "lucky" | "even" | "unlucky" | "dry";

export interface LuckTier {
  text: string;
  tone: LuckTone;
  /** The range this tier covers, as the legend shows it. */
  range: string;
  /** Upper bound; `inclusive` says whether a probability equal to it belongs here. */
  max: number;
  inclusive: boolean;
}

// In order. The legend (components/LuckScale.tsx) renders this list, so it
// always matches what the badges say.
export const LUCK_TIERS: LuckTier[] = [
  { text: "MEGA JACKPOT", tone: "jackpot", range: "under 1%", max: 0.01, inclusive: false },
  { text: "JACKPOT", tone: "jackpot", range: "1–10%", max: 0.1, inclusive: false },
  { text: "pretty spooned", tone: "lucky", range: "10–25%", max: 0.25, inclusive: false },
  { text: "a little spooned", tone: "lucky", range: "25–42%", max: 0.42, inclusive: false },
  { text: "even money", tone: "even", range: "42–58%", max: 0.58, inclusive: true },
  { text: "a little unlucky", tone: "unlucky", range: "58–70%", max: 0.7, inclusive: true },
  { text: "pretty unlucky", tone: "unlucky", range: "70–80%", max: 0.8, inclusive: true },
  { text: "dry streak", tone: "dry", range: "80–95%", max: 0.95, inclusive: true },
  { text: "bone dry", tone: "dry", range: "95–99%", max: 0.99, inclusive: true },
  { text: "desert", tone: "dry", range: "over 99%", max: Infinity, inclusive: true },
];

export function luckTier(probability: number): LuckTier {
  return (
    LUCK_TIERS.find((t) => probability < t.max || (t.inclusive && probability === t.max)) ??
    LUCK_TIERS[LUCK_TIERS.length - 1]
  );
}
