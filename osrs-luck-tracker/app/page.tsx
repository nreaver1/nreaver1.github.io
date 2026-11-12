import Image from "next/image";
import Link from "next/link";
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
        who&rsquo;s gotten it.
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
        for demo profiles, or see the{" "}
        <Link href="/leaderboard" className="text-brass underline underline-offset-4">
          luckiest and driest players
        </Link>
      </p>

      <section className="mt-20 flex flex-col gap-8 border border-panel-border bg-panel p-6 sm:flex-row sm:items-start sm:gap-10 sm:p-8">
        <div className="max-w-prose">
          <p className="font-mono text-xs uppercase tracking-widest text-brass">
            The RuneLite plugin
          </p>
          <h2 className="mt-3 font-serif text-2xl font-medium text-parchment">
            Track your own luck
          </h2>
          <p className="mt-4 leading-relaxed text-parchment-dim">
            Every profile here comes from the Clog Casino plugin. It notes the
            kill count of each new boss and raid drop, rates it in chat and in
            its side panel, imports the log you already have, and shows how
            overdue the slots you&rsquo;re still missing are. Your profile
            only appears on this site if you turn it on.
          </p>
          <p className="mt-4 leading-relaxed text-parchment-dim">
            To install it, open RuneLite&rsquo;s Plugin Hub and search for{" "}
            <span className="text-parchment">Clog Casino</span>.
          </p>
          <a
            href="https://github.com/nreaver1/osrs-luck-tracker-plugin"
            className="mt-5 inline-block font-mono text-xs text-brass underline underline-offset-4"
          >
            plugin source and docs
          </a>
        </div>
        <Image
          src="/side-panel.png"
          alt="The Clog Casino side panel in RuneLite, showing overall luck, the luckiest and driest drops, and the items still being hunted at each boss"
          width={235}
          height={706}
          unoptimized
          className="mx-auto shrink-0 border border-panel-border sm:mx-0"
        />
      </section>
    </div>
  );
}
