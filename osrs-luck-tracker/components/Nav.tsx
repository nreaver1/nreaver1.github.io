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
          Luck <span className="text-brass">Tracker</span>
        </span>
        <span className="font-mono text-xs text-parchment-dim">
          osrs collection log
        </span>
      </Link>
      <NavSearch />
    </header>
  );
}
