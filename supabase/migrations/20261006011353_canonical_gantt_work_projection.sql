begin;

-- The planning board is a package/work-order editor.  Its source is not the
-- legacy schedule-event table: packages provide the evolving commitment and
-- queue items are the executable leaves.
create function public.get_workforce_package_plan(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_facility uuid;
  requested_start date;
  requested_end date;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['facility_id', 'start_on', 'end_on']
    or payload - array['facility_id', 'start_on', 'end_on'] <> '{}'::jsonb
    or coalesce(payload->>'facility_id', '') !~ '^[0-9a-fA-F-]{36}$'
    or coalesce(payload->>'start_on', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(payload->>'end_on', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Choose a valid planning range';
  end if;
  requested_facility := (payload->>'facility_id')::uuid;
  requested_start := (payload->>'start_on')::date;
  requested_end := (payload->>'end_on')::date;
  if requested_end <= requested_start or requested_end > requested_start + 366 then
    raise exception 'Choose a planning range of 366 days or fewer';
  end if;
  if requested_facility <> public.current_facility()
    or not public.has_permission('workforce.read') then
    raise exception 'Facility planning access required';
  end if;

  return jsonb_build_object(
    'start_on', requested_start,
    'end_on', requested_end,
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', package.id,
        'type', package.package_type,
        'title', package.title,
        'status', package.status,
        'source_type', package.source_type,
        'source_id', package.source_id,
        'work_orders', package_items.items
      ) order by package.title, package.id)
      from public.work_packages package
      join lateral (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', work.id,
          'work_on', work.work_on,
          'kind', work.kind,
          'title', work.title,
          'status', work.status,
          'start_at', work.start_at,
          'end_at', work.end_at,
          'all_day', work.all_day,
          'required_worker_count', work.required_worker_count,
          'estimated_minutes', work.estimated_minutes,
          'linked_task_type', work.linked_task_type,
          'linked_task_id', work.linked_task_id,
          'customer', case when customer.id is null then null else jsonb_build_object('id', customer.id, 'name', customer.name) end,
          'order', case when customer_order.id is null then null else jsonb_build_object('id', customer_order.id, 'reference', customer_order.reference, 'needed_on', customer_order.needed_on) end,
          'product', case when product.id is null then null else jsonb_build_object('id', product.id, 'name', product.name) end,
          'batch_number', planned.sequence
        ) order by work.work_on, planned.sequence nulls last, work.title, work.id), '[]'::jsonb) as items
        from public.workforce_work_queue_items work
        left join public.planned_mixer_batches planned
          on planned.organization_id = work.organization_id
          and planned.facility_id = work.facility_id
          and ((work.linked_task_type = 'planned_mixer_batch' and planned.id = work.linked_task_id)
            or (work.linked_task_type = 'planned_spice_preparation' and exists (
              select 1 from public.planned_spice_preparations preparation
              where preparation.organization_id = work.organization_id
                and preparation.facility_id = work.facility_id
                and preparation.id = work.linked_task_id
                and preparation.planned_mixer_batch_id = planned.id
            )))
        left join public.customer_orders customer_order
          on customer_order.organization_id = work.organization_id
          and customer_order.facility_id = work.facility_id
          and customer_order.id = coalesce(
            case when work.linked_task_type = 'order' then work.linked_task_id end,
            planned.order_id
          )
        left join public.customers customer
          on customer.organization_id = work.organization_id
          and customer.id = coalesce(work.customer_id, customer_order.customer_id)
        left join public.products product
          on product.organization_id = work.organization_id
          and product.id = coalesce(work.product_id, planned.product_id)
        where work.organization_id = package.organization_id
          and work.facility_id = package.facility_id
          and work.work_package_id = package.id
          and work.work_on >= requested_start and work.work_on < requested_end
          and work.status <> 'cancelled'
      ) package_items on jsonb_array_length(package_items.items) > 0
      where package.organization_id = public.current_org()
        and package.facility_id = requested_facility
        and package.status = 'open'
    ), '[]'::jsonb),
    'unpackaged_work_orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', work.id, 'work_on', work.work_on, 'kind', work.kind, 'title', work.title
      ) order by work.work_on, work.title, work.id)
      from public.workforce_work_queue_items work
      where work.organization_id = public.current_org()
        and work.facility_id = requested_facility
        and work.work_package_id is null
        and work.work_on >= requested_start and work.work_on < requested_end
        and work.status <> 'cancelled'
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_workforce_package_plan(jsonb) from public, anon;
grant execute on function public.get_workforce_package_plan(jsonb) to authenticated;
comment on function public.get_workforce_package_plan(jsonb) is
  'Planner-scoped canonical work-package and executable-work-order projection for Bryntum Gantt.';
notify pgrst, 'reload schema';
commit;
