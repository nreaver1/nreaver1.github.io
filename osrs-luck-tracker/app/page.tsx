import SearchBar from "@/components/SearchBar";
import PlayerLink from "@/components/PlayerLink";
import { DEMO_IGNS } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <div className="pt-16 sm:pt-24">
      <h1 className="max-w-prose text-4xl font-medium leading-tight text-parchment sm:text-5xl">
        How <span className="flame-text">spooned</span> were you, really?
      </h1>
      <p className="mt-5 max-w-prose text-lg leading-relaxed text-parchment-dim">
        Search a player to see the exact kill count behind every logged
        drop, weighed against the house odds and every other player
        who's gotten it.
      </p>

      <div className="mt-10 max-w-xl">
        <SearchBar />
      </div>

      <p className="mt-6 font-mono text-xs text-parchment-dim">
        try{" "}
        {DEMO_IGNS.map((ign, i) => (
          <span key={ign}>
            {i > 0 && (i === DEMO_IGNS.length - 1 ? ", or " : ", ")}
            <PlayerLink
              href={`/player/${encodeURIComponent(ign)}`}
              className="text-brass underline underline-offset-4"
            >
              {ign}
            </PlayerLink>
          </span>
        ))}{" "}
        for demo profiles
      </p>
    </div>
  );
}
