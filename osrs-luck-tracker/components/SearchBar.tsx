"use client";

import { useState } from "react";
import { MAX_COMPARED, playerHref } from "@/lib/compare";
import { useCasinoNavigate } from "./NavigationProvider";

// The lever bottoms out 40% into its 0.75s pull (see .lever-pull in
// globals.css); that's when the reels start, i.e. when we navigate.
const LEVER_BOTTOM_MS = 300;

type Props =
  | {
      /** Go to the searched player's page. */
      mode?: "go";
      compact?: boolean;
    }
  | {
      /** Add the searched player to the comparison on `primary`'s page. */
      mode: "compare";
      primary: string;
      compared: string[];
      compact?: boolean;
    };

export default function SearchBar(props: Props) {
  const navigate = useCasinoNavigate();
  const [ign, setIgn] = useState("");
  // Bumped on every submit; keying the lever on it restarts the pull.
  const [pulls, setPulls] = useState(0);
  const compact = props.compact ?? false;
  const isCompare = props.mode === "compare";
  const full = isCompare && props.compared.length >= MAX_COMPARED;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = ign.trim();
    if (!trimmed || full) return;
    const href = isCompare
      ? playerHref(props.primary, [...props.compared, trimmed])
      : playerHref(trimmed);
    setIgn("");
    setPulls((n) => n + 1);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => navigate(href), reduceMotion ? 0 : LEVER_BOTTOM_MS);
  }

  const placeholder = full
    ? `Comparing the max of ${MAX_COMPARED + 1} players`
    : isCompare
      ? "Add a player to compare"
      : "Enter an IGN";
  const label = isCompare ? "Compare" : compact ? "Search" : "Check odds";

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className={compact ? "flex gap-2" : "flex flex-col gap-3 sm:flex-row sm:gap-2"}
    >
      <input
        type="text"
        value={ign}
        onChange={(e) => setIgn(e.target.value)}
        placeholder={placeholder}
        disabled={full}
        // Names aren't words: stop phone keyboards capitalizing or
        // "correcting" them, and label the return key as search.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        aria-label={isCompare ? "Player to add to the comparison" : "Player display name"}
        className={`w-full min-w-0 rounded-none border border-panel-border bg-panel font-mono text-parchment placeholder:text-parchment-dim/70 focus:border-brass disabled:opacity-60 ${
          // Under 16px, iOS Safari zooms the page in when the field is focused.
          compact ? "px-3 py-1.5 text-base" : "px-4 py-3 text-base"
        }`}
      />
      <button
        type="submit"
        disabled={full}
        className={`group relative whitespace-nowrap border border-brass bg-brass font-mono text-ink transition-colors hover:border-flame2 hover:bg-flame hover:text-[#2A0E00] hover:shadow-[0_0_18px_1px_rgba(255,138,0,0.45)] disabled:pointer-events-none disabled:opacity-60 ${
          compact ? "mr-4 px-3 py-1.5 text-xs" : "mr-6 px-6 py-3 text-sm"
        }`}
      >
        {label}
        <Lever key={pulls} pulling={pulls > 0} compact={compact} />
      </button>
    </form>
  );
}

/**
 * A slot machine lever bolted to the right side of the button. It's inside
 * the button, so clicking the lever itself submits too.
 */
function Lever({ pulling, compact }: { pulling: boolean; compact: boolean }) {
  // Rod length from the pivot (the button's vertical middle) to the knob.
  const rod = compact ? 15 : 24;
  const knob = compact ? 9 : 13;
  return (
    <span
      aria-hidden
      className={`absolute left-full top-0 h-full ${compact ? "w-4" : "w-6"} ${pulling ? "lever-pull" : ""}`}
      style={{ "--rod": `${rod}px` } as React.CSSProperties}
    >
      {/* Mounting plate against the cabinet. */}
      <span className="absolute left-0 top-1/2 h-3/5 w-1.5 -translate-y-1/2 rounded-r-sm bg-[#8A6E17]" />
      {/* Rod, pivoting at the button's vertical middle. */}
      <span
        className="lever-rod absolute left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#8C8C8C] via-[#F2F2F2] to-[#8C8C8C]"
        style={{ bottom: "50%", height: rod }}
      />
      {/* Ball knob on the rod's tip. */}
      <span
        className="lever-knob absolute left-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#FF8FA8,#FF2E63_45%,#8A0F2E)] shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
        style={{
          width: knob,
          height: knob,
          marginLeft: -knob / 2,
          bottom: `calc(50% + ${rod - knob / 2}px)`,
        }}
      />
      {/* Pivot cap, drawn over the rod's base. */}
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5E4B10] ring-1 ring-brass" />
    </span>
  );
}
