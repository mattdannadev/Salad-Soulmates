begin;

-- The existing worksheet is the paired spice preparation for its mixer batch.
-- A usage records the operator's source-lot choice; completion posts the debit.
alter table public.batch_worksheet_executions add column planned_spice_preparation_id uuid;
alter table public.planned_spice_preparations add constraint planned_spice_preparations_scope_unique unique(organization_id,facility_id,id);
update public.batch_worksheet_executions execution set planned_spice_preparation_id=spice.id
  from public.planned_spice_preparations spice where spice.planned_mixer_batch_id=execution.planned_mixer_batch_id;
alter table public.batch_worksheet_executions alter column planned_spice_preparation_id set not null;
alter table public.batch_worksheet_executions add constraint worksheet_spice_scope
  foreign key(organization_id,facility_id,planned_spice_preparation_id)
  references public.planned_spice_preparations(organization_id,facility_id,id);
create unique index worksheet_one_spice on public.batch_worksheet_executions(planned_spice_preparation_id);

create table public.spice_preparation_consumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  execution_id uuid not null,
  usage_id uuid not null unique,
  serialized_unit_id uuid not null,
  ingredient_id uuid not null,
  source_lot text not null check(length(trim(source_lot))>0),
  quantity numeric(14,4) not null check(quantity>0),
  consumed_by uuid not null default auth.uid() references auth.users,
  consumed_at timestamptz not null default now(),
  unique(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,execution_id) references public.batch_worksheet_executions(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,usage_id) references public.batch_worksheet_source_usages(organization_id,facility_id,id),
  foreign key(organization_id,serialized_unit_id) references public.serialized_units(organization_id,id),
  foreign key(organization_id,ingredient_id) references public.ingredients(organization_id,id)
);
alter table public.spice_preparation_consumptions enable row level security;
revoke all on public.spice_preparation_consumptions from public,anon,authenticated;
grant select on public.spice_preparation_consumptions to authenticated;
create policy spice_consumption_read on public.spice_preparation_consumptions for select to authenticated
  using(organization_id=public.current_org() and facility_id=public.current_facility() and public.has_permission('production.mobile'));
create trigger spice_consumption_audit after insert on public.spice_preparation_consumptions
  for each row execute function public.audit_change();
alter table public.serialized_unit_events add column spice_consumption_id uuid unique references public.spice_preparation_consumptions(id);

-- Inventory controls added manual event types after the original locking guard.
-- Keep the ingredient row locked through the posting transaction so changing its
-- base unit cannot race the first inventory event. Worker consumption is allowed
-- only through its linked package event; direct inserts still obey inventory RLS.
create or replace function public.validate_inventory() returns trigger
language plpgsql security definer set search_path='' as $$
declare ingredient_unit text; worker_consumption boolean := false;
begin
  if auth.uid() is null or new.created_by is distinct from auth.uid() then
    raise exception 'Invalid inventory actor';
  end if;
  if new.organization_id is distinct from public.current_org()
    or new.facility_id is distinct from public.current_facility() then
    raise exception 'Invalid inventory organization or facility';
  end if;
  if new.event_type='OrderUsage' and new.serialized_unit_event_id is not null then
    select exists(select 1 from public.serialized_unit_events event
      where event.id=new.serialized_unit_event_id
        and event.organization_id=new.organization_id
        and event.facility_id=new.facility_id
        and event.created_by=auth.uid()
        and event.spice_consumption_id is not null) into worker_consumption;
  end if;
  if not public.has_permission(case
    when new.event_type='Receipt' then 'inventory.receive'
    when worker_consumption then 'production.mobile'
    else 'inventory.adjust' end) then
    raise exception 'Inventory permission required';
  end if;
  select default_uom into ingredient_unit from public.ingredients
    where id=new.ingredient_id and organization_id=new.organization_id for share;
  if ingredient_unit is null or new.uom is distinct from ingredient_unit then
    raise exception 'Inventory unit must match ingredient base unit';
  end if;
  if new.event_type='OpeningBalance' and new.quantity_delta<0 then
    raise exception 'Opening balance must be positive';
  end if;
  if new.event_type='ManualGain' and new.quantity_delta<=0 then
    raise exception 'Manual gain must be positive';
  end if;
  if new.event_type in ('ManualShrink','OrderUsage') and new.quantity_delta>=0 then
    raise exception 'Inventory shrink and order usage must be negative';
  end if;
  if new.event_type='Receipt' and new.quantity_delta<=0 then
    raise exception 'Receipt must be positive';
  end if;
  return new;
