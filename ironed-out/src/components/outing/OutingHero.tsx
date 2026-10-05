import { WindFlag } from '@/components/illustrations/WindFlag';
import { firstName, formatPlayDate, formatPrice } from '@/lib/format';
import type { OutingView } from '@/server/domain/outings';
import styles from './outing.module.css';
import { teeSummary } from './spots';

export function OutingHero({ view }: { view: OutingView }) {
  const price = formatPrice(view.priceCents);
  const place = view.course.address
    ? `${view.course.address}, ${view.course.city}, ${view.course.region}`
    : `${view.course.city}, ${view.course.region}`;
  return (
    <section className={styles.hero} aria-labelledby="outing-title">
      <div className={styles.heroArt}>
        <svg
          viewBox="0 0 354 96"
          width="100%"
          height="96"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
        >
          <path
            d="M30 30 q5 -11 16 -6 q7 -9 17 -1 q11 0 8 9 z"
            fill="#FFFFFF"
            stroke="#2B2A26"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="310" cy="26" r="13" fill="#F2C14E" stroke="#2B2A26" strokeWidth="2" />
          <path
            d="M0 66 Q90 38 180 58 T354 50 L354 96 L0 96Z"
            fill="#A8CC94"
            stroke="#2B2A26"
            strokeWidth="2"
          />
          <path
            d="M0 84 Q120 66 240 80 T354 78 L354 96 L0 96Z"
            fill="#6FA35F"
            stroke="#2B2A26"
            strokeWidth="2"
          />
          <ellipse cx="236" cy="64" rx="34" ry="8" fill="#4E8B4A" stroke="#2B2A26" strokeWidth="2" />
          <line x1="240" y1="64" x2="240" y2="18" stroke="#2B2A26" strokeWidth="2.5" strokeLinecap="round" />
          <WindFlag x={240} top={18} length={26} height={16} />
        </svg>
        {view.locked && <div className={`display ${styles.stamp}`}>Locked in</div>}
      </div>
      <div className={styles.heroBody}>
        <div className={styles.heroKicker}>
          {view.isOrganizer ? 'Your outing' : `${firstName(view.organizerName)}’s outing`}
        </div>
        <h1 id="outing-title" className={styles.heroTitle}>
          {view.course.name}
        </h1>
        <div style={{ fontSize: 18 }}>{place}</div>
        <div style={{ fontSize: 19 }}>
          {formatPlayDate(view.playDate)} · {teeSummary(view)}
        </div>
        {price && <div style={{ fontSize: 18 }}>{price} / player · pay at the course</div>}
        {view.locked && <span className="visually-hidden">This outing is locked in.</span>}
        {view.note && <div className={styles.heroNote}>“{view.note}”</div>}
      </div>
    </section>
  );
}
