import { z } from 'zod';

/** A cumulative, date-aware estimate; drafts never count as available supply. */
export const demandCoverageSchema = z.object({
  ingredientId: z.uuid(),
  name: z.string(),
  uom: z.string(),
  demand: z.number().nonnegative(),
  usable: z.number().finite(),
  inbound: z.number().nonnegative(),
  shortage: z.number().nonnegative(),
  neededOn: z.iso.date(),
  planId: z.uuid(),
  demandByDate: z.number().nonnegative(),
  supplyDate: z.iso.date(),
});
export type DemandCoverage = z.infer<typeof demandCoverageSchema>;
export const purchaseGenerationSchema = z.object({
  created: z.array(z.uuid()),
  skipped: z.array(z.object({ ingredient: z.string(), reason: z.string() })),
});
export type PurchaseGeneration = z.infer<typeof purchaseGenerationSchema>;
