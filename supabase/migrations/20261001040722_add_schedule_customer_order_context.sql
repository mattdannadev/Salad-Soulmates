begin;

-- Workforce scheduling needs an order-centric, read-only view of the existing
-- customer order pickup commitments. The same workforce-read authorization used
-- by the schedule avoids exposing this helper outside the scheduling workspace.
create function public.get_schedule_customer_orders(payload jsonb) returns jsonb
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
    'needed_on', customer_order.needed_on
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
    and customer_order.needed_on >= requested_start
    and customer_order.needed_on < requested_end;

  return result;
end $$;

revoke all on function public.get_schedule_customer_orders(jsonb) from public, anon;
grant execute on function public.get_schedule_customer_orders(jsonb) to authenticated;

commit;
