import { z } from 'zod';

const supplierSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  contact_name: z.string().trim().max(120),
  email: z.union([z.email(), z.literal('')]),
  phone: z.string().max(40),
  lead_time_days: z.number().int().min(0).max(365),
  active: z.boolean(),
});

export default supplierSchema;