end $$;
revoke execute on function public.validate_inventory() from public,anon,authenticated;

-- Physical spice consumption is an order usage; other package adjustments retain
-- their existing ledger classification.
create or replace function public.post_serialized_unit_delta() returns trigger
language plpgsql security invoker set search_path='' as $$
declare unit public.serialized_unit_balances%rowtype;
begin
  if new.quantity_delta<>0 then
    select * into unit from public.serialized_unit_balances where id=new.unit_id;
    insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,serialized_unit_event_id)
      values(unit.ingredient_id,case when new.spice_consumption_id is null then 'Adjustment' else 'OrderUsage' end,
        new.quantity_delta,unit.uom,new.reason,new.id,new.id);
  end if;
  return new;
end $$;

create or replace function public.guard_serialized_ledger() returns trigger
language plpgsql security invoker set search_path='' as $$
declare event public.serialized_unit_events%rowtype; unit public.serialized_unit_balances%rowtype;
begin
  if new.serialized_unit_event_id is null then return new; end if;
  select * into event from public.serialized_unit_events where id=new.serialized_unit_event_id;
  select * into unit from public.serialized_unit_balances where id=event.unit_id;
  if event.id is null or event.created_by is distinct from auth.uid()
    or new.event_type is distinct from (case when event.spice_consumption_id is null then 'Adjustment' else 'OrderUsage' end)
    or new.receipt_line_id is not null or new.quantity_delta is distinct from event.quantity_delta
    or new.ingredient_id is distinct from unit.ingredient_id or new.uom is distinct from unit.uom
    or new.reason_note is distinct from event.reason
    or new.request_id is distinct from event.id then raise exception 'Ledger entry must match its package event'; end if;
  return new;
end $$;

create or replace function public.guard_serialized_unit_event() returns trigger
language plpgsql security invoker set search_path='' as $$
declare unit public.serialized_units%rowtype; current_balance public.serialized_unit_balances%rowtype;
  consumption public.spice_preparation_consumptions%rowtype;
begin
  if new.spice_consumption_id is null then
    if not public.has_permission('inventory.adjust') then raise exception 'Inventory adjustment permission required'; end if;
  else
    if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
    select * into consumption from public.spice_preparation_consumptions where id=new.spice_consumption_id;
    if consumption.id is null or consumption.consumed_by is distinct from auth.uid()
      or consumption.serialized_unit_id is distinct from new.unit_id
      or new.remaining_quantity is distinct from
        (select remaining_quantity-consumption.quantity from public.serialized_unit_balances where id=new.unit_id)
      or new.status<>'Available' or new.reason<>'Spice preparation consumption' then
      raise exception 'Spice consumption must match the recorded package usage';
    end if;
  end if;
  if new.created_by is distinct from auth.uid()
    or new.organization_id is distinct from public.current_org()
    or new.facility_id is distinct from public.current_facility() then
    raise exception 'Inventory operation permission required';
  end if;
  select * into unit from public.serialized_units where id=new.unit_id for update;
  if not found then raise exception 'Package not found in this facility'; end if;
  select * into current_balance from public.serialized_unit_balances where id=unit.id;
  if new.expected_revision<>current_balance.revision then raise exception 'Package changed; reload before trying again'; end if;
  if new.remaining_quantity>unit.initial_quantity then raise exception 'Remaining quantity cannot exceed the original package quantity'; end if;
  if new.remaining_quantity=current_balance.remaining_quantity and new.status=current_balance.status then raise exception 'No package change was entered'; end if;
  new.created_at := now();
  new.quantity_delta := new.remaining_quantity-current_balance.remaining_quantity;
  return new;
end $$;

