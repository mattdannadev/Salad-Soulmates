import { rowSchemas } from '@/domain/master-data';
import { requireAdminShell } from '@/lib/auth';
import { rows, date } from '@/lib/data';
import { RecordForm } from '@/components/record-form';
import { PageHeader } from '@/components/shell';

export default async function FeedbackPage() {
  const { db, profile } = await requireAdminShell();
  const feedback = (await rows(db, 'feedback_items', rowSchemas.feedback_items)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <PageHeader
        eyebrow="BETTER TOGETHER"
        title="Feedback"
        description={
          profile.role === 'admin'
            ? 'Review suggestions and issues from across your workspace.'
            : 'Track the feedback you have shared.'
        }
      />
      {!feedback.length && (
        <section className="panel empty">
          <h2>Good ideas belong here</h2>
          <p>Use the Feedback button on any screen. The page context is included automatically.</p>
        </section>
      )}
      {feedback.map((f) => (
        <section className="panel" key={f.id}>
          <div className="row">
            <span className="badge">{f.status}</span>
            <small>
              {date(f.created_at)}
              {' '}
              CT ·
              {f.feedback_type}
            </small>
          </div>
          <p className="feedback-comment">{f.comment}</p>
          <p className="subtle">
            Page:
            {f.route}
          </p>
          {profile.role === 'admin' ? (
            <details>
              <summary>Review feedback</summary>
              <RecordForm
                kind="feedback-status"
                hidden={{ id: f.id }}
                fields={[
                  {
                    name: 'status',
                    label: 'Status',
                    type: 'select',
                    value: f.status,
                    options: ['New', 'Reviewed', 'Resolved'].map((value) => ({
                      value,
                      label: value,
                    })),
                  },
                  {
                    name: 'resolution_note',
                    label: 'Review note',
                    type: 'textarea',
                    value: f.resolution_note,
                  },
                ]}
                submit="Save review"
              />
            </details>
          ) : (
            f.resolution_note && <p>{f.resolution_note}</p>
          )}
        </section>
      ))}
    </>
  );
}
