begin;

-- A lot is deliberately a product-specific production identity, not an order
-- date.  A multi-product order therefore creates one lot per product; the
-- internal DDDYY grouping code can be shared while each lot stays distinct.
create table public.production_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  order_id uuid not null,
  product_id uuid not null references public.products(id),
  assigned_on date not null,
  production_lot_code text not null check(production_lot_code ~ '^[0-9]{5}$'),
  planned_gallons numeric not null check(planned_gallons > 0),
  planned_batch_count integer not null check(planned_batch_count > 0),
  status text not null default 'Assigned' check(status in ('Assigned','Cancelled')),
  assigned_by uuid not null default auth.uid() references auth.users,
  assigned_at timestamptz not null default now(),
  unique(organization_id, facility_id, id),
  foreign key(organization_id, facility_id, order_id)
    references public.order_production_plans(organization_id, facility_id, id)
);
create unique index production_lot_one_active_product_per_plan
  on public.production_lots(organization_id, facility_id, order_id, product_id)
  where status = 'Assigned';
create index production_lots_order on public.production_lots(order_id);
create index production_lots_customer_lookup
  on public.production_lots(organization_id, facility_id, product_id, production_lot_code);

alter table public.planned_mixer_batches add column production_lot_id uuid;
alter table public.planned_mixer_batches add constraint planned_mixer_batches_production_lot_scope
  foreign key(organization_id, facility_id, production_lot_id)
  references public.production_lots(organization_id, facility_id, id);
create index planned_mixer_batches_production_lot on public.planned_mixer_batches(production_lot_id);

alter table public.production_lots enable row level security;
revoke all on public.production_lots from public, anon, authenticated;
grant select on public.production_lots to authenticated;
create policy production_lot_read on public.production_lots for select to authenticated using (
  organization_id = (select public.current_org()) and facility_id = (select public.current_facility())
  and (select public.has_permission('orders.read')) and (select public.has_permission('planning.read'))
);
create trigger audit_write after insert or update on public.production_lots
  for each row execute function public.audit_change();

create function public.assign_production_lot(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
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
  if requested_order is null or requested_product is null or requested_date is null then
    raise exception 'Choose a product and facility production date';
  end if;
  select * into plan from public.order_production_plans where id=requested_order for update;
  if not found or plan.status <> 'Draft' then raise exception 'Save a draft production preparation before assigning lots'; end if;
  select count(*) into expected_batches from public.planned_mixer_batches
    where order_id=requested_order and product_id=requested_product;
  if expected_batches = 0 then raise exception 'Choose a product from this production plan'; end if;
  if exists(select 1 from public.planned_mixer_batches
    where order_id=requested_order and product_id=requested_product and production_lot_id is not null) then
    raise exception 'A production lot is already assigned for this product';
  end if;
  insert into public.production_lots(
    organization_id,facility_id,order_id,product_id,assigned_on,production_lot_code,
    planned_gallons,planned_batch_count
  ) values (
    plan.organization_id,plan.facility_id,requested_order,requested_product,requested_date,
    to_char(requested_date,'DDDYY'),expected_batches * 40,expected_batches
  ) returning id into result;
  update public.planned_mixer_batches set production_lot_id=result
    where order_id=requested_order and product_id=requested_product and production_lot_id is null;
  if not found then raise exception 'Production lot assignment changed; reload before trying again'; end if;
  return result;
end $$;

revoke all on function public.assign_production_lot(jsonb) from public, anon, authenticated;
grant execute on function public.assign_production_lot(jsonb) to authenticated;
commit;