-- A pending worksheet allocation reduces what another open worksheet may claim.
-- After completion, the serialized balance includes the actual debit.
create or replace function public.record_batch_worksheet_usage(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid := (payload->>'id')::uuid; line_id uuid := (payload->>'worksheet_line_id')::uuid; unit_id uuid := (payload->>'serialized_unit_id')::uuid; amount numeric := (payload->>'quantity')::numeric;
 prior public.batch_worksheet_source_usages%rowtype; line public.batch_worksheet_lines%rowtype; execution public.batch_worksheet_executions%rowtype; unit public.serialized_unit_balances%rowtype; allocated numeric; reserved numeric;
begin
 if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
 if request_id is null or line_id is null or unit_id is null or amount is null or amount<=0 or amount<>round(amount,4) then raise exception 'Choose a package and a positive quantity with at most four decimals'; end if;
 select * into prior from public.batch_worksheet_source_usages where id=request_id
   and organization_id=public.current_org() and facility_id=public.current_facility();
 if prior.id is not null then if prior.worksheet_line_id=line_id and prior.serialized_unit_id=unit_id and prior.quantity=amount and prior.operator_id=auth.uid() then return prior.id; end if; raise exception 'Usage request is already in use with different values'; end if;
 select * into line from public.batch_worksheet_lines where id=line_id
   and organization_id=public.current_org() and facility_id=public.current_facility();
 select * into execution from public.batch_worksheet_executions where id=line.execution_id
   and organization_id=public.current_org() and facility_id=public.current_facility() for update;
 if line.id is null or execution.id is null or execution.status<>'Open'
   or execution.organization_id<>public.current_org() or execution.facility_id<>public.current_facility()
   then raise exception 'Choose an open worksheet line'; end if;
 perform 1 from public.serialized_units where id=unit_id
   and organization_id=public.current_org() and facility_id=public.current_facility() for update;
 select * into unit from public.serialized_unit_balances where id=unit_id
   and organization_id=public.current_org() and facility_id=public.current_facility();
 if unit.id is null or unit.facility_id<>execution.facility_id then raise exception 'Package is not available in this facility'; end if;
 if unit.ingredient_id<>line.ingredient_id or unit.uom<>line.uom then raise exception 'Package does not match this ingredient line'; end if;
 if unit.availability<>'Available' or unit.source_lot='' then raise exception 'Package is held, expired, exhausted, or missing source-lot evidence'; end if;
 if not exists(select 1 from public.planned_mixer_batches batch
   join public.order_production_plans plan on plan.id=batch.order_id
   join public.production_lots lot on lot.id=batch.production_lot_id
   where batch.id=execution.planned_mixer_batch_id
     and batch.organization_id=public.current_org() and batch.facility_id=public.current_facility()
     and plan.organization_id=public.current_org() and plan.facility_id=public.current_facility()
     and lot.organization_id=public.current_org() and lot.facility_id=public.current_facility()
     and plan.status='Confirmed' and lot.status='Assigned' for share of plan,lot) then
   raise exception 'Production preparation is not confirmed and assigned'; end if;
 select coalesce(sum(usage.quantity-coalesce((select sum(c.restored_quantity) from public.batch_worksheet_usage_corrections c where c.usage_id=usage.id),0)),0)
   into allocated from public.batch_worksheet_source_usages usage where usage.worksheet_line_id=line.id
     and usage.organization_id=public.current_org() and usage.facility_id=public.current_facility();
 select coalesce(sum(usage.quantity-coalesce((select sum(c.restored_quantity) from public.batch_worksheet_usage_corrections c where c.usage_id=usage.id),0)),0) into reserved from public.batch_worksheet_source_usages usage
   join public.batch_worksheet_lines other_line on other_line.id=usage.worksheet_line_id
   join public.batch_worksheet_executions other_execution on other_execution.id=other_line.execution_id
   join public.planned_mixer_batches other_batch on other_batch.id=other_execution.planned_mixer_batch_id
   join public.order_production_plans other_plan on other_plan.id=other_batch.order_id
   where usage.serialized_unit_id=unit.id and usage.organization_id=public.current_org()
     and usage.facility_id=public.current_facility() and other_execution.status='Open'
     and other_plan.status='Confirmed';
 if allocated+amount>line.required_quantity then raise exception 'Quantity exceeds the recipe line requirement'; end if;
 if amount>unit.remaining_quantity-reserved then raise exception 'Quantity exceeds the available package balance'; end if;
 insert into public.batch_worksheet_source_usages(id,organization_id,facility_id,worksheet_line_id,serialized_unit_id,source_lot,quantity) values(request_id,execution.organization_id,execution.facility_id,line.id,unit.id,unit.source_lot,amount);
 return request_id;
end $$;

create or replace function public.open_batch_worksheet(batch_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare batch public.planned_mixer_batches%rowtype; spice public.planned_spice_preparations%rowtype; result uuid;
begin
 if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
 select * into batch from public.planned_mixer_batches where id=batch_id
   and organization_id=public.current_org() and facility_id=public.current_facility() for update;
 if batch.id is null or batch.production_lot_id is null
   or batch.organization_id<>public.current_org() or batch.facility_id<>public.current_facility()
   then raise exception 'Choose an assigned production batch'; end if;
 if not exists(select 1 from public.order_production_plans plan
   join public.production_lots lot on lot.id=batch.production_lot_id
   where plan.id=batch.order_id and plan.organization_id=public.current_org()
     and plan.facility_id=public.current_facility() and lot.organization_id=public.current_org()
     and lot.facility_id=public.current_facility() and plan.status='Confirmed'
     and lot.status='Assigned' for share of plan,lot)
   then raise exception 'Production preparation is not confirmed and assigned'; end if;
 select * into spice from public.planned_spice_preparations where planned_mixer_batch_id=batch.id
   and organization_id=public.current_org() and facility_id=public.current_facility();
 if spice.id is null then raise exception 'Choose the paired spice preparation'; end if;
 select id into result from public.batch_worksheet_executions where planned_mixer_batch_id=batch.id
   and organization_id=public.current_org() and facility_id=public.current_facility();
 if result is not null then return result; end if;
 insert into public.batch_worksheet_executions(organization_id,facility_id,planned_mixer_batch_id,planned_spice_preparation_id,production_lot_id)
   values(batch.organization_id,batch.facility_id,batch.id,spice.id,batch.production_lot_id) returning id into result;
 insert into public.batch_worksheet_lines(organization_id,facility_id,execution_id,recipe_line_id,ingredient_id,required_quantity,uom,sequence)
   select batch.organization_id,batch.facility_id,result,line.id,line.ingredient_id,line.normalized_quantity,line.normalized_uom,line.sequence from public.recipe_lines line where line.recipe_version_id=batch.recipe_version_id
     and line.organization_id=public.current_org() order by line.sequence;
 if not found then raise exception 'Released recipe has no ingredient lines'; end if;
 return result;
end $$;

create function public.correct_batch_worksheet_usage(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid := (payload->>'id')::uuid; usage_id uuid := (payload->>'usage_id')::uuid;
 amount numeric := (payload->>'restored_quantity')::numeric; explanation text := trim(coalesce(payload->>'reason',''));
 prior public.batch_worksheet_usage_corrections%rowtype; usage public.batch_worksheet_source_usages%rowtype;
 execution public.batch_worksheet_executions%rowtype; already_restored numeric;
begin
 if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
 if request_id is null or usage_id is null or amount is null or amount<=0 or amount<>round(amount,4)
   or length(explanation) not between 3 and 1000 then raise exception 'Enter a valid correction quantity and reason'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,3));
 select * into prior from public.batch_worksheet_usage_corrections where id=request_id
   and organization_id=public.current_org() and facility_id=public.current_facility();
 if prior.id is not null then
   if prior.usage_id=usage_id and prior.restored_quantity=amount and prior.reason=explanation
     and prior.corrected_by=auth.uid() then return prior.id; end if;
   raise exception 'Correction request is already in use with different values';
 end if;
 select * into usage from public.batch_worksheet_source_usages where id=usage_id
   and organization_id=public.current_org() and facility_id=public.current_facility();
 select e.* into execution from public.batch_worksheet_executions e
   join public.batch_worksheet_lines l on l.execution_id=e.id where l.id=usage.worksheet_line_id
     and e.organization_id=public.current_org() and e.facility_id=public.current_facility()
     and l.organization_id=public.current_org() and l.facility_id=public.current_facility() for update of e;
 if usage.id is null or execution.id is null or execution.status<>'Open'
   or execution.organization_id<>public.current_org() or execution.facility_id<>public.current_facility()
   then raise exception 'Choose an open worksheet usage'; end if;
 if not exists(select 1 from public.planned_mixer_batches batch
   join public.order_production_plans plan on plan.id=batch.order_id
   join public.production_lots lot on lot.id=batch.production_lot_id
   where batch.id=execution.planned_mixer_batch_id and batch.organization_id=public.current_org()
     and batch.facility_id=public.current_facility() and plan.organization_id=public.current_org()
     and plan.facility_id=public.current_facility() and lot.organization_id=public.current_org()
     and lot.facility_id=public.current_facility() and plan.status='Confirmed'
     and lot.status='Assigned' for share of plan,lot)
   then raise exception 'Production preparation is not confirmed and assigned'; end if;
 perform 1 from public.serialized_units where id=usage.serialized_unit_id
   and organization_id=public.current_org() and facility_id=public.current_facility() for update;
 select coalesce(sum(restored_quantity),0) into already_restored
   from public.batch_worksheet_usage_corrections where batch_worksheet_usage_corrections.usage_id=usage.id
     and organization_id=public.current_org() and facility_id=public.current_facility();
 if amount>usage.quantity-already_restored then raise exception 'Correction exceeds the recorded quantity'; end if;
 insert into public.batch_worksheet_usage_corrections(id,organization_id,facility_id,usage_id,restored_quantity,reason)
   values(request_id,execution.organization_id,execution.facility_id,usage.id,amount,explanation);
 return request_id;
end $$;
revoke all on function public.correct_batch_worksheet_usage(jsonb) from public,anon;
grant execute on function public.correct_batch_worksheet_usage(jsonb) to authenticated;

create or replace function public.complete_batch_worksheet(execution_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare execution public.batch_worksheet_executions%rowtype; consumed_usage record; balance public.serialized_unit_balances%rowtype; consumption_id uuid;
begin
 if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
 select * into execution from public.batch_worksheet_executions where id=execution_id
   and organization_id=public.current_org() and facility_id=public.current_facility() for update;
 if execution.id is null or execution.organization_id<>public.current_org()
   or execution.facility_id<>public.current_facility() then raise exception 'Choose an open worksheet'; end if;
 if execution.status='Complete' then return execution.id; end if;
 if not exists(select 1 from public.planned_mixer_batches batch
   join public.order_production_plans plan on plan.id=batch.order_id
   join public.production_lots lot on lot.id=batch.production_lot_id
   where batch.id=execution.planned_mixer_batch_id and batch.organization_id=public.current_org()
     and batch.facility_id=public.current_facility() and plan.organization_id=public.current_org()
     and plan.facility_id=public.current_facility() and lot.organization_id=public.current_org()
     and lot.facility_id=public.current_facility() and plan.status='Confirmed'
     and lot.status='Assigned' for share of plan,lot) then
   raise exception 'Production preparation is not confirmed and assigned'; end if;
 if exists(select 1 from public.batch_worksheet_lines line left join lateral(
   select coalesce(sum(usage.quantity-coalesce((select sum(c.restored_quantity) from public.batch_worksheet_usage_corrections c where c.usage_id=usage.id),0)),0) quantity
   from public.batch_worksheet_source_usages usage where usage.worksheet_line_id=line.id) used on true
   where line.execution_id=execution.id and line.organization_id=public.current_org()
     and line.facility_id=public.current_facility() and used.quantity<>line.required_quantity) then
   raise exception 'Record the required quantity for every ingredient line before completing'; end if;
 for consumed_usage in select u.*, l.ingredient_id,
   u.quantity-coalesce((select sum(c.restored_quantity) from public.batch_worksheet_usage_corrections c where c.usage_id=u.id),0) net_quantity
   from public.batch_worksheet_source_usages u
   join public.batch_worksheet_lines l on l.id=u.worksheet_line_id
   where l.execution_id=execution.id and l.organization_id=public.current_org()
     and l.facility_id=public.current_facility() and u.organization_id=public.current_org()
     and u.facility_id=public.current_facility() order by u.serialized_unit_id,u.id loop
   if consumed_usage.net_quantity<0 then raise exception 'Corrected quantity exceeds recorded usage'; end if;
   if consumed_usage.net_quantity=0 then continue; end if;
   perform 1 from public.serialized_units where id=consumed_usage.serialized_unit_id
     and organization_id=public.current_org() and facility_id=public.current_facility() for update;
   select * into balance from public.serialized_unit_balances where id=consumed_usage.serialized_unit_id
     and organization_id=public.current_org() and facility_id=public.current_facility();
   if balance.availability<>'Available' or balance.ingredient_id<>consumed_usage.ingredient_id
     or balance.source_lot is distinct from consumed_usage.source_lot or balance.remaining_quantity<consumed_usage.net_quantity then
     raise exception 'Package balance or source lot changed; review spice preparation';
   end if;
   insert into public.spice_preparation_consumptions(organization_id,facility_id,execution_id,usage_id,serialized_unit_id,ingredient_id,source_lot,quantity)
     values(execution.organization_id,execution.facility_id,execution.id,consumed_usage.id,consumed_usage.serialized_unit_id,consumed_usage.ingredient_id,consumed_usage.source_lot,consumed_usage.net_quantity) returning id into consumption_id;
   insert into public.serialized_unit_events(id,organization_id,facility_id,unit_id,expected_revision,remaining_quantity,status,reason,spice_consumption_id)
     values(gen_random_uuid(),execution.organization_id,execution.facility_id,consumed_usage.serialized_unit_id,balance.revision,balance.remaining_quantity-consumed_usage.net_quantity,'Available','Spice preparation consumption',consumption_id);
 end loop;
 update public.batch_worksheet_executions set status='Complete',completed_at=now() where id=execution.id
   and organization_id=public.current_org() and facility_id=public.current_facility();
 return execution.id;
end $$;

-- A single scoped read for the worker screen avoids granting the production
-- role broad access to orders, recipes, suppliers, or the inventory Data API.
create function public.worker_spice_preparations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
 select coalesce(jsonb_agg(to_jsonb(task) order by task.plan_start_on,task.production_lot_code,task.sequence),'[]'::jsonb)
 into result from (
   select batch.id planned_mixer_batch_id, spice.id planned_spice_preparation_id,
     batch.sequence,batch.target_gallons,product.name product_name,
     lot.id production_lot_id,lot.production_lot_code,lot.assigned_on,
     plan.start_on plan_start_on,plan.finish_on plan_finish_on,
     execution.id execution_id,coalesce(execution.status,'Not started') status,
     coalesce((select jsonb_agg(jsonb_build_object(
       'id',line.id,'ingredient_id',recipe_line.ingredient_id,'ingredient_name',ingredient.name,
       'required_quantity',recipe_line.normalized_quantity,'uom',recipe_line.normalized_uom,'sequence',recipe_line.sequence,
       'usages',coalesce((select jsonb_agg(jsonb_build_object('id',usage.id,'serialized_unit_id',usage.serialized_unit_id,
         'source_lot',usage.source_lot,'quantity',usage.quantity-coalesce((select sum(c.restored_quantity) from public.batch_worksheet_usage_corrections c where c.usage_id=usage.id),0)) order by usage.used_at,usage.id)
         from public.batch_worksheet_source_usages usage where usage.worksheet_line_id=line.id
         and usage.quantity>coalesce((select sum(c.restored_quantity) from public.batch_worksheet_usage_corrections c where c.usage_id=usage.id),0)),'[]'::jsonb),
       'packages',coalesce((select jsonb_agg(jsonb_build_object('id',unit.id,'internal_code',unit.internal_code,
         'source_lot',unit.source_lot,'remaining_quantity',unit.remaining_quantity,'availability',unit.availability)
         order by unit.expiration_date nulls last,unit.internal_code)
         from public.serialized_unit_balances unit where unit.ingredient_id=recipe_line.ingredient_id
         and unit.facility_id=batch.facility_id and unit.uom=recipe_line.normalized_uom and unit.availability='Available'
         and unit.source_lot<>''),'[]'::jsonb)) order by recipe_line.sequence)
       from public.recipe_lines recipe_line join public.ingredients ingredient on ingredient.id=recipe_line.ingredient_id
       left join public.batch_worksheet_lines line on line.recipe_line_id=recipe_line.id and line.execution_id=execution.id
       where recipe_line.recipe_version_id=batch.recipe_version_id),'[]'::jsonb) lines
   from public.planned_mixer_batches batch
   join public.planned_spice_preparations spice on spice.planned_mixer_batch_id=batch.id
   join public.order_production_plans plan on plan.id=batch.order_id
   join public.production_lots lot on lot.id=batch.production_lot_id
   join public.products product on product.id=batch.product_id
   left join public.batch_worksheet_executions execution on execution.planned_mixer_batch_id=batch.id
   where batch.organization_id=public.current_org() and batch.facility_id=public.current_facility()
     and plan.status='Confirmed' and lot.status='Assigned'
 ) task;
 return result;
end $$;
revoke all on function public.worker_spice_preparations() from public,anon;
grant execute on function public.worker_spice_preparations() to authenticated;

-- Trace lookups keep planned allocations visible while a preparation is open,
-- then switch to the immutable physical consumption edges at completion.
create view public.batch_worksheet_trace_edges with (security_invoker=true) as
select usage.id,usage.organization_id,usage.facility_id,usage.worksheet_line_id,
  usage.serialized_unit_id,usage.source_lot,usage.used_at,
  case when execution.status='Complete' then consumption.quantity
    else usage.quantity-coalesce(correction.restored_quantity,0) end as quantity
from public.batch_worksheet_source_usages usage
join public.batch_worksheet_lines line on line.id=usage.worksheet_line_id
join public.batch_worksheet_executions execution on execution.id=line.execution_id
left join public.spice_preparation_consumptions consumption on consumption.usage_id=usage.id
left join lateral(select sum(restored_quantity) restored_quantity
  from public.batch_worksheet_usage_corrections where usage_id=usage.id) correction on true
where (execution.status='Complete' and consumption.id is not null)
  or (execution.status='Open' and usage.quantity>coalesce(correction.restored_quantity,0));
revoke all on public.batch_worksheet_trace_edges from public,anon,authenticated;

create or replace function public.trace_production_lot(
  production_lot_filter uuid,page_number integer default 0,requested_page_size integer default 100
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page_size integer := greatest(1,least(coalesce(requested_page_size,100),200)); offset_rows integer; lot jsonb;
begin
 perform public.traceability_read_allowed();
 if production_lot_filter is null or page_number<0 then raise exception 'Choose a production lot and valid page'; end if;
 offset_rows := page_number*page_size;
 select jsonb_build_object('id',item.id,'product_id',item.product_id,'product_name',item.product_name,
   'production_lot_code',item.production_lot_code,'assigned_on',item.assigned_on,'status',item.status)
 into lot from (select production_lot.id,production_lot.product_id,product.name product_name,
   production_lot.production_lot_code,production_lot.assigned_on,production_lot.status
   from public.production_lots production_lot join public.products product on product.id=production_lot.product_id
   where production_lot.id=production_lot_filter and production_lot.organization_id=public.current_org()
     and production_lot.facility_id=public.current_facility()) item;
 if lot is null then raise exception 'Production lot was not found in this facility'; end if;
 return jsonb_build_object('lot',lot,
   'batches',coalesce((select jsonb_agg(to_jsonb(result)) from (
     select batch.id,batch.sequence,batch.target_gallons,execution.id worksheet_execution_id,
       execution.status worksheet_status,execution.opened_at,execution.completed_at
     from public.planned_mixer_batches batch
     left join public.batch_worksheet_executions execution on execution.planned_mixer_batch_id=batch.id
     where batch.production_lot_id=production_lot_filter and batch.organization_id=public.current_org()
       and batch.facility_id=public.current_facility()
     order by batch.sequence,batch.id) result),'[]'::jsonb),
   'allocations',coalesce((select jsonb_agg(to_jsonb(result)) from (
     select usage.id usage_id,usage.quantity,usage.used_at,usage.source_lot,
       batch.id batch_id,batch.sequence batch_sequence,ingredient.name ingredient_name,
       unit.id serialized_unit_id,unit.internal_code package_serial,unit.supplier_barcode,
       receipt_line.id receipt_line_id,receipt_line.source_lot_origin,
       receipt.id receipt_id,receipt.received_on,supplier.id supplier_id,supplier.name supplier_name
     from public.batch_worksheet_trace_edges usage
     join public.batch_worksheet_lines worksheet_line on worksheet_line.id=usage.worksheet_line_id
     join public.batch_worksheet_executions execution on execution.id=worksheet_line.execution_id
     join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id
     join public.ingredients ingredient on ingredient.id=worksheet_line.ingredient_id
     join public.serialized_units unit on unit.id=usage.serialized_unit_id
     join public.receipt_serializations serialization on serialization.id=unit.serialization_id
     join public.inventory_receipt_lines receipt_line on receipt_line.id=serialization.receipt_line_id
     join public.inventory_receipts receipt on receipt.id=receipt_line.receipt_id
     join public.suppliers supplier on supplier.id=receipt.supplier_id
     where execution.production_lot_id=production_lot_filter and usage.organization_id=public.current_org()
       and usage.facility_id=public.current_facility()
     order by batch.sequence,usage.used_at,usage.id limit page_size offset offset_rows) result),'[]'::jsonb),
   'page',page_number,'page_size',page_size);
end $$;

create or replace function public.trace_source_material(
  source_lot_filter text default null,serialized_unit_filter uuid default null,
  page_number integer default 0,requested_page_size integer default 100
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page_size integer := greatest(1,least(coalesce(requested_page_size,100),200)); offset_rows integer;
begin
 perform public.traceability_read_allowed();
 if page_number<0 or (nullif(trim(coalesce(source_lot_filter,'')),'') is null and serialized_unit_filter is null)
   then raise exception 'Enter a source lot or package serial and valid page'; end if;
 offset_rows := page_number*page_size;
 return jsonb_build_object(
   'matches',coalesce((select jsonb_agg(to_jsonb(result)) from (
     select distinct receipt_line.id receipt_line_id,effective_source_lot.source_lot,
       receipt_line.source_lot_origin,ingredient.id ingredient_id,ingredient.name ingredient_name,
       supplier.id supplier_id,supplier.name supplier_name,receipt.id receipt_id,receipt.received_on
     from public.inventory_receipt_lines receipt_line
     join public.inventory_receipts receipt on receipt.id=receipt_line.receipt_id
     join public.ingredients ingredient on ingredient.id=receipt_line.ingredient_id
     join public.suppliers supplier on supplier.id=receipt.supplier_id
     cross join lateral(select case receipt_line.source_lot_origin
       when 'supplier_provided' then receipt_line.supplier_lot
       when 'salad_soulmates_assigned' then receipt_line.assigned_source_lot end source_lot) effective_source_lot
     where receipt_line.organization_id=public.current_org() and receipt.facility_id=public.current_facility()
       and ((serialized_unit_filter is not null and exists(
         select 1 from public.serialized_units unit
         join public.receipt_serializations serialization on serialization.id=unit.serialization_id
         where unit.id=serialized_unit_filter and serialization.receipt_line_id=receipt_line.id))
         or (serialized_unit_filter is null and effective_source_lot.source_lot=trim(source_lot_filter)))
     order by receipt.received_on desc,receipt_line.id limit page_size offset offset_rows) result),'[]'::jsonb),
   'affected_batches',coalesce((select jsonb_agg(to_jsonb(result)) from (
     select usage.id usage_id,usage.quantity,usage.used_at,usage.source_lot,
       batch.id batch_id,batch.sequence batch_sequence,production_lot.id production_lot_id,
       production_lot.production_lot_code,production_lot.assigned_on,product.name product_name,
       unit.id serialized_unit_id,unit.internal_code package_serial,unit.supplier_barcode,
       receipt_line.id receipt_line_id,receipt_line.source_lot_origin
     from public.batch_worksheet_trace_edges usage
     join public.batch_worksheet_lines worksheet_line on worksheet_line.id=usage.worksheet_line_id
     join public.batch_worksheet_executions execution on execution.id=worksheet_line.execution_id
     join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id
     join public.production_lots production_lot on production_lot.id=execution.production_lot_id
     join public.products product on product.id=production_lot.product_id
     join public.serialized_units unit on unit.id=usage.serialized_unit_id
     join public.receipt_serializations serialization on serialization.id=unit.serialization_id
     join public.inventory_receipt_lines receipt_line on receipt_line.id=serialization.receipt_line_id
     join public.inventory_receipts receipt on receipt.id=receipt_line.receipt_id
     where usage.organization_id=public.current_org() and usage.facility_id=public.current_facility()
       and receipt_line.organization_id=public.current_org()
       and receipt.organization_id=public.current_org() and receipt.facility_id=public.current_facility()
       and ((serialized_unit_filter is not null and usage.serialized_unit_id=serialized_unit_filter)
         or (serialized_unit_filter is null and usage.source_lot=trim(source_lot_filter)))
     order by production_lot.assigned_on desc,batch.sequence,usage.used_at,usage.id
     limit page_size offset offset_rows) result),'[]'::jsonb),
   'page',page_number,'page_size',page_size);
end $$;

commit;
