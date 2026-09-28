import 'server-only';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import { rowSchemas, type Feedback } from '@/domain/master-data';
import { rows } from '@/lib/data';
import isOperationsCopilotEnabled from '@/services/operations-copilot-entitlement';

const requestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('plan'), message: z.string().trim().min(1).max(1500), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).max(20).optional() }),
  z.object({ mode: z.literal('execute'), proposal: z.object({ action: z.literal('update_feedback_status'), feedbackId: z.uuid(), changes: z.object({ status: z.enum(['New', 'Reviewed', 'Resolved']), resolution_note: z.string().trim().max(2000).default('') }) }) }),
]);

const providerResponseSchema = z.object({
  output: z.array(z.object({
    content: z.array(z.object({
      type: z.string().optional(),
      text: z.string().optional(),
    })).optional(),
  })).optional(),
});

function contextFor(feedback: Feedback[]) {
  return feedback.slice(0, 30).map((item) => ({
    id: item.id,
    type: item.feedback_type,
    status: item.status,
    comment: item.comment,
    route: item.route,
    createdAt: item.created_at,
  }));
}

export default async function runAiWorkspace(input: unknown) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Enter a valid request.' };

  // This legacy feedback workspace predates the Operations Copilot security gate.
  // Keep it fail-closed until its provider, audit, proposal/confirmation and
  // isolation controls are independently reviewed. The default prevents both an
  // outbound provider call and the direct feedback-status mutation below.
  if (process.env.OPERATIONS_COPILOT_AI_ENABLED !== 'true') {
    return {
      ok: false as const,
      error: 'AI operations are not enabled. No data was changed.',
    };
  }
  if (!await isOperationsCopilotEnabled()) {
    return {
      ok: false as const,
      error: 'Operations Copilot is not enabled for your access profile. No data was changed.',
    };
  }
  const { db, profile } = await requireAdminShell();

  if (parsed.data.mode === 'execute') {
    const permissions = await db.from('access_profile_permissions').select('permission_code').eq('access_profile_id', profile.access_profile_id).eq('permission_code', 'feedback.manage');
    if (permissions.error || !permissions.data.length) return { ok: false as const, error: 'You do not have permission to update feedback.' };
    const {
      feedbackId,
      changes: { status, resolution_note: resolutionNote },
    } = parsed.data.proposal;
    const result = await db.from('feedback_items')
      .update({ status, resolution_note: resolutionNote })
      .eq('id', feedbackId)
      .select('id,status,resolution_note')
      .single();
    if (result.error) return { ok: false as const, error: 'This feedback item could not be updated. Refresh and try again.' };
    return { ok: true as const, message: `Updated feedback to ${result.data.status}.`, result: result.data };
  }

  const plan = parsed.data;
  const feedback = await rows(db, 'feedback_items', rowSchemas.feedback_items);
  const model = process.env.OPENAI_MODEL ?? 'gpt-5-mini';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: 'You are an operations assistant. Answer only from the scoped feedback records supplied. Never claim a database write occurred. For requested changes, identify the relevant feedback record ID and state that the user must confirm the proposed action.' },
        { role: 'user', content: `Feedback records: ${JSON.stringify(contextFor(feedback))}\n\nConversation: ${JSON.stringify(plan.history ?? [])}\n\nRequest: ${plan.message}` },
      ],
    }),
  });
  if (!response.ok) return { ok: false as const, error: 'The AI workspace is temporarily unavailable. Your feedback data was not changed.' };
  const payload: unknown = await response.json();
  const parsedPayload = providerResponseSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { ok: false as const, error: 'The AI workspace is temporarily unavailable. Your feedback data was not changed.' };
  }
  const message = parsedPayload.data.output?.flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text').map((part) => part.text ?? '').join('')
    .trim()
    || 'I could not produce a response. Please try again.';
  let requestedStatus: 'Resolved' | 'Reviewed' | null = null;
  if (/\b(resolve|resolved|close|closed)\b/i.test(plan.message)) {
    requestedStatus = 'Resolved';
  } else if (/\b(review|reviewed)\b/i.test(plan.message)) {
    requestedStatus = 'Reviewed';
  }
  const id = plan.message.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
  const matching = id ? feedback.find((item) => item.id === id) : undefined;
  const permissionResult = await db.from('access_profile_permissions')
    .select('permission_code')
    .eq('access_profile_id', profile.access_profile_id)
    .eq('permission_code', 'feedback.manage');
  const proposal = requestedStatus && matching && !permissionResult.error
    && permissionResult.data.length > 0
    ? {
      action: 'update_feedback_status' as const, feedbackId: matching.id, feedbackSummary: matching.comment.slice(0, 140), changes: { status: requestedStatus, resolution_note: '' },
    }
    : undefined;
  return { ok: true as const, message, proposal };
}
