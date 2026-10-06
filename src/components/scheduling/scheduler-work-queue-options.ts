import { createWorkQueueItemSchema, workQueueKinds } from '@/domain/work-queue';

// Maintenance requires equipment context, which this planner's source does not yet provide.
export const schedulerWorkQueueKindSchema = createWorkQueueItemSchema.shape.kind
  .exclude(['maintenance']);
export const schedulerWorkQueueKinds = schedulerWorkQueueKindSchema.options;

export const schedulerWorkQueueContextTypes: Record<
  (typeof workQueueKinds)[number], readonly string[]
> = {
  receiving: ['purchase_draft', 'purchase_order', 'purchase_receipt'],
  ingredient_prep: ['production_plan', 'planned_spice_preparation'],
  mixing: ['production_plan', 'planned_mixer_batch'],
  packaging: ['production_lot'],
  maintenance: ['equipment'],
  shipment_loading: ['order'],
  pre_op: ['production_plan', 'production_lot'],
  post_op: ['production_plan', 'production_lot'],
  cleaning: [],
  other: [],
};
