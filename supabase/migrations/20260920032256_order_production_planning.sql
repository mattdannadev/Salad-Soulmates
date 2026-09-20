begin;

-- One order owns its production preparation. Dates are facility-local calendar
-- dates; worker assignments and physical ingredient consumption are later steps.
alter table public.customer_orders add unique(organization_id,facility_id,id);
create table public.order_production_plans (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  start_on date not null,
  finish_on date not null check(finish_on>=start_on),
  status text not null default 'Draft' check(status in ('Draft','Confirmed','Cancelled')),
  revision integer not null default 1 check(revision>0),
  note text not null default '' check(length(note)<=1000),
  shortage_reason text not null default '' check(length(shortage_reason)<=1000),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,id) references public.customer_orders(organization_id,facility_id,id)
);
create table public.planned_mixer_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  order_id uuid not null,
  product_id uuid not null references public.products(id),
  recipe_version_id uuid not null references public.recipe_versions(id),
  sequence integer not null check(sequence>0),
  target_gallons numeric not null check(target_gallons=40),
  unique(order_id,product_id,sequence),
  unique(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,order_id) references public.order_production_plans(organization_id,facility_id,id)
);
create index planned_mixer_recipe on public.planned_mixer_batches(recipe_version_id);
create index planned_mixer_product on public.planned_mixer_batches(product_id);
create table public.planned_spice_preparations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  planned_mixer_batch_id uuid not null unique,
  foreign key(organization_id,facility_id,planned_mixer_batch_id)
    references public.planned_mixer_batches(organization_id,facility_id,id)
);

-- Explicit grants and tenant/facility policies apply to both RPCs and direct API requests.
do $$ declare relation_name text; begin
  foreach relation_name in array array['order_production_plans','planned_mixer_batches','planned_spice_preparations'] loop
    execute format('alter table public.%I enable row level security',relation_name);
    execute format('revoke all on public.%I from public,anon,authenticated',relation_name);
    execute format('grant select,insert on public.%I to authenticated',relation_name);
    execute format('create policy production_read on public.%I for select to authenticated using (
      organization_id=(select public.current_org()) and facility_id=(select public.current_facility())
      and (select public.has_permission(''orders.read'')) and (select public.has_permission(''planning.read'')))',relation_name);
    execute format('create policy production_insert on public.%I for insert to authenticated with check (
      organization_id=(select public.current_org()) and facility_id=(select public.current_facility())
      and (select public.has_permission(''orders.write'')) and (select public.has_permission(''planning.write'')))',relation_name);
    execute format('create trigger audit_write after insert or update on public.%I
      for each row execute function public.audit_change()',relation_name);
  end loop;
end $$;
grant update on public.order_production_plans to authenticated;
create policy production_update on public.order_production_plans for update to authenticated using (
  organization_id=(select public.current_org()) and facility_id=(select public.current_facility())
  and (select public.has_permission('orders.write')) and (select public.has_permission('planning.write'))
) with check (
  organization_id=(select public.current_org()) and facility_id=(select public.current_facility())
  and (select public.has_permission('orders.write')) and (select public.has_permission('planning.write'))
);

create function public.material_requirements_at(plan_id uuid, needed_on date) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(r.value || jsonb_build_object(
    'on_hand',stock.quantity,'other_commitments',commitments.quantity,
    'confirmed_inbound',inbound.quantity,
    'projected',stock.quantity+inbound.quantity-commitments.quantity-(r.value->>'required')::numeric,
    'shortage',greatest(0,(r.value->>'required')::numeric+commitments.quantity-stock.quantity-inbound.quantity))), '[]'::jsonb)
  from public.material_plans plan cross join lateral jsonb_array_elements(plan.requirements) r
  cross join lateral (select
    coalesce((select sum(e.quantity_delta) from public.inventory_events e
      where e.ingredient_id=(r.value->>'ingredient_id')::uuid and e.uom=r.value->>'uom'
        and e.serialized_unit_event_id is null
        and (e.receipt_line_id is null or exists(select 1 from public.inventory_receipt_lines receipt
          where receipt.id=e.receipt_line_id
            and not exists(select 1 from public.receipt_serializations s where s.receipt_line_id=receipt.id)
            and (receipt.expiration_date is null or receipt.expiration_date>=material_requirements_at.needed_on)))),0)
    + coalesce((select sum(unit.remaining_quantity) from public.serialized_unit_balances unit
      where unit.ingredient_id=(r.value->>'ingredient_id')::uuid and unit.uom=r.value->>'uom'
        and unit.availability='Available'
        and (unit.expiration_date is null or unit.expiration_date>=material_requirements_at.needed_on)),0) quantity) stock
  cross join lateral (select coalesce(sum((c.value->>'required')::numeric),0) quantity
    from public.material_plans other cross join lateral jsonb_array_elements(other.requirements) c
    where other.status='Active' and other.id<>plan.id
      and c.value->>'ingredient_id'=r.value->>'ingredient_id') commitments
  cross join lateral (select coalesce(sum(greatest(0,l.quantity-coalesce((select sum(received.quantity)
    from public.inventory_receipt_lines received where received.purchase_draft_line_id=l.id),0))),0) quantity
    from public.purchase_draft_lines l join public.purchase_drafts d on d.id=l.purchase_draft_id
    where d.status='Confirmed' and d.expected_on<=material_requirements_at.needed_on
      and l.ingredient_id=(r.value->>'ingredient_id')::uuid and l.uom=r.value->>'uom') inbound
  where plan.id=plan_id and plan.status='Active'
    and public.has_permission('planning.read') and public.has_permission('inventory.read')
