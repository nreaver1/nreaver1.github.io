'use client';

import { useId } from 'react';
import { Button } from './Button';
import styles from './Stepper.module.css';

export type TimeStepperProps = {
  label: string;
  /** Minutes after midnight. */
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
  decrementLabel?: string;
  incrementLabel?: string;
};

const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * − time + control. The time itself is a native time input, so tapping it opens the phone's
 * clock picker (or the browser's on desktop) and it can be typed, while −/+ still step by `step`.
 */
export function TimeStepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
  decrementLabel = `Earlier ${label.toLowerCase()}`,
  incrementLabel = `Later ${label.toLowerCase()}`,
}: TimeStepperProps) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    // No labelled group here: the time input already carries the label.
    <div className={styles.row}>
      <div className={styles.label}>
        <label htmlFor={`${id}-time`}>{label}</label>
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
      <div className={styles.controls}>
        <Button
          size="icon"
          aria-label={decrementLabel}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          <span aria-hidden="true">−</span>
        </Button>
        <input
          id={`${id}-time`}
          type="time"
          className={styles.time}
          value={toHHMM(value)}
          min={toHHMM(min)}
          max={toHHMM(max)}
          step={60}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker();
            } catch {
              // Older browsers: the field still takes typed input.
            }
          }}
          onChange={(e) => {
            const [h, m] = e.target.value.split(':').map(Number);
            // Empty while a segment is half-typed; wait for a full time.
            if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
            onChange(clamp(h * 60 + m));
          }}
        />
        <Button
          size="icon"
          aria-label={incrementLabel}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          <span aria-hidden="true">+</span>
        </Button>
      </div>
    </div>
  );
}
