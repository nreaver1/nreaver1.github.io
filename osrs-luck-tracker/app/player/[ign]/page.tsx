import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerLuck } from "@/lib/api";
import { buildComparisonRows, parseCompared, playerHref } from "@/lib/compare";
import type { PlayerLuckResponse } from "@/lib/types";
import SummaryCard from "@/components/SummaryCard";
import LuckTable from "@/components/LuckTable";
import SearchBar from "@/components/SearchBar";
import CompareCard from "@/components/CompareCard";
import ComparisonTable from "@/components/ComparisonTable";

type Compared =
  | { name: string; status: "ok"; data: PlayerLuckResponse }
  | { name: string; status: "not-found" | "error" };

// A compared player who's missing or whose lookup fails shouldn't take
// down the whole page — only the primary player decides 404 / error.
async function loadCompared(name: string): Promise<Compared> {
  try {
    const data = await getPlayerLuck(name);
    return data ? { name, status: "ok", data } : { name, status: "not-found" };
  } catch {
    return { name, status: "error" };
  }
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  // Typed as Promises so this works on both Next.js 14 (plain objects —
  // `await`ing a non-Promise just resolves to itself) and 15+ (real
  // Promises that must be awaited).
  params: Promise<{ ign: string }>;
  searchParams: Promise<{ vs?: string | string[] }>;
}) {
  const { ign: rawIgn } = await params;
  const ign = decodeURIComponent(rawIgn);
  const compared = parseCompared((await searchParams).vs, ign);

  const [data, others] = await Promise.all([
    getPlayerLuck(ign),
    Promise.all(compared.map(loadCompared)),
  ]);

  if (!data) {
    notFound();
  }

  const found = others.filter((o): o is Extract<Compared, { status: "ok" }> => o.status === "ok");
  const missing = others.filter((o) => o.status !== "ok");

  // Links always rebuild from the requested names (not only the ones
  // found), so removing one player never silently drops another.
  const without = (name: string) => compared.filter((n) => n !== name);

  const compareBar = (
    <div className="max-w-md">
      <SearchBar mode="compare" primary={ign} compared={compared} />
    </div>
  );

  const missingNotice = missing.length > 0 && (
    <ul className="mt-4 flex flex-col gap-1 font-mono text-xs text-parchment-dim">
      {missing.map((m) => (
        <li key={m.name}>
          {m.status === "not-found"
            ? `No player logged as "${m.name}".`
            : `Couldn't load "${m.name}" right now.`}{" "}
          <Link
            href={playerHref(ign, without(m.name))}
            className="inline-block py-1 text-brass underline underline-offset-4"
          >
            Remove
          </Link>
        </li>
      ))}
    </ul>
  );

  if (found.length === 0) {
    return (
      <div className="pt-12">
        <h1 className="text-3xl font-medium text-parchment sm:text-4xl">
          {data.ign}'s luck
        </h1>

        <div className="mt-6">{compareBar}</div>
        {missingNotice}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <SummaryCard title="Jackpot" result={data.mostSpooned} hot />
          <SummaryCard title="Dry streak" result={data.driest} />
        </div>

        <div className="mt-10">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-wide text-parchment-dim">
            Every logged drop
          </h2>
          <LuckTable results={data.results} />
        </div>
      </div>
    );
  }

  const players = [data, ...found.map((f) => f.data)];
  const rows = buildComparisonRows(players);

  return (
    <div className="page-grid-nested pt-8 sm:pt-12">
      <h1 className="break-words text-2xl font-medium text-parchment sm:text-4xl">
        {players.map((p, i) => (
          <span key={p.ign}>
            {i > 0 && <span className="font-mono text-base text-parchment-dim sm:text-lg"> vs </span>}
            {p.ign}
          </span>
        ))}
      </h1>

      <div className="mt-6">{compareBar}</div>
      {missingNotice}

      {/* Phones: a swipeable strip of cards bleeding to the screen edge, so
          five players don't push the table several screens down. Larger
          screens: a grid that fits as many cards per row as there's room for. */}
      <ul
        aria-label="Players"
        className="breakout-wide no-scrollbar -mx-5 mt-8 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0"
      >
        <li className="w-[78%] max-w-[18rem] shrink-0 snap-start sm:w-auto sm:max-w-none">
          <CompareCard
            player={data}
            soloHref={playerHref(data.ign)}
            // Removing the primary promotes the first compared player who
            // was actually found, keeping everyone else.
            removeHref={playerHref(found[0].name, without(found[0].name))}
          />
        </li>
        {found.map((f) => (
          <li key={f.name} className="w-[78%] max-w-[18rem] shrink-0 snap-start sm:w-auto sm:max-w-none">
            <CompareCard
              player={f.data}
              soloHref={playerHref(f.data.ign)}
              removeHref={playerHref(ign, without(f.name))}
            />
          </li>
        ))}
      </ul>

      <div className="breakout-wide mt-10">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wide text-parchment-dim">
          Drop by drop
        </h2>
        <ComparisonTable players={players.map((p) => p.ign)} rows={rows} />
      </div>
    </div>
  );
}
