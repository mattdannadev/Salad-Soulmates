create function public.get_schedule_batch_context(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare requested_facility uuid := (payload->>'facility_id')::uuid;
begin
  if requested_facility is null or requested_facility is distinct from public.current_facility() then raise exception 'Plant unavailable'; end if;
  if not public.has_permission('workforce.read') then raise exception 'Workforce access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('type', item.type, 'id', item.id,
    'production_plan_id', item.production_plan_id, 'label', item.label) order by item.label, item.id)
    from (
      select 'planned_mixer_batch'::text type, batch.id, batch.order_id production_plan_id,
        'Batch ' || batch.sequence || ' · Lot ' || coalesce(lot.production_lot_code, 'unassigned') || ' · ' || coalesce(product.name, 'product') label
      from public.planned_mixer_batches batch
      left join public.production_lots lot on lot.id = batch.production_lot_id
      left join public.products product on product.id = batch.product_id
      where batch.organization_id = public.current_org() and batch.facility_id = requested_facility
      union all
      select 'planned_spice_preparation', prep.id, batch.order_id,
        'Spice prep · Batch ' || batch.sequence || ' · Lot ' || coalesce(lot.production_lot_code, 'unassigned') || ' · ' || coalesce(product.name, 'product')
      from public.planned_spice_preparations prep
      join public.planned_mixer_batches batch on batch.id = prep.planned_mixer_batch_id
      left join public.production_lots lot on lot.id = batch.production_lot_id
      left join public.products product on product.id = batch.product_id
      where prep.organization_id = public.current_org() and prep.facility_id = requested_facility
      union all
      select 'production_lot', lot.id, lot.order_id,
        'Lot ' || lot.production_lot_code || ' · ' || product.name
      from public.production_lots lot join public.products product on product.id = lot.product_id
      where lot.organization_id = public.current_org() and lot.facility_id = requested_facility and lot.status = 'Assigned'
    ) item), '[]'::jsonb);
end $$;

revoke all on function public.get_schedule_batch_context(jsonb) from public, anon;
grant execute on function public.get_schedule_batch_context(jsonb) to authenticated;
