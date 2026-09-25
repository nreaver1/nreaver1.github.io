import SearchBar from "@/components/SearchBar";
import PlayerLink from "@/components/PlayerLink";

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
        <PlayerLink href="/player/Zezima" className="text-brass underline underline-offset-4">
          Zezima
        </PlayerLink>
        ,{" "}
        <PlayerLink href="/player/Newscape" className="text-brass underline underline-offset-4">
          Newscape
        </PlayerLink>
        , or{" "}
        <PlayerLink href="/player/EmptyLogs" className="text-brass underline underline-offset-4">
          EmptyLogs
        </PlayerLink>{" "}
        for demo profiles
      </p>
    </div>
  );
}