$$;

create or replace function public.material_requirements(plan_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce((select public.material_requirements_at(plan.id,coalesce(production.start_on,plan.needed_on))
  from public.material_plans plan left join public.order_production_plans production
    on production.id=plan.id and production.status<>'Cancelled'
  where plan.id=plan_id),'[]'::jsonb)
$$;

create function public.guard_order_production_plan() returns trigger
language plpgsql security invoker set search_path='' as $$
declare customer_order public.customer_orders%rowtype; material_status text;
begin
  if not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write')
    or not public.has_permission('inventory.read') then raise exception 'Production planning permission required'; end if;
  -- Lock the same parent as order cancellation, before touching production rows.
  select status into material_status from public.material_plans where id=new.id for update;
  select * into customer_order from public.customer_orders where id=new.id;
  if not found or material_status is distinct from 'Active' then raise exception 'Choose an active customer order'; end if;
  if new.finish_on>customer_order.needed_on then raise exception 'Production must finish by the customer needed date'; end if;
  if new.organization_id is distinct from customer_order.organization_id
    or new.facility_id is distinct from customer_order.facility_id then raise exception 'Invalid production scope'; end if;
  if (select sum((item->>'batch_count')::integer) from jsonb_array_elements(customer_order.items) item)>10000 then
    raise exception 'Production preparation supports at most 10000 batches per order'; end if;
  new.note := trim(new.note);
  new.shortage_reason := trim(new.shortage_reason);
  if tg_op='INSERT' then
    if new.status<>'Draft' or new.revision<>1 or new.created_by is distinct from auth.uid() then
      raise exception 'Save a production draft before confirming'; end if;
  else
    if (new.id,new.organization_id,new.facility_id,new.created_by,new.created_at)
      is distinct from (old.id,old.organization_id,old.facility_id,old.created_by,old.created_at)
      or new.revision<>old.revision+1 then raise exception 'Production plan changed; reload before trying again'; end if;
    if (new.start_on,new.finish_on) is distinct from (old.start_on,old.finish_on)
      and new.status<>'Draft' then raise exception 'Save changed dates as a draft before confirming'; end if;
    if new.status='Confirmed' and old.status<>'Draft' then raise exception 'Only a draft can be confirmed'; end if;
    if new.status='Cancelled' and old.status='Cancelled' then raise exception 'Production plan is already cancelled'; end if;
    if (new.status='Cancelled' or old.status in ('Confirmed','Cancelled')) and length(new.note)<3 then
      raise exception 'Enter a reason for cancelling or revising production'; end if;
  end if;
  if new.status='Confirmed' and exists(
    select 1 from jsonb_array_elements(public.material_requirements_at(new.id,new.start_on)) requirement
    where (requirement->>'shortage')::numeric>0
  ) and length(new.shortage_reason)<3 then raise exception 'Explain how ingredient shortages will be resolved before confirming'; end if;
  return new;
end $$;
create trigger production_plan_guard before insert or update on public.order_production_plans
  for each row execute function public.guard_order_production_plan();

create function public.guard_planned_mixer_batch() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
  select product into item from public.customer_orders customer_order
    cross join lateral jsonb_array_elements(customer_order.items) product
    where customer_order.id=new.order_id and product->>'product_id'=new.product_id::text;
  if item is null or new.sequence>(item->>'batch_count')::integer
    or new.recipe_version_id is distinct from (item->>'recipe_version_id')::uuid
    or new.target_gallons is distinct from (item->>'batch_gallons')::numeric then
    raise exception 'Mixer batch must match the saved order recipe and quantity'; end if;
  return new;
end $$;
create trigger mixer_batch_guard before insert on public.planned_mixer_batches
  for each row execute function public.guard_planned_mixer_batch();

create function public.create_batch_spice_preparation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.planned_spice_preparations(organization_id,facility_id,planned_mixer_batch_id)
    values(new.organization_id,new.facility_id,new.id);
  return new;
end $$;
create trigger mixer_spice_preparation after insert on public.planned_mixer_batches
  for each row execute function public.create_batch_spice_preparation();

create function public.create_order_mixer_batches() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.planned_mixer_batches(organization_id,facility_id,order_id,product_id,recipe_version_id,sequence,target_gallons)
    select new.organization_id,new.facility_id,new.id,(item->>'product_id')::uuid,
      (item->>'recipe_version_id')::uuid,batch_number,(item->>'batch_gallons')::numeric
    from public.customer_orders customer_order cross join lateral jsonb_array_elements(customer_order.items) item
      cross join lateral generate_series(1,(item->>'batch_count')::integer) batch_number
    where customer_order.id=new.id;
  return new;
end $$;
create trigger production_mixer_batches after insert on public.order_production_plans
  for each row execute function public.create_order_mixer_batches();

create function public.save_order_production_plan(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid := (payload->>'id')::uuid; expected integer := (payload->>'revision')::integer;
  prior public.order_production_plans%rowtype; requested_start date := (payload->>'start_on')::date;
  requested_finish date := (payload->>'finish_on')::date; requested_status text := payload->>'status';
  requested_note text := trim(payload->>'note'); requested_shortage text := trim(payload->>'shortage_reason');
begin
  if not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write')
    or not public.has_permission('inventory.read') then raise exception 'Production planning permission required'; end if;
  if requested_id is null or expected is null or expected<0 or requested_start is null or requested_finish is null
    or requested_finish<requested_start or requested_status is null or requested_status not in ('Draft','Confirmed','Cancelled')
    or requested_note is null or requested_shortage is null then raise exception 'Check production dates, status and revision'; end if;
  perform 1 from public.material_plans where id=requested_id and status='Active' for update;
  if not found then raise exception 'Choose an active customer order'; end if;
  select * into prior from public.order_production_plans where id=requested_id for update;
  if found then
    if prior.revision=expected+1 and prior.start_on=requested_start and prior.finish_on=requested_finish
      and prior.status=requested_status and prior.note=requested_note and prior.shortage_reason=requested_shortage then
      return prior.id;
    end if;
    if prior.revision<>expected then raise exception 'Production plan changed; reload before trying again'; end if;
    update public.order_production_plans set start_on=requested_start,finish_on=requested_finish,
      status=requested_status,note=requested_note,shortage_reason=requested_shortage,revision=revision+1 where id=requested_id;
  else
    if expected<>0 then raise exception 'Production plan not found'; end if;
    insert into public.order_production_plans(id,start_on,finish_on,status,note,shortage_reason)
      values(requested_id,requested_start,requested_finish,requested_status,requested_note,requested_shortage);
  end if;
  return requested_id;
end $$;

-- Retain the existing trigger-only definer lookup so the legacy cancellation
-- endpoint cannot hide a live plan behind order RLS and leave orphaned work.
create or replace function public.guard_customer_order_cancellation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.customer_orders where id=old.id)
    and (not public.has_permission('orders.write') or not public.has_permission('orders.read')) then
    raise exception 'Order permission required'; end if;
  if exists(select 1 from public.order_production_plans where id=old.id and status<>'Cancelled') then
    raise exception 'Cancel production preparation before cancelling this order'; end if;
  return new;
end $$;
revoke all on function public.guard_order_production_plan(),public.guard_planned_mixer_batch(),
  public.create_batch_spice_preparation(),public.create_order_mixer_batches(),public.guard_customer_order_cancellation()
  from public,anon,authenticated;
revoke all on function public.save_order_production_plan(jsonb),public.material_requirements_at(uuid,date) from public,anon,authenticated;
grant execute on function public.save_order_production_plan(jsonb),public.material_requirements_at(uuid,date) to authenticated;
create function public.order_production_batches(order_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(batch) || jsonb_build_object('spice_preparation_id',prep.id)
    order by batch.product_id,batch.sequence),'[]'::jsonb)
  from public.planned_mixer_batches batch left join public.planned_spice_preparations prep
    on prep.planned_mixer_batch_id=batch.id where batch.order_id=order_production_batches.order_id
$$;
revoke all on function public.order_production_batches(uuid) from public,anon,authenticated;
grant execute on function public.order_production_batches(uuid) to authenticated;
commit;
