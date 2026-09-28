'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import { logFailure } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';

export interface CopilotAccessActionResult {
  ok: boolean;
  message: string;
}

const profileDefaultSchema = z.object({
  access_profile_id: z.uuid(),
  enabled: z.enum(['true', 'false']),
});
const userOverrideSchema = z.object({
  user_id: z.uuid(),
  access: z.enum(['inherit', 'enabled', 'disabled']),
});

export async function setOperationsCopilotProfileDefault(
  _previous: CopilotAccessActionResult,
  form: FormData,
): Promise<CopilotAccessActionResult> {
  const input = profileDefaultSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { ok: false, message: 'Choose a valid Copilot profile default.' };
  const { db } = await requireProfile({ readOnly: false });
  if (!(await hasPermission(db, 'settings.manage'))) {
    return { ok: false, message: 'Settings management permission is required.' };
  }
  const enabled = input.data.enabled === 'true';
  try {
    const result = await db.rpc('set_operations_copilot_profile_default', {
      target_access_profile_id: input.data.access_profile_id,
      enabled,
    });
    if (result.error) throw result.error;
  } catch (cause) {
    logFailure('operations_copilot_profile_default', cause);
    return { ok: false, message: 'Copilot access could not be updated. Reload and try again.' };
  }
  revalidatePath('/app/user-management/profiles');
  revalidatePath('/app/user-management/users');
  return {
    ok: true,
    message: `Copilot is now ${enabled ? 'enabled' : 'disabled'} by default for this profile. The audited change was saved.`,
  };
}

export async function setOperationsCopilotUserOverride(
  _previous: CopilotAccessActionResult,
  form: FormData,
): Promise<CopilotAccessActionResult> {
  const input = userOverrideSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { ok: false, message: 'Choose a valid Copilot access setting.' };
  const { db } = await requireProfile({ readOnly: false });
  if (!(await hasPermission(db, 'access.manage'))) {
    return { ok: false, message: 'Access management permission is required.' };
  }
  const enabledOverride = input.data.access === 'inherit'
    ? null : input.data.access === 'enabled';
  try {
    const result = await db.rpc('set_operations_copilot_user_override', {
      target_user_id: input.data.user_id,
      enabled_override: enabledOverride,
    });
    if (result.error) throw result.error;
  } catch (cause) {
    logFailure('operations_copilot_user_override', cause);
    return { ok: false, message: 'Copilot access could not be updated. Reload and try again.' };
  }
  revalidatePath('/app/user-management/users');
  revalidatePath(`/app/user-management/users/${input.data.user_id}`);
  const setting = input.data.access === 'inherit'
    ? 'now follows the access profile default'
    : `is now explicitly ${input.data.access}`;
  return { ok: true, message: `Copilot access ${setting}. The audited change was saved.` };
}
