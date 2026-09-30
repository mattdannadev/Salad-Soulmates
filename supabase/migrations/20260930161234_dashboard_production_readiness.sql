begin;

create function public.dashboard_production_readiness() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_permission('orders.read') or not public.has_permission('planning.read') then
    raise exception 'Order and planning read permission required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', plan.id,
    'mixer_batches', counts.batch_count,
    'lots_assigned', counts.lot_count,
    'spice_open', counts.spice_open,
    'spice_complete', counts.spice_complete,
    'mixing_open', counts.mixing_open,
    'mixing_complete', counts.mixing_complete,
    'shipping_draft_exists', exists(select 1 from public.shipping_drafts draft
      where draft.organization_id=plan.organization_id and draft.facility_id=plan.facility_id
        and draft.order_id=plan.id)
  ) order by plan.start_on,plan.id), '[]'::jsonb) into result
  from public.order_production_plans plan
  cross join lateral (
    select count(batch.id)::integer batch_count,
      count(batch.production_lot_id)::integer lot_count,
      count(execution.id) filter (where execution.status='Open')::integer mixing_open,
      count(execution.id) filter (where execution.status='Complete')::integer mixing_complete,
      count(spice_execution.id) filter (where spice_execution.status='Open')::integer spice_open,
      count(spice_execution.id) filter (where spice_execution.status='Complete')::integer spice_complete
    from public.planned_mixer_batches batch
    left join public.batch_worksheet_executions execution on execution.planned_mixer_batch_id=batch.id
    left join public.planned_spice_preparations spice on spice.planned_mixer_batch_id=batch.id
    left join public.batch_worksheet_executions spice_execution on spice_execution.planned_mixer_batch_id=spice.planned_mixer_batch_id
    where batch.organization_id=plan.organization_id and batch.facility_id=plan.facility_id and batch.order_id=plan.id
  ) counts
  where plan.organization_id=public.current_org() and plan.facility_id=public.current_facility()
    and plan.status<>'Cancelled';
  return result;
end $$;

revoke all on function public.dashboard_production_readiness() from public, anon, authenticated;
grant execute on function public.dashboard_production_readiness() to authenticated;

commit;
