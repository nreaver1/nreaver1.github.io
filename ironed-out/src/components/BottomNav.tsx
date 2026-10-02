import Link from 'next/link';
import styles from './BottomNav.module.css';

type Tab = 'home' | 'crew' | 'alerts';

const TABS: { id: Tab; href: string; label: string; icon: React.ReactNode }[] = [
  {
    id: 'home',
    href: '/home',
    label: 'Home',
    icon: <path d="M4 11 L12 4 L20 11 M6 10 V20 H18 V10" />,
  },
  {
    id: 'crew',
    href: '/crews',
    label: 'Crew',
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 19 c0-3.5 2.7-5.5 6-5.5 s6 2 6 5.5 M15 14.2 c3 0 6 1.5 6 4.8" />
      </>
    ),
  },
  {
    id: 'alerts',
    href: '/settings/alerts',
    label: 'Alerts',
    icon: (
      <>
        <path d="M6 16 V11 a6 6 0 0 1 12 0 V16 L20 18 H4 Z" />
        <path d="M10 21 h4" />
      </>
    ),
  },
];

/** The design's bottom navigation for signed-in screens. */
export function BottomNav({ current }: { current: Tab }) {
  return (
    <nav className={styles.nav} aria-label="Main" data-bottom-nav>
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={styles.tab}
          aria-current={t.id === current ? 'page' : undefined}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {t.icon}
          </svg>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
