"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_COMPARED, playerHref } from "@/lib/compare";

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
  const router = useRouter();
  const [ign, setIgn] = useState("");
  const compact = props.compact ?? false;
  const isCompare = props.mode === "compare";
  const full = isCompare && props.compared.length >= MAX_COMPARED;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = ign.trim();
    if (!trimmed || full) return;
    if (isCompare) {
      router.push(playerHref(props.primary, [...props.compared, trimmed]));
    } else {
      router.push(playerHref(trimmed));
    }
    setIgn("");
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
          compact ? "px-3 py-1.5 text-xs" : "px-6 py-3 text-sm"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
