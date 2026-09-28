import 'server-only';

/** Future mobile assistant rollout switch; the administrator release leaves it off. */
export default function isMobileOperationsCopilotEnabled(): boolean {
  return process.env.MOBILE_OPERATIONS_COPILOT_ENABLED === 'true';
}
