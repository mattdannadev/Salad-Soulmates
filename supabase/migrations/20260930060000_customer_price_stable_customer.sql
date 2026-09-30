begin;

-- Customer price options attach to an existing customer identity. Display-name
-- changes must never select or create a different customer during a price save.
create or replace function public.save_customer_product_option(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid := (payload->>'id')::uuid;
  prior public.customer_product_options%rowtype;
  customer uuid := (payload->>'customer_id')::uuid;
  expected integer := (payload->>'revision')::integer;
  preferred boolean := false;
  existing boolean := false;
begin
  if not public.has_permission('products.write') or not public.has_permission('products.read') then
    raise exception 'Product write permission required'; end if;
  if requested_id is null or customer is null or expected is null or expected<0 then
    raise exception 'Invalid option request'; end if;
  if not exists(
    select 1 from public.customers
    where organization_id=public.current_org() and id=customer
  ) then raise exception 'Choose a customer'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0));
  preferred := coalesce((payload->>'is_preferred')::boolean, false);
  select * into prior from public.customer_product_options where id=requested_id for update;
  if found then
    existing := true;
    if prior.revision=expected+1 and prior.customer_id=customer
      and prior.product_id=(payload->>'product_id')::uuid and prior.label=trim(payload->>'label')
      and prior.packaging_mode=payload->>'packaging_mode'
      and prior.unit_price=(payload->>'unit_price')::numeric
      and prior.currency=payload->>'currency' and prior.active=(payload->>'active')::boolean
      and prior.is_preferred=preferred
      and (prior.packaging_mode='product_default' or (prior.unit_name=trim(payload->>'unit_name')
        and prior.gallons_per_unit=(payload->>'gallons_per_unit')::numeric)) then
      return prior.id; end if;
    if prior.revision<>expected or prior.customer_id<>customer
      or prior.product_id<>(payload->>'product_id')::uuid then
      raise exception 'Customer option changed; reload before trying again'; end if;
  else
    if expected<>0 then raise exception 'Customer option not found'; end if;
    if not exists(select 1 from public.customer_product_options
      where customer_id=customer and product_id=(payload->>'product_id')::uuid and active) then
      preferred := true;
    end if;
  end if;
  if preferred then
    update public.customer_product_options set is_preferred=false, revision=revision+1
      where customer_id=customer and product_id=(payload->>'product_id')::uuid
        and active and is_preferred and id<>requested_id;
  end if;
  if existing then
    update public.customer_product_options set label=trim(payload->>'label'),
      packaging_mode=payload->>'packaging_mode',unit_name=trim(payload->>'unit_name'),
      gallons_per_unit=(payload->>'gallons_per_unit')::numeric,
      unit_price=(payload->>'unit_price')::numeric,
      currency=payload->>'currency',active=(payload->>'active')::boolean,is_preferred=preferred,
      revision=revision+1 where id=requested_id;
  else
    insert into public.customer_product_options(
      id,customer_id,product_id,label,packaging_mode,unit_name,gallons_per_unit,
      unit_price,currency,active,is_preferred
    ) values(
      requested_id,customer,(payload->>'product_id')::uuid,trim(payload->>'label'),
      payload->>'packaging_mode',trim(payload->>'unit_name'),
      (payload->>'gallons_per_unit')::numeric,(payload->>'unit_price')::numeric,
      payload->>'currency',(payload->>'active')::boolean,preferred
    );
  end if;
  return requested_id;
end $$;

revoke all on function public.save_customer_product_option(jsonb) from public,anon,authenticated;
grant execute on function public.save_customer_product_option(jsonb) to authenticated;

commit;
