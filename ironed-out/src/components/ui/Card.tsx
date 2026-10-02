import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'li';
  raised?: boolean;
  tone?: 'plain' | 'success' | 'highlight';
};

export function Card({ as: Tag = 'div', raised = false, tone = 'plain', className, ...rest }: CardProps) {
  const cls = [
    styles.card,
    raised && styles.raised,
    tone === 'success' && styles.success,
    tone === 'highlight' && styles.highlight,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <Tag className={cls} {...rest} />;
}
