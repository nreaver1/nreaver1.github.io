import type { Metadata } from "next";
import { getLeaderboard } from "@/lib/api";
import LeaderboardList from "@/components/LeaderboardList";
import LuckScale from "@/components/LuckScale";
import DemoBadge from "@/components/DemoBadge";

export const metadata: Metadata = {
  title: "Leaderboard · OSRS Luck Tracker",
  description: "The luckiest and driest players across every tracked collection log drop.",
};

export default async function LeaderboardPage() {
  const board = await getLeaderboard();

  return (
    <div className="page-grid-nested pt-12">
      <h1 className="text-3xl font-medium text-parchment sm:text-4xl">
        Who the house <span className="flame-text">loves</span>, and who it doesn&rsquo;t
      </h1>

      {board ? (
        <>
          <p className="mt-4 max-w-prose text-parchment-dim">
            Players ranked by their average luck across every drop with a
            known rate: the chance they&rsquo;d have had it by that kill
            count, averaged. Fair luck averages out near 50%, so lower is
            luckier. Players need at least {board.min_rated_drops} rated drops to rank.
          </p>
          {[...board.luckiest, ...board.driest].some((e) => e.demo) && (
            <p className="mt-3 max-w-prose font-mono text-xs text-parchment-dim">
              Players marked <DemoBadge /> are sample accounts with made-up
              drops, here so you can try the site.
            </p>
          )}

          <div className="breakout-wide mt-10 grid gap-6 md:grid-cols-2">
            <LeaderboardList
              title="Luckiest"
              blurb="Beating the odds, drop after drop."
              highlightLabel="Best pull"
              entries={board.luckiest}
              hot
            />
            <LeaderboardList
              title="Driest"
              blurb="Paying the house, kill after kill."
              highlightLabel="Worst wait"
              entries={board.driest}
            />
          </div>

          <div className="mt-8 max-w-xl">
            <LuckScale />
          </div>
        </>
      ) : (
        <p className="mt-4 max-w-prose text-parchment-dim">
          The leaderboard isn&rsquo;t open yet. Check back soon.
        </p>
      )}

      <p className="mt-8 max-w-prose font-mono text-xs text-parchment-dim">
        Only players who turn on &ldquo;Show me on the leaderboard&rdquo; in
        the Luck Tracker RuneLite plugin&rsquo;s settings are listed. Players
        who hide their log from the website are never shown.
      </p>
    </div>
  );
}
