import 'server-only';
import createOperationsCopilotEntitlementRepository from '@/data/operations-copilot-entitlement';
import type {
  OperationsCopilotEntitlementRepository,
} from '@/data/operations-copilot-entitlement';

/** Resolves the signed-in user's effective, default-off module entitlement. */
export default async function isOperationsCopilotEnabled(
  repository: OperationsCopilotEntitlementRepository =
    createOperationsCopilotEntitlementRepository(),
): Promise<boolean> {
  return repository.isEnabled();
}
