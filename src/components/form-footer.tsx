import Link from 'next/link';
import ActionButton from './action-button';
import styles from './action-primitives.module.css';

export interface FormFeedback {
  kind: 'success' | 'error';
  message: string;
}

export interface FormFooterProps {
  submitLabel: string;
  cancelLabel: string;
  cancelHref: string;
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  feedback?: FormFeedback;
  className?: string;
}

/** Form actions and announced feedback; place this inside the form element. */
export default function FormFooter({
  submitLabel,
  cancelLabel,
  cancelHref,
  pending = false,
  pendingLabel = undefined,
  disabled = false,
  feedback = undefined,
  className = undefined,
}: FormFooterProps) {
  if (!cancelHref.startsWith('/') || cancelHref.startsWith('//') || cancelHref.includes('\\')) {
    throw new Error('FormFooter requires an internal cancel destination.');
  }

  return (
    <footer className={[styles.footer, className].filter(Boolean).join(' ')}>
      {feedback && (
        <p
          className={feedback.kind === 'error' ? styles.error : styles.success}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}
      <div className={styles.footerActions}>
        {pending ? (
          <span className={styles.cancelLink} aria-disabled="true">{cancelLabel}</span>
        ) : (
          <Link href={cancelHref} className={styles.cancelLink}>{cancelLabel}</Link>
        )}
        <ActionButton type="submit" pending={pending} pendingLabel={pendingLabel} disabled={disabled}>
          {submitLabel}
        </ActionButton>
      </div>
    </footer>
  );
}
