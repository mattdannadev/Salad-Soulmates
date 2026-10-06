begin;

-- Order snapshots retain quantity precision. Sum as numeric so legacy snapshot
-- values such as 1260.0000000000000000 remain valid scheduler rollups.
create or replace function public.get_schedule_customer_orders(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  result jsonb;
begin
  if not public.has_permission('workforce.read') then
    raise exception 'Workforce read permission required';
  end if;
  if requested_facility is distinct from public.current_facility() then
    raise exception 'Invalid facility scope';
  end if;
  if requested_end <= requested_start or requested_end > requested_start + 366 then
    raise exception 'Invalid schedule range';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', customer_order.id,
    'customer_id', customer_order.customer_id,
    'customer_name', customer_order.customer_name,
    'reference', customer_order.reference,
    'needed_on', customer_order.needed_on,
    'order_batch_count', coalesce((
      select sum((item.value->>'batch_count')::numeric)
      from jsonb_array_elements(customer_order.items) item
    ), 0),
    'case_count', coalesce((
      select sum((item.value->>'unit_count')::numeric)
      from jsonb_array_elements(customer_order.items) item
      where lower(coalesce(item.value->>'unit_name', '')) in ('case', 'cases')
    ), 0)
  ) order by customer_order.needed_on, customer_order.customer_name, customer_order.id), '[]'::jsonb)
  into result
  from public.customer_orders customer_order
  join public.material_plans material_plan
    on material_plan.organization_id = customer_order.organization_id
    and material_plan.facility_id = customer_order.facility_id
    and material_plan.id = customer_order.id
  where customer_order.organization_id = public.current_org()
    and customer_order.facility_id = requested_facility
    and material_plan.status <> 'Cancelled'
    and (
      (customer_order.needed_on >= requested_start and customer_order.needed_on < requested_end)
      or exists (
        select 1
        from public.workforce_schedule_events schedule_event
        where schedule_event.organization_id = customer_order.organization_id
          and schedule_event.facility_id = customer_order.facility_id
          and schedule_event.start_on < requested_end
          and schedule_event.end_on > requested_start
          and (
            schedule_event.production_plan_id = customer_order.id
            or (
              schedule_event.linked_task_type = 'order'
              and schedule_event.linked_task_id = customer_order.id
            )
          )
      )
    );

  return result;
end $$;

revoke all on function public.get_schedule_customer_orders(jsonb) from public, anon;
grant execute on function public.get_schedule_customer_orders(jsonb) to authenticated;

commit;
