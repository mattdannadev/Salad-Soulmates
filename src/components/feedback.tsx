'use client';

import { useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { RecordForm } from './record-form';
import useNativeDialog from './use-native-dialog';

export default function FeedbackDrawer({
  locale = 'en',
  feedbackTypes = [
    { code: 'Suggestion', label_en: 'Suggestion', label_es: 'Sugerencia' },
    { code: 'Issue', label_en: 'Issue', label_es: 'Problema' },
    { code: 'Positive', label_en: 'Positive', label_es: 'Positivo' },
    { code: 'Question', label_en: 'Question', label_es: 'Pregunta' },
  ],
}: {
  locale?: 'en' | 'es';
  feedbackTypes?: { code: string; label_en: string; label_es: string }[];
}) {
  const [pending, setPending] = useState(false);
  const {
    dialog, openDialog, closeDialog, onCancel, onClose,
  } = useNativeDialog(pending);
  const id = useId();
  const route = usePathname();
  const es = locale === 'es';
  return (
    <>
      <button type="button" className="feedback-button" onClick={openDialog}>
        <MessageCircle size={18} />
        {es ? 'Comentarios' : 'Feedback'}
      </button>
      <dialog ref={dialog} className="feedback-drawer" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={onCancel} onClose={onClose}>
        <div className="row">
          <h2 id={`${id}-title`}>{es ? 'Comentarios' : 'Share your thoughts'}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={es ? 'Cerrar comentarios' : 'Close feedback'}
            disabled={pending}
            onClick={closeDialog}
          >
            <X />
          </button>
        </div>
        <p id={`${id}-description`}>
          {es
            ? 'Ayúdanos a mejorar esta pantalla.'
            : 'Help us make Salad Soulmates better. Your current page is included automatically.'}
        </p>
        <div className="notice">{route}</div>
        <RecordForm
          onPendingChange={setPending}
          locale={locale}
          kind="feedback"
          hidden={{ route }}
          fields={[
            {
              name: 'comment',
              label: es ? 'Tu comentario' : 'Your feedback',
              type: 'textarea',
              required: true,
            },
            {
              name: 'feedback_type',
              label: es ? 'Tipo' : 'Type',
              type: 'select',
              value: feedbackTypes[0]?.code,
              options: feedbackTypes.map((value) => ({
                value: value.code,
                label: es ? value.label_es : value.label_en,
              })),
            },
          ]}
          submit={es ? 'Enviar comentario' : 'Submit feedback'}
        />
      </dialog>
    </>
  );
}
