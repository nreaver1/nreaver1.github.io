import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0D1410",
        panel: "#161F19",
        "panel-border": "#2B362E",
        parchment: "#EDE9DD",
        "parchment-dim": "#9CA598",
        brass: "#C9A227",
        "brass-bright": "#F0D078",
        flame1: "#FF2E63",
        flame2: "#FF8A00",
        flame3: "#FFD23F",
        dry: "#B8123A",
        "dry-bright": "#E8607F",
      },
      backgroundImage: {
        flame: "linear-gradient(100deg, #FF2E63, #FF8A00 55%, #FFD23F)",
      },
      fontFamily: {
        // "serif" carries the elegant-casino voice (headlines, item/prize
        // names). "mono" is the utility name every component already
        // uses for data/meta/label text — kept as the token name so
        // swapping the underlying typeface here doesn't require touching
        // every component's className, only this file + layout.tsx.
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
        mono: ["var(--font-oswald)", "ui-sans-serif", "sans-serif"],
      },
      maxWidth: {
        prose: "42rem",
      },
    },
  },
  plugins: [],
};

export default config;
