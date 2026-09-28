import {
  describe, expect, it, vi,
} from 'vitest';
import isOperationsCopilotEnabled from '@/services/operations-copilot-entitlement';
import type {
  OperationsCopilotEntitlementRepository,
} from '@/data/operations-copilot-entitlement';

vi.mock('server-only', () => ({}));

describe('Operations Copilot entitlement service', () => {
  it.each([true, false])('returns the repository entitlement %s', async (enabled) => {
    const isEnabled = vi.fn().mockResolvedValue(enabled);
    const repository: OperationsCopilotEntitlementRepository = {
      isEnabled,
    };

    await expect(isOperationsCopilotEnabled(repository)).resolves.toBe(enabled);
    expect(isEnabled).toHaveBeenCalledOnce();
  });

  it('does not convert a lookup failure into an entitlement', async () => {
    const failure = new Error('database unavailable');
    const repository: OperationsCopilotEntitlementRepository = {
      isEnabled: vi.fn().mockRejectedValue(failure),
    };

    await expect(isOperationsCopilotEnabled(repository)).rejects.toBe(failure);
  });
});
