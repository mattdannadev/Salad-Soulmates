import { z } from 'zod';

export const worksheetUsageInputSchema = z.object({
  id: z.uuid(),
  worksheet_line_id: z.uuid(),
  serialized_unit_id: z.uuid(),
  quantity: z.number().positive().max(1000000).multipleOf(0.0001),
});

export const BATCH_WORKSHEET_MESSAGES = [
  'Choose an assigned production batch',
  'Choose an open worksheet line',
  'Package is not available in this facility',
  'Package does not match this ingredient line',
  'Package is held, expired, exhausted, or missing source-lot evidence',
  'Quantity exceeds the recipe line requirement',
  'Quantity exceeds the available package balance',
  'Usage request is already in use with different values',
  'Record the required quantity for every ingredient line before completing',
];
