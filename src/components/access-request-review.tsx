'use client';

import { useActionState } from 'react';
import { approveAccessRequest, reviewAccessRequest } from '@/app/actions';

interface Facility {
  id: string;
  name: string;
}
interface AccessProfile {
  id: string;
  name: string;
  base_role: string;
}
export default function AccessRequestReview({
  id,
  contactKind,
  requestedRole,
  facilities,
  profiles,
}: {
  id: string;
  contactKind: string;
  requestedRole: string;
  facilities: Facility[];
  profiles: AccessProfile[];
}) {
  const [approval, approve, approving] = useActionState(approveAccessRequest, {
    ok: false,
    message: '',
  });
  const [review, update, updating] = useActionState(reviewAccessRequest, {
    ok: false,
    message: '',
  });
  return (
    <div className="approval-actions">
      {contactKind === 'email' ? (
        <form action={approve} className="inline-form">
          <input type="hidden" name="id" value={id} />
          <label>
            Facility
            <select name="facility_id" required>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Access profile
            <select
              name="access_profile_id"
              defaultValue={profiles.find((profile) => profile.base_role === requestedRole)?.id}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={approving}>
            {approving ? 'Approving…' : 'Approve & invite'}
          </button>
          {approval.message ? (
            <p
              role={approval.ok ? 'status' : 'alert'}
              className={approval.ok ? 'notice' : 'error-notice'}
            >
              {approval.message}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="notice">
          Phone requests require direct follow-up until SMS authentication is configured.
        </p>
      )}
      <form action={update} className="inline-form">
        <input type="hidden" name="id" value={id} />
        <label>
          Review note
          <input name="note" maxLength={1000} />
        </label>
        <button
          type="submit"
          name="decision"
          value="Contacted"
          className="secondary"
          disabled={updating}
        >
          Mark contacted
        </button>
        <button
          type="submit"
          name="decision"
          value="Declined"
          className="secondary"
          disabled={updating}
        >
          Decline
        </button>
        {review.message ? (
          <p
            role={review.ok ? 'status' : 'alert'}
            className={review.ok ? 'notice' : 'error-notice'}
          >
            {review.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
