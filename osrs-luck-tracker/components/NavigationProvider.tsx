"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import CasinoLoader from "./CasinoLoader";

// The player route can't have a loading.tsx (it would stream, and then
// notFound() answers 200 instead of 404), so the loading screen is driven
// from the client instead: navigations started here run in a transition,
// and the casino overlay shows while the next page renders.

// Long enough for an animation to read as one, even when mock data
// renders the next page instantly.
const MIN_VISIBLE_MS = 900;

const NavigationContext = createContext<(href: string) => void>(() => {});

/** Navigate with the casino loading screen. */
export function useCasinoNavigate() {
  return useContext(NavigationContext);
}

export default function NavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  const navigate = useCallback(
    (href: string) => {
      shownAt.current = Date.now();
      setVisible(true);
      startTransition(() => router.push(href));
    },
    [router],
  );

  useEffect(() => {
    if (isPending || !visible) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => setVisible(false), wait);
    return () => clearTimeout(timer);
  }, [isPending, visible]);

  return (
    <NavigationContext.Provider value={navigate}>
      {children}
      <CasinoLoader active={visible} />
    </NavigationContext.Provider>
  );
}
