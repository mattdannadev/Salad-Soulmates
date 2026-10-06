begin;

create function public.holding_tank_available_gallons(requested_session_id uuid) returns numeric
language sql stable security invoker set search_path = '' as $$
  select coalesce((select sum(transfer.transferred_quantity)
    from public.production_batch_holding_tank_transfers transfer
    where transfer.holding_tank_session_id = requested_session_id), 0)
    - coalesce((select sum(output.pouch_count * run.pouch_size_gallons_snapshot)
      from public.packaging_run_outputs output
      join public.packaging_runs run on run.id = output.packaging_run_id
      where run.holding_tank_session_id = requested_session_id), 0)
$$;

create function public.open_holding_tank_session(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_tank_id uuid := (payload->>'tank_equipment_id')::uuid;
declare requested_product_id uuid := (payload->>'product_id')::uuid;
declare tank public.equipment%rowtype;
begin
  if not public.has_permission('production.mobile') then raise exception 'Production execution permission required'; end if;
  if requested_id is null or requested_tank_id is null or requested_product_id is null then
    raise exception 'Choose a tank and product before opening a holding session';
  end if;
  select * into tank from public.equipment where organization_id=public.current_org()
    and facility_id=public.current_facility() and id=requested_tank_id for update;
  if tank.id is null or tank.equipment_type <> 'tank' or tank.status <> 'active'
    or tank.usable_capacity is null or tank.usable_capacity_uom <> 'gal' then
    raise exception 'Choose an active gallon-capacity holding tank';
  end if;
  if not exists(select 1 from public.products where organization_id=public.current_org()
    and id=requested_product_id and active) then raise exception 'Choose an active product'; end if;
  if exists(select 1 from public.holding_tank_sessions where organization_id=public.current_org()
    and facility_id=public.current_facility() and tank_equipment_id=requested_tank_id and state='open') then
    raise exception 'Close the current holding-tank session before opening another';
  end if;
  insert into public.holding_tank_sessions(id,tank_equipment_id,product_id,tank_code_snapshot,
    tank_name_snapshot,capacity_quantity_snapshot,capacity_uom_snapshot)
  values(requested_id,requested_tank_id,requested_product_id,tank.equipment_code,tank.display_name,
    tank.usable_capacity,tank.usable_capacity_uom);
  return requested_id;
end $$;

create function public.record_batch_holding_tank_transfer(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_batch_id uuid := (payload->>'production_batch_id')::uuid;
declare requested_session_id uuid := (payload->>'holding_tank_session_id')::uuid;
declare requested_quantity numeric := (payload->>'transferred_quantity')::numeric;
declare requested_key uuid := (payload->>'idempotency_key')::uuid;
declare batch public.production_batches%rowtype;
declare session public.holding_tank_sessions%rowtype;
declare transferred numeric;
begin
  if not public.has_permission('production.mobile') then raise exception 'Production execution permission required'; end if;
  if requested_id is null or requested_batch_id is null or requested_session_id is null
    or requested_key is null or requested_quantity is null or requested_quantity <= 0 then
    raise exception 'Choose a batch, holding session, quantity, and idempotency key';
  end if;
  select * into session from public.holding_tank_sessions where organization_id=public.current_org()
    and facility_id=public.current_facility() and id=requested_session_id for update;
  select * into batch from public.production_batches where organization_id=public.current_org()
    and facility_id=public.current_facility() and id=requested_batch_id for update;
  if session.id is null or session.state <> 'open' or batch.id is null or batch.product_id <> session.product_id
    or batch.state in ('not_started','cancelled','rejected') then
    raise exception 'Transfer requires an active matching batch and open holding session';
  end if;
  select coalesce(sum(transferred_quantity),0) into transferred
    from public.production_batch_holding_tank_transfers where production_batch_id=batch.id;
  if batch.expected_yield_uom <> 'gal' or batch.expected_yield_quantity is null
    or transferred + requested_quantity > batch.expected_yield_quantity then
    raise exception 'Transfer cannot exceed the batch expected gallon yield';
  end if;
  if public.holding_tank_available_gallons(session.id) + requested_quantity > session.capacity_quantity_snapshot then
    raise exception 'Transfer exceeds holding-tank capacity';
  end if;
  insert into public.production_batch_holding_tank_transfers(id,production_batch_id,holding_tank_session_id,
    transferred_quantity,transferred_uom,idempotency_key)
  values(requested_id,batch.id,session.id,requested_quantity,'gal',requested_key)
  on conflict (organization_id,facility_id,idempotency_key) do nothing;
  return requested_id;
end $$;

create function public.record_packaging_run_output(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_run_id uuid := (payload->>'packaging_run_id')::uuid;
declare requested_pouches integer := (payload->>'pouch_count')::integer;
declare requested_cases integer := nullif(payload->>'cases_count','')::integer;
declare requested_key uuid := (payload->>'idempotency_key')::uuid;
declare run public.packaging_runs%rowtype;
begin
  if not public.has_permission('production.mobile') then raise exception 'Production execution permission required'; end if;
  if requested_id is null or requested_run_id is null or requested_key is null or requested_pouches is null or requested_pouches <= 0 then
    raise exception 'Enter a positive pouch count and idempotency key';
  end if;
  select * into run from public.packaging_runs where organization_id=public.current_org()
    and facility_id=public.current_facility() and id=requested_run_id for update;
  if run.id is null or run.state <> 'in_progress' then raise exception 'Packaging run is unavailable'; end if;
  if public.holding_tank_available_gallons(run.holding_tank_session_id) < requested_pouches * run.pouch_size_gallons_snapshot then
    raise exception 'Pouch output exceeds available holding-tank bulk';
  end if;
  insert into public.packaging_run_outputs(id,packaging_run_id,pouch_count,cases_count,idempotency_key)
  values(requested_id,run.id,requested_pouches,requested_cases,requested_key)
  on conflict (organization_id,facility_id,idempotency_key) do nothing;
  return requested_id;
end $$;

create function public.start_packaging_run(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_session_id uuid := (payload->>'holding_tank_session_id')::uuid;
declare requested_equipment_id uuid := (payload->>'packaging_equipment_id')::uuid;
declare session public.holding_tank_sessions%rowtype;
declare equipment public.equipment%rowtype;
declare bag_size numeric;
declare profile_id uuid;
begin
  if not public.has_permission('production.mobile') then raise exception 'Production execution permission required'; end if;
  if requested_id is null or requested_session_id is null or requested_equipment_id is null then
    raise exception 'Choose a holding session and bagging equipment';
  end if;
  select * into session from public.holding_tank_sessions where organization_id=public.current_org()
    and facility_id=public.current_facility() and id=requested_session_id for update;
  select * into equipment from public.equipment where organization_id=public.current_org()
    and facility_id=public.current_facility() and id=requested_equipment_id for update;
  if session.id is null or session.state <> 'open' or equipment.id is null or equipment.status <> 'active'
    or equipment.equipment_type not in ('filler','packaging_line') then
    raise exception 'Choose an open holding session and active bagging equipment';
  end if;
  select product.bag_size_gallons into bag_size from public.products product
    where product.organization_id=session.organization_id and product.id=session.product_id;
  select profile.id into profile_id from public.packaging_profile_versions profile
    where profile.organization_id=session.organization_id and profile.product_id=session.product_id
      and profile.status='Approved' order by profile.version desc limit 1;
  if bag_size is null or bag_size <= 0 then raise exception 'Configure approved pouch size before packaging'; end if;
  insert into public.packaging_runs(id,holding_tank_session_id,packaging_equipment_id,product_id,
    pouch_size_gallons_snapshot,packaging_profile_version_id)
  values(requested_id,session.id,equipment.id,session.product_id,bag_size,profile_id);
  return requested_id;
end $$;

revoke all on function public.holding_tank_available_gallons(uuid), public.open_holding_tank_session(jsonb),
  public.record_batch_holding_tank_transfer(jsonb), public.start_packaging_run(jsonb), public.record_packaging_run_output(jsonb) from public, anon, authenticated;
grant execute on function public.holding_tank_available_gallons(uuid), public.open_holding_tank_session(jsonb),
  public.record_batch_holding_tank_transfer(jsonb), public.start_packaging_run(jsonb), public.record_packaging_run_output(jsonb) to authenticated;
commit;
