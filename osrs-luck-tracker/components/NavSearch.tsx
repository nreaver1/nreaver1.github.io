"use client";

import { usePathname } from "next/navigation";
import SearchBar from "./SearchBar";

// The home page has its own large search, so the header one would just
// be a duplicate there.
export default function NavSearch() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="w-full sm:w-72">
      <SearchBar compact />
    </div>
  );
}
