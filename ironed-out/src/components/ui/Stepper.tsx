'use client';

import { useId } from 'react';
import { Button } from './Button';
import styles from './Stepper.module.css';

export type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  hint?: string;
  /** How the value reads on screen, e.g. 4 → "4 players". Defaults to the number. */
  format?: (value: number) => string;
  /** Accessible names for the buttons, e.g. "One fewer guest". */
  decrementLabel?: string;
  incrementLabel?: string;
};

/** − value + control. Buttons disable at the bounds; the value is announced politely when it changes. */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  hint,
  format = String,
  decrementLabel = `Decrease ${label.toLowerCase()}`,
  incrementLabel = `Increase ${label.toLowerCase()}`,
}: StepperProps) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={styles.row} role="group" aria-labelledby={`${id}-label`}>
      <div id={`${id}-label`} className={styles.label}>
        {label}
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
        <output className={styles.value} aria-live="polite">
          {format(value)}
        </output>
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
