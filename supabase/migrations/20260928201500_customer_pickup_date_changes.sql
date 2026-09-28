begin;

-- Pickup commitments can move without changing the immutable product/recipe
-- snapshot. Keep an operator-visible record in addition to the generic audit.
create table public.customer_order_pickup_date_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  order_id uuid not null,
  previous_needed_on date not null,
  needed_on date not null,
  reason text not null check (length(trim(reason)) between 3 and 1000),
  changed_by uuid not null default auth.uid() references auth.users,
  changed_at timestamptz not null default now(),
  check (needed_on <> previous_needed_on),
  foreign key (organization_id, facility_id, order_id)
    references public.customer_orders(organization_id, facility_id, id)
);
create index customer_order_pickup_date_changes_order
  on public.customer_order_pickup_date_changes(order_id, changed_at desc);
alter table public.customer_order_pickup_date_changes enable row level security;
revoke all on public.customer_order_pickup_date_changes from public, anon, authenticated;
grant select on public.customer_order_pickup_date_changes to authenticated;
create policy customer_order_pickup_date_changes_read
  on public.customer_order_pickup_date_changes for select to authenticated using (
    organization_id = (select public.current_org())
    and facility_id = (select public.current_facility())
    and (select public.has_permission('orders.read'))
  );
create trigger audit_write after insert on public.customer_order_pickup_date_changes
  for each row execute function public.audit_change();

