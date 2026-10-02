'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Sheet.module.css';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  closeLabel?: string;
};

/**
 * Modal bottom sheet (claim flow, organizer menus). Uses the native <dialog> so focus is trapped,
 * Esc closes it, the page behind is inert, and focus returns to the opener on close.
 */
export function Sheet({ open, onClose, title, children, closeLabel = 'Close' }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc: let React state drive closing so `open` stays the source of truth.
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the dialog element itself (not the panel) is a click on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className={styles.panel}>
          <div className={styles.top}>
            <div className={styles.spacer} />
            <div className={styles.grabber} aria-hidden="true" />
            <button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6 L18 18 M18 6 L6 18" />
              </svg>
            </button>
          </div>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
