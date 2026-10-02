import styles from './forms.module.css';

/** Form-level error, announced to screen readers. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );
}
