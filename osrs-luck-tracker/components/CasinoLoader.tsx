"use client";

import { useEffect, useRef, useState } from "react";

// Full-screen loading overlay. Each load shows the next game in LOADERS,
// and a long load keeps cycling through them. The keyframes live in
// globals.css; reduced-motion users get a still frame of each.

const CYCLE_MS = 2600;

const LOADERS = [
  { caption: "Rolling the dice", Game: Dice },
  { caption: "Shuffling the deck", Game: Cards },
  { caption: "Spinning the reels", Game: Slots },
];

// Module-level so consecutive loads rotate even though the overlay unmounts.
let nextLoader = 0;

export default function CasinoLoader({ active }: { active: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  // Advance once per load, even when React re-runs the effect (Strict Mode).
  const started = useRef(false);

  useEffect(() => {
    if (!active) {
      started.current = false;
      return;
    }
    if (!started.current) {
      started.current = true;
      setIndex(nextLoader++ % LOADERS.length);
    }
    const timer = setInterval(() => setIndex(nextLoader++ % LOADERS.length), CYCLE_MS);
    return () => clearInterval(timer);
  }, [active]);

  const loader = LOADERS[index ?? 0];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!active}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-ink/90 backdrop-blur-sm transition-opacity duration-300 ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {active && index !== null && (
        <>
          <div key={index} className="flex h-32 items-center justify-center">
            <loader.Game />
          </div>
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-brass">
            {loader.caption}
            <span className="loader-ellipsis" aria-hidden />
          </p>
        </>
      )}
      {active && <span className="sr-only">Loading</span>}
    </div>
  );
}

// --- Dice: two dice tumbling, their faces flickering while they roll ---

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Dice() {
  const [faces, setFaces] = useState([5, 2]);
  useEffect(() => {
    const timer = setInterval(
      () => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]),
      140,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex gap-6">
      {faces.map((face, i) => (
        <div
          key={i}
          className="dice-tumble grid h-16 w-16 grid-cols-3 grid-rows-3 gap-1 rounded-xl border-2 border-brass bg-parchment p-2 shadow-[0_6px_18px_rgba(0,0,0,0.5)]"
          style={{ animationDelay: `${i * -0.35}s` }}
        >
          {Array.from({ length: 9 }, (_, cell) => (
            <span
              key={cell}
              className={`m-auto h-2.5 w-2.5 rounded-full ${PIPS[face].includes(cell) ? (face === 1 ? "bg-flame1" : "bg-ink") : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// --- Cards: a small deck riffling, cards peeling off and back on top ---

const CARDS = [
  { rank: "A", suit: "♠", red: false },
  { rank: "K", suit: "♥", red: true },
  { rank: "Q", suit: "♣", red: false },
  { rank: "J", suit: "♦", red: true },
  { rank: "10", suit: "♠", red: false },
];

function Cards() {
  return (
    <div className="relative h-24 w-16">
      {CARDS.map((card, i) => (
        <div
          key={i}
          className={`card-shuffle absolute inset-0 flex flex-col justify-between rounded-md border border-panel-border bg-parchment p-1.5 font-mono text-sm leading-none shadow-[0_4px_12px_rgba(0,0,0,0.45)] ${
            card.red ? "text-dry" : "text-ink"
          }`}
          style={{ animationDelay: `${i * 0.24}s` }}
        >
          <span>
            {card.rank}
            <br />
            {card.suit}
          </span>
          <span className="self-center text-2xl">{card.suit}</span>
          <span className="rotate-180">
            {card.rank}
            <br />
            {card.suit}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Slots: three reels spinning at different speeds behind a brass frame ---

const SYMBOLS = [
  { glyph: "7", className: "flame-text not-italic" },
  { glyph: "★", className: "text-brass-bright" },
  { glyph: "♦", className: "text-dry-bright" },
  { glyph: "BAR", className: "text-parchment text-base tracking-wider" },
  { glyph: "♣", className: "text-parchment-dim" },
];

function Slots() {
  return (
    <div className="flex gap-1.5 rounded-lg border-2 border-brass bg-panel p-2 shadow-[0_0_24px_rgba(201,162,39,0.25)]">
      {[0, 1, 2].map((reel) => (
        <div key={reel} className="relative h-16 w-14 overflow-hidden rounded bg-ink">
          <div
            className="slot-reel flex flex-col"
            style={{ animationDuration: `${0.45 + reel * 0.12}s`, animationDelay: `${reel * -0.2}s` }}
          >
            {/* The strip repeats once so the loop is seamless. */}
            {[...SYMBOLS, ...SYMBOLS].map((s, i) => (
              <span key={i} className={`flex h-16 items-center justify-center font-mono text-3xl ${s.className}`}>
                {s.glyph}
              </span>
            ))}
          </div>
          {/* Glass: darken the top and bottom edge like a curved reel. */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(13,20,16,0.85),transparent_30%,transparent_70%,rgba(13,20,16,0.85))]" />
        </div>
      ))}
    </div>
  );
}
