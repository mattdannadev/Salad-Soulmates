import { z } from 'zod';

export const worksheetUsageInputSchema = z.object({
  id: z.uuid(),
  worksheet_line_id: z.uuid(),
  serialized_unit_id: z.uuid(),
  quantity: z.number().positive().max(1000000).multipleOf(0.0001),
});

export const worksheetCorrectionInputSchema = z.object({
  id: z.uuid(),
  usage_id: z.uuid(),
  restored_quantity: z.number().positive().max(1000000).multipleOf(0.0001),
  reason: z.string().trim().min(3).max(1000),
});

export const worksheetIssueInputSchema = z.object({
  id: z.uuid(),
  execution_id: z.uuid(),
  worksheet_line_id: z.uuid().optional(),
  serialized_unit_id: z.uuid().optional(),
  category: z.enum(['Spice', 'Bucket']),
  note: z.string().trim().min(3).max(1000),
}).refine((issue) => issue.category !== 'Bucket' || Boolean(issue.worksheet_line_id && issue.serialized_unit_id), {
  message: 'Choose the ingredient and bucket for a bucket problem.',
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
  'Package balance or source lot changed; review spice preparation',
  'Production preparation is cancelled',
  'Corrected quantity exceeds recorded usage',
  'Choose an open worksheet usage',
  'Correction exceeds the recorded quantity',
  'Correction request is already in use with different values',
  'Choose an open spice preparation',
  'Ingredient does not belong to this spice preparation',
  'Bucket does not match this ingredient',
  'Issue request is already in use with different values',
];
