-- Keep customer-to-product filtering in the data layer so the scheduling UI never
-- has to infer commercial relationships from unrelated client data.
create function public.get_schedule_customer_products(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare requested_facility uuid := (payload->>'facility_id')::uuid;
begin
  if requested_facility is null or requested_facility is distinct from public.current_facility() then
    raise exception 'Plant unavailable';
  end if;
  if not public.has_permission('workforce.read') then raise exception 'Workforce access required'; end if;
  return coalesce((
    select jsonb_object_agg(item.customer_id::text, item.product_ids)
    from (
      select option_row.customer_id, jsonb_agg(distinct option_row.product_id) product_ids
      from public.customer_product_options option_row
      join public.customers customer on customer.id = option_row.customer_id
      where option_row.organization_id = public.current_org()
        and option_row.active and customer.active
      group by option_row.customer_id
    ) item
  ), '{}'::jsonb);
end $$;

revoke all on function public.get_schedule_customer_products(jsonb) from public, anon;
grant execute on function public.get_schedule_customer_products(jsonb) to authenticated;
