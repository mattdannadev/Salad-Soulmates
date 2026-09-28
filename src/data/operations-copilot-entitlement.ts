import 'server-only';
import { z } from 'zod';
import { operationError } from '@/lib/operation-error';
import { supabase } from '@/lib/supabase';

export interface OperationsCopilotEntitlementRepository {
  isEnabled(): Promise<boolean>;
}

export default function createOperationsCopilotEntitlementRepository():
OperationsCopilotEntitlementRepository {
  return {
    async isEnabled() {
      const db = await supabase();
      const result = await db.rpc('operations_copilot_enabled');
      if (result.error) {
        throw operationError(
          'operations_copilot_entitlement',
          'Unable to verify Operations Copilot access.',
          result.error,
        );
      }
      return z.boolean().parse(result.data);
    },
  };
}
