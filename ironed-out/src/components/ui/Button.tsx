import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm' | 'icon';

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

export function buttonClassName(
  { variant = 'default', size = 'md', block = false }: StyleProps,
  extra?: string,
) {
  return [
    styles.button,
    variant === 'primary' && styles.primary,
    variant === 'danger' && styles.danger,
    variant === 'ghost' && styles.ghost,
    size === 'sm' && styles.sm,
    size === 'icon' && styles.icon,
    block && styles.block,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & StyleProps;

export function Button({ variant, size, block, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClassName({ variant, size, block }, className)} {...rest} />;
}

export type ButtonLinkProps = ComponentProps<typeof Link> & StyleProps;

/** A link styled as a button, for navigation (use Button for actions). */
export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClassName({ variant, size, block }, className)} {...rest} />;
}
