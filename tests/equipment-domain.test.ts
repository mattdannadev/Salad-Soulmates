import { describe, expect, it } from 'vitest';
import { equipmentSchema, equipmentTreeNodeSchema } from '@/domain/equipment';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const mixer = {
  id: id(1),
  organization_id: id(2),
  facility_id: id(3),
  parent_equipment_id: null,
  equipment_code: 'MIX-001',
  display_name: 'Primary mixer',
  equipment_type: 'mixer',
  status: 'active',
  manufacturer: 'Synthetic Fabrication',
  model: 'MX-500',
  serial_number: 'SERIAL-1',
  location: 'Mix room',
  commissioned_on: '2026-09-01',
  retired_on: null,
  usable_capacity: 500,
  usable_capacity_uom: 'gal',
  revision: 1,
  created_by: id(4),
  updated_by: id(4),
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
} as const;

describe('equipment domain contract', () => {
  it('accepts a serialized mixer and its recursive hierarchy metadata', () => {
    const result = equipmentTreeNodeSchema.parse({
      ...mixer,
      depth: 0,
      hierarchy_path: [mixer.id],
    });

    expect(result).toMatchObject({
      equipment_code: 'MIX-001',
      equipment_type: 'mixer',
      usable_capacity: 500,
      usable_capacity_uom: 'gal',
      depth: 0,
    });
  });

  it('requires typed capacity only for mixers and tanks', () => {
    expect(equipmentSchema.safeParse({
      ...mixer,
      usable_capacity: null,
      usable_capacity_uom: null,
    }).success).toBe(false);
    expect(equipmentSchema.safeParse({
      ...mixer,
      equipment_type: 'pump',
      usable_capacity: 10,
      usable_capacity_uom: 'gal',
    }).success).toBe(false);
  });

  it('keeps retirement status and date consistent', () => {
    expect(equipmentSchema.safeParse({
      ...mixer,
      status: 'retired',
      retired_on: null,
    }).success).toBe(false);
    expect(equipmentSchema.safeParse({
      ...mixer,
      status: 'retired',
      retired_on: '2026-10-01',
    }).success).toBe(true);
  });
});
