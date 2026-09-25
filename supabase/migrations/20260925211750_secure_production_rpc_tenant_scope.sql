begin;

-- SECURITY DEFINER bypasses RLS. Keep every lookup and mutation inside the
-- caller's canonical organization/facility scope instead of trusting UUIDs.
create or replace function public.assign_production_lot(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor_organization_id uuid := public.current_org();
  actor_facility_id uuid := public.current_facility();
  requested_order uuid := (payload->>'order_id')::uuid;
  requested_product uuid := (payload->>'product_id')::uuid;
  requested_date date := (payload->>'assigned_on')::date;
  result uuid;
  plan public.order_production_plans%rowtype;
  expected_batches integer;
begin
  if not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write') then
    raise exception 'Production lot permission required';
  end if;
  if actor_organization_id is null or actor_facility_id is null then
    raise exception 'Production lot permission required';
  end if;
  if requested_order is null or requested_product is null or requested_date is null then
    raise exception 'Choose a product and facility production date';
  end if;
  select scoped_plan.* into plan
  from public.order_production_plans scoped_plan
  where scoped_plan.id=requested_order
    and scoped_plan.organization_id=actor_organization_id
    and scoped_plan.facility_id=actor_facility_id
  for update;
  if not found or plan.status <> 'Draft' then raise exception 'Save a draft production preparation before assigning lots'; end if;
  select count(*) into expected_batches
  from public.planned_mixer_batches batch
  where batch.order_id=requested_order
    and batch.product_id=requested_product
    and batch.organization_id=actor_organization_id
    and batch.facility_id=actor_facility_id;
  if expected_batches = 0 then raise exception 'Choose a product from this production plan'; end if;
  if exists(
    select 1 from public.planned_mixer_batches batch
    where batch.order_id=requested_order
      and batch.product_id=requested_product
      and batch.organization_id=actor_organization_id
      and batch.facility_id=actor_facility_id
      and batch.production_lot_id is not null
  ) then
    raise exception 'A production lot is already assigned for this product';
  end if;
  insert into public.production_lots(
    organization_id,facility_id,order_id,product_id,assigned_on,production_lot_code,
    planned_gallons,planned_batch_count
  ) values (
    actor_organization_id,actor_facility_id,requested_order,requested_product,requested_date,
    to_char(requested_date,'DDDYY'),expected_batches * 40,expected_batches
  ) returning id into result;
  update public.planned_mixer_batches batch set production_lot_id=result
  where batch.order_id=requested_order
    and batch.product_id=requested_product
    and batch.organization_id=actor_organization_id
    and batch.facility_id=actor_facility_id
    and batch.production_lot_id is null;
  if not found then raise exception 'Production lot assignment changed; reload before trying again'; end if;
  return result;
end $$;

create or replace function public.open_batch_worksheet(batch_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor_organization_id uuid := public.current_org();
  actor_facility_id uuid := public.current_facility();
  batch public.planned_mixer_batches%rowtype;
  result uuid;
begin
  if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
  if actor_organization_id is null or actor_facility_id is null then raise exception 'Production worksheet permission required'; end if;
  select scoped_batch.* into batch
  from public.planned_mixer_batches scoped_batch
  where scoped_batch.id=batch_id
    and scoped_batch.organization_id=actor_organization_id
    and scoped_batch.facility_id=actor_facility_id
    and exists(
      select 1 from public.production_lots lot
      where lot.id=scoped_batch.production_lot_id
        and lot.organization_id=actor_organization_id
        and lot.facility_id=actor_facility_id
    )
  for update;
  if batch.id is null or batch.production_lot_id is null then raise exception 'Choose an assigned production batch'; end if;
  select execution.id into result
  from public.batch_worksheet_executions execution
  where execution.planned_mixer_batch_id=batch.id
    and execution.organization_id=actor_organization_id
    and execution.facility_id=actor_facility_id;
  if result is not null then return result; end if;
  insert into public.batch_worksheet_executions(
    organization_id,facility_id,planned_mixer_batch_id,production_lot_id
  ) values (
    actor_organization_id,actor_facility_id,batch.id,batch.production_lot_id
  ) returning id into result;
  insert into public.batch_worksheet_lines(
    organization_id,facility_id,execution_id,recipe_line_id,ingredient_id,required_quantity,uom,sequence
  )
  select actor_organization_id,actor_facility_id,result,line.id,line.ingredient_id,
    line.normalized_quantity,line.normalized_uom,line.sequence
  from public.recipe_lines line
  where line.recipe_version_id=batch.recipe_version_id
    and line.organization_id=actor_organization_id
  order by line.sequence;
  if not found then raise exception 'Released recipe has no ingredient lines'; end if;
  return result;
end $$;

create or replace function public.record_batch_worksheet_usage(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor_organization_id uuid := public.current_org();
  actor_facility_id uuid := public.current_facility();
  request_id uuid := (payload->>'id')::uuid;
  line_id uuid := (payload->>'worksheet_line_id')::uuid;
  unit_id uuid := (payload->>'serialized_unit_id')::uuid;
  amount numeric := (payload->>'quantity')::numeric;
  prior public.batch_worksheet_source_usages%rowtype;
  line public.batch_worksheet_lines%rowtype;
  execution public.batch_worksheet_executions%rowtype;
  unit public.serialized_unit_balances%rowtype;
  allocated numeric;
  consumed numeric;
begin
  if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
  if actor_organization_id is null or actor_facility_id is null then raise exception 'Production worksheet permission required'; end if;
  if request_id is null or line_id is null or unit_id is null or amount is null or amount<=0 or amount<>round(amount,4) then raise exception 'Choose a package and a positive quantity with at most four decimals'; end if;
  select usage.* into prior
  from public.batch_worksheet_source_usages usage
  where usage.id=request_id
    and usage.organization_id=actor_organization_id
    and usage.facility_id=actor_facility_id;
  if prior.id is not null then
    if prior.worksheet_line_id=line_id and prior.serialized_unit_id=unit_id
      and prior.quantity=amount and prior.operator_id=auth.uid() then return prior.id; end if;
    raise exception 'Usage request is already in use with different values';
  end if;
  select scoped_line.* into line
  from public.batch_worksheet_lines scoped_line
  where scoped_line.id=line_id
    and scoped_line.organization_id=actor_organization_id
    and scoped_line.facility_id=actor_facility_id;
  select scoped_execution.* into execution
  from public.batch_worksheet_executions scoped_execution
  where scoped_execution.id=line.execution_id
    and scoped_execution.organization_id=actor_organization_id
    and scoped_execution.facility_id=actor_facility_id;
  if line.id is null or execution.id is null or execution.status<>'Open' then raise exception 'Choose an open worksheet line'; end if;
  perform 1 from public.serialized_units serialized_unit
  where serialized_unit.id=unit_id
    and serialized_unit.organization_id=actor_organization_id
    and serialized_unit.facility_id=actor_facility_id
  for update;
  select balance.* into unit
  from public.serialized_unit_balances balance
  where balance.id=unit_id
    and balance.organization_id=actor_organization_id
    and balance.facility_id=actor_facility_id;
  if unit.id is null then raise exception 'Package is not available in this facility'; end if;
  if unit.ingredient_id<>line.ingredient_id or unit.uom<>line.uom then raise exception 'Package does not match this ingredient line'; end if;
  if unit.availability<>'Available' or unit.source_lot='' then raise exception 'Package is held, expired, exhausted, or missing source-lot evidence'; end if;
  select coalesce(sum(usage.quantity)-sum(coalesce(correction.restored_quantity,0)),0) into allocated
  from public.batch_worksheet_source_usages usage
  left join public.batch_worksheet_usage_corrections correction
    on correction.usage_id=usage.id
    and correction.organization_id=actor_organization_id
    and correction.facility_id=actor_facility_id
  where usage.worksheet_line_id=line.id
    and usage.organization_id=actor_organization_id
    and usage.facility_id=actor_facility_id;
  select coalesce(sum(usage.quantity)-sum(coalesce(correction.restored_quantity,0)),0) into consumed
  from public.batch_worksheet_source_usages usage
  left join public.batch_worksheet_usage_corrections correction
    on correction.usage_id=usage.id
    and correction.organization_id=actor_organization_id
    and correction.facility_id=actor_facility_id
  where usage.serialized_unit_id=unit.id
    and usage.organization_id=actor_organization_id
    and usage.facility_id=actor_facility_id;
  if allocated+amount>line.required_quantity then raise exception 'Quantity exceeds the recipe line requirement'; end if;
  if amount>unit.remaining_quantity-consumed then raise exception 'Quantity exceeds the available package balance'; end if;
  insert into public.batch_worksheet_source_usages(
    id,organization_id,facility_id,worksheet_line_id,serialized_unit_id,source_lot,quantity
  ) values (
    request_id,actor_organization_id,actor_facility_id,line.id,unit.id,unit.source_lot,amount
  );
  return request_id;
end $$;

create or replace function public.complete_batch_worksheet(execution_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor_organization_id uuid := public.current_org();
  actor_facility_id uuid := public.current_facility();
  execution public.batch_worksheet_executions%rowtype;
begin
  if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
  if actor_organization_id is null or actor_facility_id is null then raise exception 'Production worksheet permission required'; end if;
  select scoped_execution.* into execution
  from public.batch_worksheet_executions scoped_execution
  where scoped_execution.id=execution_id
    and scoped_execution.organization_id=actor_organization_id
    and scoped_execution.facility_id=actor_facility_id
  for update;
  if execution.id is null then raise exception 'Choose an open worksheet'; end if;
  if execution.status='Complete' then return execution.id; end if;
  if exists(
    select 1
    from public.batch_worksheet_lines line
    left join lateral(
      select coalesce(sum(usage.quantity)-sum(coalesce(correction.restored_quantity,0)),0) quantity
      from public.batch_worksheet_source_usages usage
      left join public.batch_worksheet_usage_corrections correction
        on correction.usage_id=usage.id
        and correction.organization_id=actor_organization_id
        and correction.facility_id=actor_facility_id
      where usage.worksheet_line_id=line.id
        and usage.organization_id=actor_organization_id
        and usage.facility_id=actor_facility_id
    ) used on true
    where line.execution_id=execution.id
      and line.organization_id=actor_organization_id
      and line.facility_id=actor_facility_id
      and used.quantity<>line.required_quantity
  ) then raise exception 'Record the required quantity for every ingredient line before completing'; end if;
  update public.batch_worksheet_executions scoped_execution
  set status='Complete',completed_at=now()
  where scoped_execution.id=execution.id
    and scoped_execution.organization_id=actor_organization_id
    and scoped_execution.facility_id=actor_facility_id;
  return execution.id;
end $$;

commit;
