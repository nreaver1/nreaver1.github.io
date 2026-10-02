'use client';

import { useRef, type ButtonHTMLAttributes, type KeyboardEvent } from 'react';
import styles from './Pill.module.css';

export type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean;
  onSelectedChange?: (selected: boolean) => void;
};

/** A toggle pill (e.g. a Text/Email alert switch). Exposes its state with aria-pressed. */
export function Pill({
  selected,
  onSelectedChange,
  onClick,
  className,
  type = 'button',
  ...rest
}: PillProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={[styles.pill, className].filter(Boolean).join(' ')}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onSelectedChange?.(!selected);
      }}
      {...rest}
    />
  );
}

export type PillOption<V extends string | number> = { value: V; label: string };

export type PillGroupProps<V extends string | number> = {
  label: string;
  options: readonly PillOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
};

const KEY_DELTA: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** Single-choice pills (dates, minutes apart, course scope): a radio group with arrow-key support. */
export function PillGroup<V extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: PillGroupProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = KEY_DELTA[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={[styles.group, className].filter(Boolean).join(' ')}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === selectedIndex ? 0 : -1}
          className={styles.pill}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
