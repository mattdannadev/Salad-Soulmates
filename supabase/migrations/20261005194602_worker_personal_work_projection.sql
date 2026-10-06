begin;

-- Mobile workers need one assignment-scoped read model rather than access to
-- planner-wide schedules or the underlying operational tables. Claim rows are
-- the canonical assignment records; this projection never infers assignments
-- from a schedule event or from user-editable auth metadata.
create or replace function public.get_my_worker_work(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_start date;
  requested_end date;
  actor public.profiles%rowtype;
  facility public.facilities%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['start_on', 'end_on']
    or payload - array['start_on', 'end_on'] <> '{}'::jsonb
    or coalesce(payload->>'start_on', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(payload->>'end_on', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Choose a valid work date range';
  end if;

  requested_start := (payload->>'start_on')::date;
  requested_end := (payload->>'end_on')::date;
  if requested_end <= requested_start or requested_end > requested_start + 366 then
    raise exception 'Choose a work date range of 366 days or fewer';
  end if;

  select profile.* into actor
  from public.profiles profile
  where profile.id = auth.uid() and profile.active;
  if actor.id is null or not (
    public.has_permission('production.mobile')
    or public.has_permission('workforce.read')
  ) then
    raise exception 'Active worker profile required';
  end if;

  select plant.* into facility
  from public.facilities plant
  where plant.organization_id = actor.organization_id
    and plant.id = actor.facility_id
    and plant.active;
  if facility.id is null then raise exception 'Active facility required'; end if;

  return jsonb_build_object(
    'facility', jsonb_build_object(
      'id', facility.id,
      'name', facility.name,
      'timezone', facility.timezone
    ),
    'start_on', requested_start,
    'end_on', requested_end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', work.id,
        'work_on', work.work_on,
        'kind', work.kind,
        'title', work.title,
        'instructions', work.instructions,
        'status', work.status,
        'revision', work.revision,
        'start_at', work.start_at,
        'end_at', work.end_at,
        'all_day', work.all_day,
        'timezone', coalesce(work.timezone, facility.timezone),
        'location_label', work.location_label,
        'required_worker_count', work.required_worker_count,
        'batch_quota', work.batch_quota,
        'estimated_minutes', work.estimated_minutes,
        'linked_task_type', work.linked_task_type,
        'linked_task_id', work.linked_task_id,
        'assignment', jsonb_build_object(
          'source', my_claim.claim_source,
          'assigned_at', my_claim.claimed_at
        ),
        'customer', case when customer.id is null then null else jsonb_build_object(
          'id', customer.id,
          'name', customer.name
        ) end,
        'order', case when customer_order.id is null then null else jsonb_build_object(
          'id', customer_order.id,
          'reference', customer_order.reference,
          'needed_on', customer_order.needed_on
        ) end,
        'product', case when product.id is null then null else jsonb_build_object(
          'id', product.id,
          'name', product.name
        ) end,
        'batch_context', batch_context.items,
        'coworkers', coworkers.display_names
      ) order by work.work_on, work.start_at nulls last, work.title, work.id)
      from public.workforce_work_queue_claims my_claim
      join public.workforce_work_queue_items work
        on work.organization_id = my_claim.organization_id
        and work.facility_id = my_claim.facility_id
        and work.id = my_claim.queue_item_id
      left join lateral (
        select coalesce(
          case when work.linked_task_type in ('order', 'production_plan')
            then work.linked_task_id end,
          (select planned.order_id from public.planned_mixer_batches planned
            where work.linked_task_type = 'planned_mixer_batch'
              and planned.organization_id = work.organization_id
              and planned.facility_id = work.facility_id
              and planned.id = work.linked_task_id),
          (select planned.order_id
            from public.planned_spice_preparations preparation
            join public.planned_mixer_batches planned
              on planned.organization_id = preparation.organization_id
              and planned.facility_id = preparation.facility_id
              and planned.id = preparation.planned_mixer_batch_id
            where work.linked_task_type = 'planned_spice_preparation'
              and preparation.organization_id = work.organization_id
              and preparation.facility_id = work.facility_id
              and preparation.id = work.linked_task_id),
          (select lot.order_id from public.production_lots lot
            where work.linked_task_type = 'production_lot'
              and lot.organization_id = work.organization_id
              and lot.facility_id = work.facility_id
              and lot.id = work.linked_task_id),
          (select planned.order_id
            from public.production_batches batch
            join public.planned_mixer_batches planned
              on planned.organization_id = batch.organization_id
              and planned.facility_id = batch.facility_id
              and planned.id = batch.planned_mixer_batch_id
            where work.linked_task_type = 'production_batch'
              and batch.organization_id = work.organization_id
              and batch.facility_id = work.facility_id
              and batch.id = work.linked_task_id)
        ) id
      ) order_context on true
      left join public.customer_orders customer_order
        on customer_order.organization_id = work.organization_id
        and customer_order.facility_id = work.facility_id
        and customer_order.id = order_context.id
      left join public.customers customer
        on customer.organization_id = work.organization_id
        and customer.id = coalesce(work.customer_id, customer_order.customer_id)
      left join lateral (
        select coalesce(
          work.product_id,
          (select lot.product_id from public.production_lots lot
            where work.linked_task_type = 'production_lot'
              and lot.organization_id = work.organization_id
              and lot.facility_id = work.facility_id
              and lot.id = work.linked_task_id),
          (select planned.product_id from public.planned_mixer_batches planned
            where work.linked_task_type = 'planned_mixer_batch'
              and planned.organization_id = work.organization_id
              and planned.facility_id = work.facility_id
              and planned.id = work.linked_task_id),
          (select planned.product_id
            from public.planned_spice_preparations preparation
            join public.planned_mixer_batches planned
              on planned.organization_id = preparation.organization_id
              and planned.facility_id = preparation.facility_id
              and planned.id = preparation.planned_mixer_batch_id
            where work.linked_task_type = 'planned_spice_preparation'
              and preparation.organization_id = work.organization_id
              and preparation.facility_id = work.facility_id
              and preparation.id = work.linked_task_id),
          (select batch.product_id from public.production_batches batch
            where work.linked_task_type = 'production_batch'
              and batch.organization_id = work.organization_id
              and batch.facility_id = work.facility_id
              and batch.id = work.linked_task_id),
          (select run.product_id from public.packaging_runs run
            where work.linked_task_type = 'packaging_run'
              and run.organization_id = work.organization_id
              and run.facility_id = work.facility_id
              and run.id = work.linked_task_id)
        ) id
      ) product_context on true
      left join public.products product
        on product.organization_id = work.organization_id
        and product.id = product_context.id
      left join lateral (
        select coalesce(jsonb_agg(context.value order by context.sort_key), '[]'::jsonb) items
        from (
          select jsonb_build_object(
            'type', 'production_batch',
            'id', batch.id,
            'code', batch.run_code,
            'state', batch.state
          ) value, '1:' || batch.run_code sort_key
          from public.production_batches batch
          where batch.organization_id = work.organization_id
            and batch.facility_id = work.facility_id
            and (batch.work_order_id = work.id
              or (work.linked_task_type = 'production_batch' and batch.id = work.linked_task_id))
          union all
          select jsonb_build_object(
            'type', 'production_lot',
            'id', lot.id,
            'code', lot.production_lot_code,
            'state', lower(lot.status)
          ), '2:' || lot.production_lot_code
          from public.production_lots lot
          where work.linked_task_type = 'production_lot'
            and lot.organization_id = work.organization_id
            and lot.facility_id = work.facility_id
            and lot.id = work.linked_task_id
        ) context
      ) batch_context on true
      left join lateral (
        select coalesce(jsonb_agg(profile.display_name order by profile.display_name), '[]'::jsonb)
          display_names
        from public.workforce_work_queue_claims claim
        join public.profiles profile
          on profile.id = claim.worker_id
          and profile.organization_id = claim.organization_id
          and profile.facility_id = claim.facility_id
          and profile.active
        where claim.organization_id = work.organization_id
          and claim.facility_id = work.facility_id
          and claim.queue_item_id = work.id
          and claim.worker_id <> actor.id
      ) coworkers on true
      where my_claim.organization_id = actor.organization_id
        and my_claim.facility_id = actor.facility_id
        and my_claim.worker_id = actor.id
        and work.work_on >= requested_start
        and work.work_on < requested_end
        and work.publication_state = 'published'
        and work.status <> 'cancelled'
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_my_worker_work(jsonb) from public, anon, authenticated;
grant execute on function public.get_my_worker_work(jsonb) to authenticated;

comment on function public.get_my_worker_work(jsonb) is
  'Assignment-scoped worker calendar/list projection over canonical work orders and claims.';

commit;
