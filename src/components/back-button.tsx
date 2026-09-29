import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './action-primitives.module.css';

export interface BackButtonProps {
  href: string;
  label: string;
  icon?: ReactNode;
  className?: string;
}

/** A named destination for leaving a workflow without relying on browser history. */
export default function BackButton({
  href,
  label,
  icon = undefined,
  className = undefined,
}: BackButtonProps) {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) {
    throw new Error('BackButton requires an internal destination.');
  }

  return (
    <Link href={href} className={[styles.backLink, className].filter(Boolean).join(' ')}>
      <span aria-hidden="true">{icon ?? '←'}</span>
      <span>{label}</span>
    </Link>
  );
}
