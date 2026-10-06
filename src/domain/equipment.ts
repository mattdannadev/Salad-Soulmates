import { z } from 'zod';

export const equipmentTypeSchema = z.enum([
  'mixer',
  'tank',
  'pump',
  'filler',
  'packaging_line',
  'utility',
  'other',
]);

export const equipmentStatusSchema = z.enum([
  'active',
  'inactive',
  'out_of_service',
  'retired',
]);

const optionalEquipmentTextSchema = z.string().trim().min(1).max(120)
  .nullable();

export const equipmentSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  facility_id: z.uuid(),
  parent_equipment_id: z.uuid().nullable(),
  equipment_code: z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,49}$/),
  display_name: z.string().trim().min(1).max(120),
  equipment_type: equipmentTypeSchema,
  status: equipmentStatusSchema,
  manufacturer: optionalEquipmentTextSchema,
  model: optionalEquipmentTextSchema,
  serial_number: optionalEquipmentTextSchema,
  location: optionalEquipmentTextSchema,
  commissioned_on: z.iso.date().nullable(),
  retired_on: z.iso.date().nullable(),
  usable_capacity: z.number().positive().nullable(),
  usable_capacity_uom: z.string().trim().min(1).max(50)
    .nullable(),
  revision: z.number().int().positive(),
  created_by: z.uuid(),
  updated_by: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
}).superRefine((equipment, context) => {
  const usesCapacity = equipment.equipment_type === 'mixer'
    || equipment.equipment_type === 'tank';
  const hasCompleteCapacity = equipment.usable_capacity !== null
    && equipment.usable_capacity_uom !== null;
  if (usesCapacity !== hasCompleteCapacity) {
    context.addIssue({
      code: 'custom',
      path: ['usable_capacity'],
      message: 'Mixer and tank equipment require a usable capacity and unit.',
    });
  }
  if ((equipment.status === 'retired') !== (equipment.retired_on !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['retired_on'],
      message: 'Retired equipment requires a retirement date.',
    });
  }
});

export const equipmentTreeNodeSchema = equipmentSchema.safeExtend({
  depth: z.number().int().nonnegative(),
  hierarchy_path: z.array(z.uuid()).min(1),
});

export type Equipment = z.infer<typeof equipmentSchema>;
export type EquipmentTreeNode = z.infer<typeof equipmentTreeNodeSchema>;
