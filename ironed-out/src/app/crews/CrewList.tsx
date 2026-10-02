import Link from 'next/link';
import { ChevronIcon } from '@/components/icons';
import type { CrewSummary } from '@/server/domain/crews';
import styles from './crews.module.css';

export function crewSubtitle(c: CrewSummary) {
  const members = `${c.memberCount} ${c.memberCount === 1 ? 'member' : 'members'}`;
  return c.pendingCount ? `${members} · ${c.pendingCount} invites pending` : members;
}

/** The design's crew row card (Home and /crews). */
export function CrewList({ crews }: { crews: CrewSummary[] }) {
  return (
    <>
      {crews.map((c) => (
        <Link key={c.id} href={`/crews/${c.id}`} className={styles.row}>
          <span className={styles.rowText}>
            <span className={`display ${styles.rowTitle}`}>{c.name}</span>
            <span className="muted">{crewSubtitle(c)}</span>
          </span>
          <ChevronIcon />
        </Link>
      ))}
    </>
  );
}
