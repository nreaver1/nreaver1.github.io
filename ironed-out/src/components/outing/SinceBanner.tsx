'use client';

import { BellIcon, CheckIcon } from '@/components/icons';
import { Button } from '@/components/ui';
import type { Feed } from '@/server/domain/feed';
import styles from './banner.module.css';

/**
 * "Since you last looked" (SPEC §3.8): what changed since this viewer's last visit, with a
 * one-tap grab for the first newly opened spot. Falls back to "You're in" when nothing changed.
 */
export function SinceBanner({
  feed,
  inOuting,
  grab,
  onSeen,
}: {
  feed: Feed;
  inOuting: boolean;
  /** First newly opened spot the viewer could grab, if any. */
  grab: { label: string; onGrab: () => void } | null;
  onSeen: () => void;
}) {
  if (feed.items.length === 0) {
    if (!feed.hasRecord || !inOuting) return null;
    return (
      <div className={styles.joined} role="status">
        <CheckIcon />
        <span>You’re in. No changes since you joined.</span>
      </div>
    );
  }
  return (
    <section className={styles.banner} role="status" aria-labelledby="since-title">
      <div className={styles.head}>
        <BellIcon />
        <h2 id="since-title" className={styles.title}>
          Since you last looked
        </h2>
      </div>
      <ul className={styles.items}>
        {feed.items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
        {feed.more > 0 && (
          <li>
            …and {feed.more} more {feed.more === 1 ? 'change' : 'changes'}.
          </li>
        )}
      </ul>
      <div className={styles.actions}>
        {grab && (
          <Button size="sm" variant="danger" onClick={grab.onGrab}>
            {grab.label}
          </Button>
        )}
        <Button variant="ghost" onClick={onSeen}>
          Got it
        </Button>
      </div>
    </section>
  );
}
