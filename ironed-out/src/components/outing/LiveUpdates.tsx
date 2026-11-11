'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const POLL_MS = 5000;

/**
 * Keeps an open outing page current: polls `url` for the newest event id while the tab is
 * visible, and re-renders the page (tee sheet + "Since you last looked") when it moves.
 */
export function LiveUpdates({ url, lastEventId }: { url: string; lastEventId: number }) {
  const router = useRouter();
  const known = useRef(lastEventId);
  useEffect(() => {
    known.current = lastEventId;
  }, [lastEventId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inFlight = false;

    const check = async () => {
      clearTimeout(timer);
      if (stopped || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.status === 404) {
          // Outing deleted or link revoked: show the page's own "gone" state and stop.
          stopped = true;
          router.refresh();
          return;
        }
        if (res.ok) {
          const { lastEventId: latest } = (await res.json()) as { lastEventId: number };
          if (latest > known.current) {
            known.current = latest;
            router.refresh();
          }
        }
      } catch {
        // Offline or a blip: try again next tick.
      } finally {
        inFlight = false;
      }
      if (!stopped) timer = setTimeout(check, POLL_MS);
    };

    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    timer = setTimeout(check, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [url, router]);

  return null;
}
