'use client';

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { RecordForm } from './record-form';

export default function FeedbackDrawer({ locale = 'en' }: { locale?: 'en' | 'es' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const route = usePathname();
  const es = locale === 'es';
  return (
    <>
      <button type="button" className="feedback-button" onClick={() => dialog.current?.showModal()}>
        <MessageCircle size={18} />
        {es ? 'Comentarios' : 'Feedback'}
      </button>
      <dialog ref={dialog} className="feedback-drawer">
        <div className="row">
          <h2>{es ? 'Comentarios' : 'Share your thoughts'}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={es ? 'Cerrar comentarios' : 'Close feedback'}
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        <p>
          {es
            ? 'Ayúdanos a mejorar esta pantalla.'
            : 'Help us make Salad Soulmates better. Your current page is included automatically.'}
        </p>
        <div className="notice">{route}</div>
        <RecordForm
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
              value: 'Suggestion',
              options: (['Suggestion', 'Issue', 'Positive', 'Question'] as const).map((value) => ({
                value,
                label: es
                  ? {
                    Suggestion: 'Sugerencia',
                    Issue: 'Problema',
                    Positive: 'Me gusta',
                    Question: 'Pregunta',
                  }[value]
                  : value,
              })),
            },
          ]}
          submit={es ? 'Enviar comentario' : 'Submit feedback'}
        />
      </dialog>
    </>
  );
}
