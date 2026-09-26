import { describe, expect, it } from 'vitest';
import { planBatches, availability, purchaseUnits } from '../src/domain/planning';
import inventoryBalances, { inventoryUnits } from '../src/domain/inventory';
import { inventorySchema, packSchema } from '../src/domain/master-data';

describe('operating rules', () => {
  it('plans full 40 gallon batches, one bucket each, and exposes overage', () => {
    expect(planBatches(80)).toMatchObject({
      batches: 2,
      spiceBuckets: 2,
      plannedGallons: 80,
      overage: 0,
    });
    expect(planBatches(81)).toMatchObject({ batches: 3, spiceBuckets: 3, overage: 39 });
    expect(planBatches(0).batches).toBe(0);
    expect(() => planBatches(-1)).toThrow();
    expect(() => planBatches(Infinity)).toThrow();
  });
  it('requires a reason for an override and exposes an underproduction gap', () => {
    expect(() => planBatches(80, { count: 1, reason: '' })).toThrow();
    expect(planBatches(80, { count: 1, reason: 'Owner review' })).toMatchObject({
      calculated: 2,
      batches: 1,
      overage: -40,
      overrideReason: 'Owner review',
    });
  });
  it('counts selected demand once, separate from other commitments', () => {
    expect(
      availability({
        required: 80,
        onHand: 70,
        confirmedInbound: 20,
        otherCommitments: 30,
      }),
    ).toMatchObject({ projected: -20, shortage: 20 });
  });
  it('rounds supplier packs up and refuses unvalidated conversions', () => {
    expect(purchaseUnits(100, 'lb', 60, 'lb')).toEqual({ units: 2, quantity: 120, overage: 20 });
    expect(purchaseUnits(0, 'lb', 60, 'lb').units).toBe(0);
    expect(() => purchaseUnits(100, 'gal', 60, 'lb')).toThrow();
    expect(() => purchaseUnits(100, 'lb', 0, 'lb')).toThrow();
  });
  it('totals inventory independently per ingredient without decimal drift', () => {
    expect(
      inventoryBalances([
        { ingredient_id: 'a', quantity_delta: '0.1' },
        { ingredient_id: 'a', quantity_delta: '0.2' },
        { ingredient_id: 'b', quantity_delta: 25 },
        { ingredient_id: 'b', quantity_delta: -3.5 },
      ]),
    ).toEqual({ a: 0.3, b: 21.5 });
  });
  it('uses the recorded receiving unit for each inventory balance', () => {
    expect(inventoryUnits([
      { ingredient_id: 'oil', quantity_delta: 2, uom: 'gal' },
      { ingredient_id: 'oil', quantity_delta: -0.5, uom: 'gal' },
      { ingredient_id: 'spice', quantity_delta: 16, uom: 'oz' },
    ])).toEqual({ oil: 'gal', spice: 'oz' });
    expect(() => inventoryUnits([
      { ingredient_id: 'oil', quantity_delta: 2, uom: 'gal' },
      { ingredient_id: 'oil', quantity_delta: 16, uom: 'oz' },
    ])).toThrow('Inventory entries for an ingredient must use one unit.');
  });
  it('rejects incomplete and invalid inventory and supplier pack input', () => {
    expect(inventorySchema.safeParse({ quantity_delta: NaN }).success).toBe(false);
    expect(inventorySchema.safeParse({
      ingredient_id: '00000000-0000-4000-8000-000000000001',
      event_type: 'ManualShrink',
      quantity_delta: -2,
      uom: 'lb',
      reason_note: 'Order fill',
      effective_on: '2026-09-24',
      request_id: '00000000-0000-4000-8000-000000000002',
    }).success).toBe(true);
    expect(packSchema.safeParse({ pack_quantity: 0 }).success).toBe(false);
  });
});
