import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  describe, expect, it, vi,
} from 'vitest';
import MobileOperationsCopilot from '@/components/mobile-operations-copilot';
import queryMobileOperations, {
  type MobileOperationsCopilotDependencies,
} from '@/services/mobile-operations-copilot';
import type { Profile } from '@/domain/master-data';
import type { WorkerPreparation } from '@/domain/worker-preparations';
import type { Database } from '@/lib/database.types';

vi.mock('server-only', () => ({}));

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const db = new SupabaseClient<Database>('http://localhost', 'test-publishable-key');

function profile(role: 'worker' | 'receiver'): Profile & { role: 'worker' | 'receiver' } {
  return {
    id: uuid(1),
    organization_id: uuid(2),
    facility_id: uuid(3),
    access_profile_id: uuid(4),
    display_name: 'Mobile Teammate',
    preferred_locale: 'en',
    active: true,
    role,
  };
}

function preparation(status: WorkerPreparation['status'], assignedOn: string): WorkerPreparation {
  return {
    planned_mixer_batch_id: uuid(status === 'Complete' ? 10 : 11),
    planned_spice_preparation_id: uuid(12),
    sequence: 1,
    target_gallons: 20,
    product_name: 'Garden blend',
    production_lot_id: uuid(13),
    production_lot_code: 'LOT-22',
    assigned_on: assignedOn,
    plan_start_on: assignedOn,
    plan_finish_on: assignedOn,
    execution_id: status === 'Not started' ? null : uuid(14),
    status,
    issues: [],
    lines: [{
      id: uuid(15),
      ingredient_id: uuid(16),
      ingredient_name: 'Pepper',
      required_quantity: 2,
      uom: 'lb',
      sequence: 1,
      usages: [{
        id: uuid(17), serialized_unit_id: uuid(18), source_lot: 'P-1', quantity: 2,
      }],
      packages: [],
    }],
  };
}

function dependencies(
  role: 'worker' | 'receiver',
  overrides: Partial<MobileOperationsCopilotDependencies> = {},
): MobileOperationsCopilotDependencies {
  return {
    resolveAccess: () => Promise.resolve({ ok: true, db, profile: profile(role) }),
    isEnabled: () => Promise.resolve(true),
    hasPermission: () => Promise.resolve(true),
    loadPreparations: () => Promise.resolve([]),
    loadDeliveries: () => Promise.resolve([]),
    ...overrides,
  };
}

describe('Mobile Operations Copilot service', () => {
  it('rejects malformed and role-mismatched intents', async () => {
    await expect(queryMobileOperations(
      { kind: 'sql', limit: 500 },
      dependencies('worker'),
    )).resolves.toMatchObject({ ok: false, code: 'invalid' });
    await expect(queryMobileOperations(
      { kind: 'deliveries', limit: 10 },
      dependencies('worker'),
    )).resolves.toMatchObject({ ok: false, code: 'denied' });
  });

  it('fails closed for module and workspace permissions', async () => {
    await expect(queryMobileOperations(
      { kind: 'preparations' },
      dependencies('worker', { isEnabled: () => Promise.resolve(false) }),
    )).resolves.toMatchObject({ ok: false, code: 'denied' });
    await expect(queryMobileOperations(
      { kind: 'preparations' },
      dependencies('worker', { hasPermission: () => Promise.resolve(false) }),
    )).resolves.toMatchObject({ ok: false, code: 'denied' });
  });

  it('returns only incomplete preparation summaries', async () => {
    const result = await queryMobileOperations(
      { kind: 'preparations', limit: 10 },
      dependencies('worker', {
        loadPreparations: () => Promise.resolve([
          preparation('Complete', '2026-09-27'),
          preparation('Open', '2026-09-28'),
        ]),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      kind: 'preparations',
      count: 1,
      records: [{ productName: 'Garden blend', completedIngredients: 1 }],
    });
    const html = renderToStaticMarkup(
      createElement(MobileOperationsCopilot, { result, fallbackRole: 'worker' }),
    );
    expect(html).toContain('Incomplete preparations for your facility');
  });

  it('returns open receiving summaries without mutation controls', async () => {
    const result = await queryMobileOperations(
      { kind: 'deliveries', limit: 10 },
      dependencies('receiver', {
        loadDeliveries: () => Promise.resolve([{
          id: uuid(30),
          supplierId: uuid(31),
          supplierName: 'Green Farm',
          reference: 'PO-9',
          expectedOn: '2026-09-29',
          createdAt: '2026-09-20T12:00:00Z',
          lines: [{
            id: uuid(32),
            ingredientId: uuid(33),
            ingredientName: 'Lettuce',
            supplierSku: 'LET-1',
            purchaseUom: 'case',
            packQuantity: 10,
            uom: 'lb',
            ordered: 50,
            received: 20,
            outstanding: 30,
          }],
        }]),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      kind: 'deliveries',
      records: [{ reference: 'PO-9', lines: [{ outstanding: 30 }] }],
    });
    const html = renderToStaticMarkup(
      createElement(MobileOperationsCopilot, { result, fallbackRole: 'receiver' }),
    );
    expect(html).toContain('Which deliveries are pending?');
    expect(html).toContain('Read only');
    expect(html).not.toContain('<form');
  });
});
