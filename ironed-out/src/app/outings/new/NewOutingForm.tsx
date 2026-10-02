'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { SearchIcon } from '@/components/icons';
import { FormError } from '@/components/forms/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { Input, PillGroup, Stepper } from '@/components/ui';
import { formatDrive, formatMinutes, formatPlayDate } from '@/lib/format';
import type { CourseResult } from '@/server/domain/courses';
import { emptyForm } from '@/web/form-state';
import { createOutingAction, searchCoursesAction } from '../actions';
import styles from './new.module.css';

const INTERVALS = [8, 9, 10, 12].map((v) => ({ value: v, label: String(v) }));
const SCOPES = [
  { value: 'near' as const, label: 'Within 2 hrs of Baltimore' },
  { value: 'all' as const, label: 'All courses' },
];

export function NewOutingForm({
  weekendDates,
  initialCourses,
}: {
  weekendDates: string[];
  initialCourses: CourseResult[];
}) {
  const [state, action] = useActionState(createOutingAction, emptyForm);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'near' | 'all'>('near');
  const [results, setResults] = useState<CourseResult[]>(initialCourses);
  const [searching, startSearch] = useTransition();
  const [course, setCourse] = useState<CourseResult | null>(null);
  const [playDate, setPlayDate] = useState(weekendDates[0] ?? '');
  const [start, setStart] = useState(460);
  const [count, setCount] = useState(3);
  const [per, setPer] = useState(4);
  const [interval, setIntervalMinutes] = useState(10);

  useEffect(() => {
    const handle = setTimeout(() => {
      startSearch(async () => setResults(await searchCoursesAction(query, scope)));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, scope]);

  const times = Array.from({ length: count }, (_, i) => formatMinutes(start + i * interval));
  const suffix = new Set(times.map((t) => t.slice(-2))).size === 1 ? ` ${times[0]!.slice(-2)}` : '';
  const preview = suffix ? times.map((t) => t.slice(0, -3)).join(' · ') + suffix : times.join(' · ');
  const datePills = weekendDates.slice(0, 4).map((d) => ({ value: d, label: formatPlayDate(d) }));

  return (
    <form action={action} className={styles.form} noValidate>
      <FormError message={state.error} />

      <section className={styles.section} aria-labelledby="where">
        <h2 id="where" className={styles.step}>
          1. Where?
        </h2>
        <div className={styles.search}>
          <label htmlFor="course-q" className="visually-hidden">
            Search courses
          </label>
          <input
            id="course-q"
            className={styles.searchInput}
            placeholder="Search courses or towns"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          <SearchIcon className={styles.searchIcon} />
        </div>
        <PillGroup label="Which courses" options={SCOPES} value={scope} onChange={setScope} />
        <div className={styles.results} role="listbox" aria-label="Courses" aria-busy={searching}>
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={course?.id === c.id}
              className={styles.course}
              onClick={() => setCourse(c)}
            >
              <span className={styles.courseText}>
                <span className={styles.courseName}>{c.name}</span>
                <span className={styles.courseTown}>
                  {c.city}, {c.region}
                </span>
              </span>
              <span className={styles.drive}>{formatDrive(c.driveMinutes)}</span>
            </button>
          ))}
          {!results.length && !searching && (
            <p className={styles.empty}>No courses match.{scope === 'near' && ' Try “All courses”.'}</p>
          )}
        </div>
        <input type="hidden" name="courseId" value={course?.id ?? ''} />
        {state.fields?.courseId && (
          <p className={styles.fieldError} role="alert">
            {state.fields.courseId}
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="when">
        <h2 id="when" className={styles.step}>
          2. When?
        </h2>
        <PillGroup
          label="Upcoming weekend days"
          options={datePills}
          value={playDate}
          onChange={setPlayDate}
        />
        <Input
          label="Or pick a date"
          type="date"
          name="playDate"
          value={playDate}
          min={weekendDates[0] ? undefined : undefined}
          onChange={(e) => setPlayDate(e.target.value)}
          error={state.fields?.playDate}
        />
      </section>

      <section className={styles.section} aria-labelledby="tees">
        <h2 id="tees" className={styles.step}>
          3. Tee times
        </h2>
        <Stepper
          label="First tee time"
          value={start}
          min={360}
          max={1080}
          step={interval}
          onChange={setStart}
          format={formatMinutes}
          decrementLabel="Earlier"
          incrementLabel="Later"
        />
        <Stepper
          label="Tee times"
          value={count}
          min={1}
          max={6}
          onChange={setCount}
          decrementLabel="Fewer tee times"
          incrementLabel="More tee times"
        />
        <Stepper
          label="Players each"
          value={per}
          min={2}
          max={5}
          onChange={setPer}
          decrementLabel="Fewer players per tee time"
          incrementLabel="More players per tee time"
        />
        <div className={styles.row}>
          <span>Minutes apart</span>
          <PillGroup
            label="Minutes apart"
            options={INTERVALS}
            value={interval}
            onChange={setIntervalMinutes}
          />
        </div>
        <div className={styles.preview} aria-live="polite">
          <div>{preview}</div>
          <div className={`display ${styles.previewSpots}`}>{count * per} spots to fill</div>
        </div>
        <input type="hidden" name="firstTeeMinutes" value={start} />
        <input type="hidden" name="teeTimeCount" value={count} />
        <input type="hidden" name="playersEach" value={per} />
        <input type="hidden" name="intervalMinutes" value={interval} />
      </section>

      <section className={styles.section} aria-labelledby="details">
        <h2 id="details" className={styles.step}>
          4. The details
        </h2>
        <div className={styles.money}>
          <Input
            label="Cost per player (paid at the course)"
            name="price"
            inputMode="decimal"
            placeholder="45"
            defaultValue={state.values?.price}
            error={state.fields?.price}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="note" className={styles.label}>
            Note for the crew
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            maxLength={500}
            className={styles.textarea}
            placeholder="Carts or walking, where to meet, etc."
            defaultValue={state.values?.note}
          />
        </div>
      </section>

      <div className={styles.footer}>
        <SubmitButton variant="danger" block pendingLabel="Setting it up…" disabled={!course}>
          Create &amp; get the link
        </SubmitButton>
        {!course && <p className={styles.hint}>Pick a course to continue.</p>}
      </div>
    </form>
  );
}
