'use client';

import type { ButtonHTMLAttributes } from 'react';
import styles from './Switch.module.css';

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
};

/** On/off switch (quiet hours). A real button with role="switch". */
export function Switch({ checked, onCheckedChange, label, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={[styles.switch, className].filter(Boolean).join(' ')}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
