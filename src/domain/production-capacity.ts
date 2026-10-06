import { z } from 'zod';

export const mixingCapacityInputSchema = z.object({
  required_batches: z.number().int().positive(),
  mixing_minutes_per_batch: z.number().finite().positive(),
  mixing_crew_size: z.number().int().positive(),
  assigned_people: z.number().int().nonnegative(),
  productive_mixing_minutes_per_day: z.number().finite().positive(),
  committed_single_product_batch_cap: z.number().int().positive().default(24),
  stretch_single_product_batch_cap: z.number().int().positive().default(27),
}).refine((value) => (
  value.stretch_single_product_batch_cap >= value.committed_single_product_batch_cap
), {
  message: 'Stretch capacity must be at least committed capacity.',
});

export interface MixingCapacityEstimate {
  requiredBatches: number;
  minutesPerBatch: number;
  crewRequired: number;
  assignedPeople: number;
  staffingReady: boolean;
  timeBasedBatchesPerDay: number;
  committedBatchesPerDay: number;
  stretchBatchesPerDay: number;
  committedMixingDays: number | null;
  stretchMixingDays: number | null;
  totalMixerMinutes: number;
}

/**
 * One mixer line runs one batch at a time. Extra people satisfy crew needs;
 * they do not multiply throughput unless a future plant configures parallel
 * mixer lines. The daily product cap represents observed operating reality.
 */
export function estimateMixingCapacity(
  input: z.input<typeof mixingCapacityInputSchema>,
): MixingCapacityEstimate {
  const value = mixingCapacityInputSchema.parse(input);
  const timeBasedBatchesPerDay = Math.floor(
    value.productive_mixing_minutes_per_day / value.mixing_minutes_per_batch,
  );
  const staffingReady = value.assigned_people >= value.mixing_crew_size;
  const committedBatchesPerDay = staffingReady
    ? Math.min(timeBasedBatchesPerDay, value.committed_single_product_batch_cap) : 0;
  const stretchBatchesPerDay = staffingReady
    ? Math.min(timeBasedBatchesPerDay, value.stretch_single_product_batch_cap) : 0;
  return {
    requiredBatches: value.required_batches,
    minutesPerBatch: value.mixing_minutes_per_batch,
    crewRequired: value.mixing_crew_size,
    assignedPeople: value.assigned_people,
    staffingReady,
    timeBasedBatchesPerDay,
    committedBatchesPerDay,
    stretchBatchesPerDay,
    committedMixingDays: committedBatchesPerDay
      ? Math.ceil(value.required_batches / committedBatchesPerDay) : null,
    stretchMixingDays: stretchBatchesPerDay
      ? Math.ceil(value.required_batches / stretchBatchesPerDay) : null,
    totalMixerMinutes: value.required_batches * value.mixing_minutes_per_batch,
  };
}
