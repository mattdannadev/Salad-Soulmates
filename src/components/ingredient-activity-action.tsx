'use client';

import { useActionState } from 'react';
import { setIngredientActivity } from '@/app/actions';

const initialState = { ok: false, message: '' };

export default function IngredientActivityAction({
  ingredientId,
  ingredientName,
  active,
}: {
  ingredientId: string;
  ingredientName: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(setIngredientActivity, initialState);
  const label = active ? 'Deactivate' : 'Reactivate';
  return (
    <form action={action}>
      <input type="hidden" name="id" value={ingredientId} />
      <input type="hidden" name="active" value={String(!active)} />
      <button
        type="submit"
        className={active ? 'secondary' : undefined}
        disabled={pending}
        aria-label={`${label} ${ingredientName}`}
      >
        {pending ? 'Saving…' : label}
      </button>
      {state.message ? (
        <p className={state.ok ? 'notice' : 'error-notice'} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