create function public.change_customer_order_pickup_date(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  requested_id uuid := (payload->>'id')::uuid;
  requested_needed_on date := (payload->>'needed_on')::date;
  requested_reason text := trim(payload->>'reason');
  prior public.customer_orders%rowtype;
  production public.order_production_plans%rowtype;
begin
  if not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write')
    or not public.has_permission('inventory.read') then
    raise exception 'Order and production planning permission required';
  end if;
  if requested_id is null or requested_needed_on is null
    or requested_reason is null or length(requested_reason) not between 3 and 1000 then
    raise exception 'Enter a reason for the pickup-date change';
  end if;

  select * into prior from public.customer_orders
    where id = requested_id
      and organization_id = public.current_org()
      and facility_id = public.current_facility()
    for update;
  if not found then raise exception 'Choose an active customer order'; end if;
  perform 1 from public.material_plans
    where id = requested_id and status = 'Active'
      and organization_id = prior.organization_id and facility_id = prior.facility_id
    for update;
  if not found then raise exception 'Choose an active customer order'; end if;
  if prior.needed_on = requested_needed_on then return prior.id; end if;

  select * into production from public.order_production_plans
    where id = requested_id and status <> 'Cancelled'
    for update;
  if found and production.finish_on >= requested_needed_on then
    raise exception 'Customer pickup date must be after the planned production completion';
  end if;

  -- The existing plan guard makes dates immutable except through the explicit,
  -- authorized order workflow. This setting is transaction-local and not exposed
  -- through the public API.
  perform set_config('salad_soulmates.order_pickup_date_change', 'true', true);
  update public.material_plans set needed_on = requested_needed_on where id = prior.id;
  update public.customer_orders set needed_on = requested_needed_on where id = prior.id;
  insert into public.customer_order_pickup_date_changes(
    organization_id, facility_id, order_id, previous_needed_on, needed_on, reason
  ) values (
    prior.organization_id, prior.facility_id, prior.id, prior.needed_on,
    requested_needed_on, requested_reason
  );
  return prior.id;
end $$;

-- Preserve the no-direct-edit invariant for plans while permitting the audited
-- pickup-date RPC to move the demand horizon in the same transaction.
create or replace function public.guard_material_plan() returns trigger
language plpgsql security invoker set search_path='' as $$
declare batch jsonb; version_row record; result jsonb;
begin
  if not public.has_permission('planning.write') or (tg_op='INSERT' and new.created_by is distinct from auth.uid()) then
    raise exception 'Planning permission required';
  end if;
  if tg_op='UPDATE' then
    if old.status = 'Active' and new.status = 'Active'
      and (to_jsonb(new) - 'needed_on') is not distinct from (to_jsonb(old) - 'needed_on')
      and current_setting('salad_soulmates.order_pickup_date_change', true) = 'true' then
      return new;
    end if;
    if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status')
       or old.status <> 'Active' or new.status <> 'Cancelled' then
      raise exception 'Saved requirements are immutable; cancel and replace the worksheet';
    end if;
    if exists(select 1 from public.purchase_drafts where material_plan_id=old.id and status = 'Draft') then
      raise exception 'Cancel linked draft purchases before cancelling this worksheet';
    end if;
    return new;
  end if;
  if new.status <> 'Active' or jsonb_typeof(new.batches) is distinct from 'array'
     or jsonb_array_length(new.batches) not between 1 and 100 then
    raise exception 'Choose between one and one hundred released recipes';
  end if;
  if (select count(distinct value->>'recipe_version_id') from jsonb_array_elements(new.batches))
     <> jsonb_array_length(new.batches) then raise exception 'A recipe version may appear only once'; end if;
  for batch in select value from jsonb_array_elements(new.batches) loop
    if (batch->>'batch_count')::numeric is null or (batch->>'batch_count')::numeric not between 1 and 10000
       or (batch->>'batch_count')::numeric <> trunc((batch->>'batch_count')::numeric) then
      raise exception 'Batch count must be a whole number from 1 to 10000';
    end if;
    select v.id,v.target_yield_gallons,p.name into version_row
      from public.recipe_versions v join public.recipes r on r.id=v.recipe_id
      join public.products p on p.id=r.product_id
      where v.id=(batch->>'recipe_version_id')::uuid and v.status='Released' and p.active
        and v.target_yield_gallons=40 and p.standard_batch_gallons=40;
    if not found then raise exception 'Choose a released recipe for an active 40-gallon product'; end if;
    perform 1 from public.ingredients i where exists(select 1 from public.recipe_lines l
      where l.recipe_version_id=version_row.id and l.ingredient_id=i.id) order by i.id for share;
    if not exists(select 1 from public.recipe_lines where recipe_version_id=version_row.id) then
      raise exception 'Released recipe has no ingredient requirements';
    end if;
    if exists(select 1 from public.recipe_lines l join public.ingredients i on i.id=l.ingredient_id
      where l.recipe_version_id=version_row.id and (not i.active or l.normalized_uom<>i.default_uom
      or l.normalized_quantity is null or l.normalized_quantity<=0
      or l.normalized_quantity>=1000000000
      or l.normalized_quantity<>round(l.normalized_quantity,4))) then
      raise exception 'Recipe ingredient must be active with a validated quantity in its base unit (four decimals)';
    end if;
  end loop;
  select jsonb_agg(to_jsonb(requirement) order by ingredient_name) into result from (
    select i.id ingredient_id,i.name ingredient_name,i.default_uom uom,
      sum(l.normalized_quantity*(b.value->>'batch_count')::integer) required,
      jsonb_agg(jsonb_build_object('recipe_line_id',l.id,'recipe_version_id',v.id,'product_name',p.name,
        'version_number',v.version_number,'batch_count',(b.value->>'batch_count')::integer,
        'per_batch',l.normalized_quantity,'quantity',l.normalized_quantity*(b.value->>'batch_count')::integer)
        order by p.name,l.sequence) contributions
    from jsonb_array_elements(new.batches) b
    join public.recipe_versions v on v.id=(b.value->>'recipe_version_id')::uuid
    join public.recipes r on r.id=v.recipe_id join public.products p on p.id=r.product_id
    join public.recipe_lines l on l.recipe_version_id=v.id join public.ingredients i on i.id=l.ingredient_id
    group by i.id,i.name,i.default_uom
  ) requirement;
  if result is null or exists(select 1 from jsonb_array_elements(result) r where (r->>'required')::numeric>1000000000) then
    raise exception 'Requirements are empty or exceed the supported quantity';
  end if;
  new.requirements := result;
  return new;
end $$;

-- Production preparation blocks cancellation, not the audited update of a
-- still-active order's demand horizon.
create or replace function public.guard_customer_order_cancellation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status
    and exists(select 1 from public.customer_orders where id = old.id)
    and (not public.has_permission('orders.write') or not public.has_permission('orders.read')) then
    raise exception 'Order permission required';
  end if;
  if new.status is distinct from old.status
    and exists(select 1 from public.order_production_plans where id = old.id and status <> 'Cancelled') then
    raise exception 'Cancel production preparation before cancelling this order';
  end if;
  return new;
end $$;

revoke all on function public.change_customer_order_pickup_date(jsonb) from public, anon, authenticated;
revoke all on function public.guard_customer_order_cancellation() from public, anon, authenticated;
grant execute on function public.change_customer_order_pickup_date(jsonb) to authenticated;

commit;
