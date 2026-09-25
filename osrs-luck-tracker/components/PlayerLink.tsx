"use client";

import Link from "next/link";
import { useCasinoNavigate } from "./NavigationProvider";

/**
 * A link to a player page that shows the casino loading screen. Modified
 * clicks (new tab, etc.) behave like a normal link.
 */
export default function PlayerLink(props: React.ComponentProps<typeof Link> & { href: string }) {
  const navigate = useCasinoNavigate();
  return (
    <Link
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(props.href);
      }}
    />
  );
}
