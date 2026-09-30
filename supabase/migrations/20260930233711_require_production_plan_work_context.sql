create or replace function public.get_workforce_work_context(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  result jsonb;
begin
  if requested_facility is null or requested_start is null or requested_end is null
    or requested_end <= requested_start then raise exception 'Invalid work context range'; end if;
  if not public.has_permission('workforce.read') then raise exception 'Workforce access required'; end if;
  if requested_facility is distinct from public.current_facility() then raise exception 'Plant unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('type', item.type, 'id', item.id,
    'production_plan_id', item.production_plan_id, 'label', item.label) order by item.label, item.id), '[]'::jsonb)
  into result from (
    select 'purchase_draft'::text type, d.id, d.material_plan_id production_plan_id,
      'Expected PO ' || coalesce(nullif(d.reference, ''), left(d.id::text, 8)) || ' · ' || d.expected_on label
    from public.purchase_drafts d where d.organization_id=public.current_org()
      and d.facility_id=requested_facility and d.material_plan_id is not null
      and d.status in ('Draft', 'Confirmed')
      and d.expected_on >= requested_start and d.expected_on < requested_end
    union all
    select 'order'::text type, o.id, o.id production_plan_id,
      'Pickup ' || coalesce(nullif(o.reference, ''), left(o.id::text, 8)) || ' · ' || o.needed_on label
    from public.customer_orders o where o.organization_id=public.current_org()
      and o.facility_id=requested_facility and o.needed_on >= requested_start and o.needed_on < requested_end
  ) item;
  return result;
end $$;
