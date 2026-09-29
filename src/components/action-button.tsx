import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './action-primitives.module.css';

type ButtonAttributes = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'>;

type LabeledAction = ButtonAttributes & {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  children: ReactNode;
  icon?: ReactNode;
  'aria-label'?: string;
};

type IconAction = ButtonAttributes & {
  variant: 'icon-only';
  icon: ReactNode;
  children?: never;
  'aria-label': string;
};

export type ActionButtonProps = (LabeledAction | IconAction) & {
  type?: 'button' | 'submit';
  pending?: boolean;
  pendingLabel?: string;
};

/** A semantic action control; navigation belongs in a link. */
export default function ActionButton({
  variant = 'primary',
  type = 'button',
  pending = false,
  pendingLabel = undefined,
  disabled = false,
  icon,
  children,
  className,
  ...attributes
}: ActionButtonProps) {
  const visibleLabel = pending && pendingLabel && variant !== 'icon-only' ? pendingLabel : children;
  const variantClass = styles[variant === 'icon-only' ? 'iconOnly' : variant];

  return (
    <button
      {...attributes}
      type={type === 'submit' ? 'submit' : 'button'}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={[styles.button, variantClass, className].filter(Boolean).join(' ')}
    >
      {pending ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      {variant === 'icon-only' ? null : visibleLabel}
    </button>
  );
}
