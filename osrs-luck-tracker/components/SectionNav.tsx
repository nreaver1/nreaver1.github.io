"use client";

import { useEffect, useState } from "react";

export interface NavSection {
  id: string;
  label: string;
  count?: number;
}

// A section counts as current once its heading scrolls past this line
// (in px from the top of the viewport), so the highlight changes a little
// before the heading reaches the very top.
const ACTIVE_LINE = 120;

function useActiveSection(ids: string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(ids[0]);
  const key = ids.join("|");

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= ACTIVE_LINE) current = id;
      }
      // At the bottom of the page the last section may never reach the
      // line, so it takes over once there's nowhere left to scroll.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = ids[ids.length - 1];
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}

/**
 * Jump links for a page's sections. Wide screens get a sticky list in the
 * empty left track of the page grid (`.section-rail`); narrower ones,
 * which have no room beside the content, get a sticky strip across the
 * top. The page renders both; each hides itself at the other's widths.
 */
export default function SectionNav({ sections }: { sections: NavSection[] }) {
  const active = useActiveSection(sections.map((s) => s.id));

  const link = (s: NavSection, variant: "rail" | "strip") => {
    const current = s.id === active;
    return (
      <a
        href={`#${s.id}`}
        aria-current={current ? "location" : undefined}
        className={
          variant === "rail"
            ? `flex items-baseline justify-between gap-2 border-l-2 py-1.5 pl-3 pr-1 font-mono text-sm no-underline transition-colors ${
                current
                  ? "border-brass text-brass"
                  : "border-transparent text-parchment-dim hover:border-panel-border hover:text-parchment"
              }`
            : `inline-flex shrink-0 items-baseline gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs no-underline transition-colors ${
                current
                  ? "border-brass text-brass"
                  : "border-panel-border text-parchment-dim hover:text-parchment"
              }`
        }
      >
        {s.label}
        {s.count !== undefined && <span className="text-xs text-parchment-dim">{s.count}</span>}
      </a>
    );
  };

  return (
    <>
      <nav aria-label="On this page" className="section-rail hidden xl:block">
        <p className="mb-2 pl-3 font-mono text-xs uppercase tracking-wide text-parchment-dim">On this page</p>
        <ul>
          {sections.map((s) => (
            <li key={s.id}>{link(s, "rail")}</li>
          ))}
        </ul>
      </nav>
      <nav
        aria-label="On this page"
        className="sticky top-0 z-20 -mx-5 mt-6 bg-ink/95 px-5 py-2 backdrop-blur sm:-mx-8 sm:px-8 xl:hidden"
      >
        <ul className="no-scrollbar flex gap-2 overflow-x-auto">
          {sections.map((s) => (
            <li key={s.id}>{link(s, "strip")}</li>
          ))}
        </ul>
      </nav>
    </>
  );
}
