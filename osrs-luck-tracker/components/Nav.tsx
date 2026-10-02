import Link from "next/link";
import NavSearch from "./NavSearch";

export default function Nav() {
  return (
    <header className="mx-auto flex max-w-3xl flex-col gap-4 px-5 pt-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <Link
        href="/"
        className="inline-flex items-baseline gap-2 text-parchment no-underline"
      >
        <span className="text-lg font-medium">
          Clog <span className="text-brass">Casino</span>
        </span>
        <span className="font-mono text-xs text-parchment-dim">
          osrs collection log
        </span>
      </Link>
      <div className="flex w-full items-start gap-5 sm:w-auto">
        <Link
          href="/leaderboard"
          className="shrink-0 font-mono text-sm leading-[38px] text-parchment-dim no-underline transition-colors hover:text-brass"
        >
          Leaderboard
        </Link>
        <NavSearch />
      </div>
    </header>
  );
}
