alter table public.workforce_work_queue_items
  drop constraint workforce_work_queue_items_linked_task_type_check,
  add constraint workforce_work_queue_items_linked_task_type_check check (
    linked_task_type is null or linked_task_type in (
      'purchase_draft', 'purchase_order', 'purchase_receipt', 'order', 'production_plan',
      'planned_spice_preparation', 'planned_mixer_batch', 'production_lot',
      'packaging_run', 'shipment_fulfillment', 'plant_operations'
    )
  );
