"use client";

import { usePathname } from "next/navigation";
import SearchBar from "./SearchBar";
import DemoQuickLinks from "./DemoQuickLinks";

// The home page has its own large search, so the header one would just
// be a duplicate there.
export default function NavSearch() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  const player = pathname.match(/^\/player\/([^/]+)/);
  return (
    <div className="w-full sm:w-72">
      <SearchBar compact />
      {player && <DemoQuickLinks current={decodeURIComponent(player[1])} />}
    </div>
  );
}
