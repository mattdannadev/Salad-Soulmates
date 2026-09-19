'use client';

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { RecordForm } from './record-form';

export default function FeedbackDrawer({ worker = false }: { worker?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const route = usePathname();
  return (
    <>
      <button type="button" className="feedback-button" onClick={() => dialog.current?.showModal()}>
        <MessageCircle size={18} />
        {worker ? 'Comentarios' : 'Feedback'}
      </button>
      <dialog ref={dialog} className="feedback-drawer">
        <div className="row">
          <h2>{worker ? 'Comentarios' : 'Share your thoughts'}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={worker ? 'Cerrar comentarios' : 'Close feedback'}
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        <p>
          {worker
            ? 'Ayúdanos a mejorar esta pantalla.'
            : 'Help us make Salad Soulmates better. Your current page is included automatically.'}
        </p>
        <div className="notice">{route}</div>
        <RecordForm
          locale={worker ? 'es' : 'en'}
          kind="feedback"
          hidden={{ route }}
          fields={[
            {
              name: 'comment',
              label: worker ? 'Tu comentario' : 'Your feedback',
              type: 'textarea',
              required: true,
            },
            {
              name: 'feedback_type',
              label: worker ? 'Tipo' : 'Type',
              type: 'select',
              value: 'Suggestion',
              options: (['Suggestion', 'Issue', 'Positive', 'Question'] as const).map((value) => ({
                value,
                label: worker
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
          submit={worker ? 'Enviar comentario' : 'Submit feedback'}
        />
      </dialog>
    </>
  );
}
