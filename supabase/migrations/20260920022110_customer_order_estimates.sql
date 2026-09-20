begin;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org() references public.organizations(id),
  name text not null check (length(trim(name)) between 1 and 120),
  name_key text generated always as (lower(trim(name))) stored,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,name_key)
);
alter table public.customers enable row level security;
revoke all on public.customers from public,anon,authenticated;
grant select,insert on public.customers to authenticated;
create policy customers_read on public.customers for select to authenticated using (
  organization_id=(select public.current_org()) and
  ((select public.has_permission('orders.read')) or (select public.has_permission('products.read')))
);
create policy customers_insert on public.customers for insert to authenticated with check (
  organization_id=(select public.current_org()) and
  ((select public.has_permission('orders.write')) or (select public.has_permission('products.write')))
);
create trigger audit_write after insert on public.customers
  for each row execute function public.audit_change();

create function public.resolve_customer(customer_name text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare resolved uuid;
begin
  if not public.has_permission('orders.write') and not public.has_permission('products.write') then
    raise exception 'Customer write permission required'; end if;
  if customer_name is null or length(trim(customer_name)) not between 1 and 120 then
    raise exception 'Enter a customer name'; end if;
  insert into public.customers(name) values(trim(customer_name))
    on conflict(organization_id,name_key) do nothing;
  select id into resolved from public.customers
    where organization_id=public.current_org() and name_key=lower(trim(customer_name));
  if resolved is null then raise exception 'Customer could not be resolved'; end if;
  return resolved;
end $$;

create table public.customer_product_options (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  customer_id uuid not null,
  product_id uuid not null,
  label text not null check(length(trim(label)) between 1 and 120),
  packaging_mode text not null check(packaging_mode in ('product_default','custom')),
  unit_name text not null check(length(trim(unit_name)) between 1 and 80),
  gallons_per_unit numeric not null check(gallons_per_unit>0 and gallons_per_unit<=1000000 and gallons_per_unit=round(gallons_per_unit,4)),
  unit_price numeric not null check(unit_price>=0 and unit_price<=1000000 and unit_price=round(unit_price,2)),
  currency text not null default 'USD' check(currency='USD'),
  active boolean not null default true,
  revision integer not null default 1 check(revision>0),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  foreign key(organization_id,customer_id) references public.customers(organization_id,id),
  foreign key(organization_id,product_id) references public.products(organization_id,id)
);
create index customer_options_product on public.customer_product_options(organization_id,product_id,customer_id);
create index customer_options_customer on public.customer_product_options(customer_id);
create unique index customer_options_active_label on public.customer_product_options(customer_id,product_id,lower(trim(label))) where active;
alter table public.customer_product_options enable row level security;
revoke all on public.customer_product_options from public,anon,authenticated;
grant select,insert,update on public.customer_product_options to authenticated;
create policy customer_options_read on public.customer_product_options for select to authenticated using (
  organization_id=(select public.current_org()) and (select public.has_permission('products.read'))
);
create policy customer_options_insert on public.customer_product_options for insert to authenticated with check (
  organization_id=(select public.current_org()) and (select public.has_permission('products.write'))
);
create policy customer_options_update on public.customer_product_options for update to authenticated using (
  organization_id=(select public.current_org()) and (select public.has_permission('products.write'))
) with check(organization_id=(select public.current_org()) and (select public.has_permission('products.write')));

create function public.guard_customer_product_option() returns trigger
language plpgsql security invoker set search_path='' as $$
declare product public.products%rowtype;
begin
  if not public.has_permission('products.write') or not public.has_permission('products.read') then
    raise exception 'Product write permission required'; end if;
  if tg_op='INSERT' then
    if new.created_by is distinct from auth.uid() or new.revision<>1 then
      raise exception 'Invalid customer option identity'; end if;
  else
    if (new.id,new.organization_id,new.customer_id,new.product_id,new.created_by,new.created_at)
      is distinct from (old.id,old.organization_id,old.customer_id,old.product_id,old.created_by,old.created_at)
      or new.revision<>old.revision+1 then raise exception 'Customer option changed; reload before trying again'; end if;
  end if;
  select * into product from public.products where id=new.product_id and active for share;
  if not found then raise exception 'Choose an active product'; end if;
  new.label := trim(new.label);
  new.unit_name := trim(new.unit_name);
  if new.packaging_mode='product_default' then
    new.unit_name := 'case';
    new.gallons_per_unit := product.bag_size_gallons*product.bags_per_case;
  end if;
  return new;
end $$;
create trigger customer_option_guard before insert or update on public.customer_product_options
  for each row execute function public.guard_customer_product_option();
create trigger audit_write after insert or update on public.customer_product_options
  for each row execute function public.audit_change();

create function public.save_customer_product_option(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid := (payload->>'id')::uuid; prior public.customer_product_options%rowtype;
  customer uuid; expected integer := (payload->>'revision')::integer;
begin
  if not public.has_permission('products.write') or not public.has_permission('products.read') then
    raise exception 'Product write permission required'; end if;
  if requested_id is null or expected is null or expected<0 then raise exception 'Invalid option request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0));
  customer := public.resolve_customer(payload->>'customer_name');
  select * into prior from public.customer_product_options where id=requested_id for update;
  if found then
    if prior.revision=expected+1 and prior.customer_id=customer
      and prior.product_id=(payload->>'product_id')::uuid and prior.label=trim(payload->>'label')
      and prior.packaging_mode=payload->>'packaging_mode' and prior.unit_price=(payload->>'unit_price')::numeric
      and prior.currency=payload->>'currency' and prior.active=(payload->>'active')::boolean
      and (prior.packaging_mode='product_default' or (prior.unit_name=trim(payload->>'unit_name')
        and prior.gallons_per_unit=(payload->>'gallons_per_unit')::numeric)) then return prior.id; end if;
    if prior.revision<>expected or prior.customer_id<>customer or prior.product_id<>(payload->>'product_id')::uuid then
      raise exception 'Customer option changed; reload before trying again'; end if;
    update public.customer_product_options set label=trim(payload->>'label'),
      packaging_mode=payload->>'packaging_mode',unit_name=trim(payload->>'unit_name'),
      gallons_per_unit=(payload->>'gallons_per_unit')::numeric,unit_price=(payload->>'unit_price')::numeric,
      currency=payload->>'currency',active=(payload->>'active')::boolean,revision=revision+1 where id=requested_id;
  else
    if expected<>0 then raise exception 'Customer option not found'; end if;
    insert into public.customer_product_options(id,customer_id,product_id,label,packaging_mode,unit_name,gallons_per_unit,unit_price,currency,active)
      values(requested_id,customer,(payload->>'product_id')::uuid,trim(payload->>'label'),payload->>'packaging_mode',
        trim(payload->>'unit_name'),(payload->>'gallons_per_unit')::numeric,(payload->>'unit_price')::numeric,
        payload->>'currency',(payload->>'active')::boolean);
  end if;
  return requested_id;
end $$;
revoke all on function public.guard_customer_product_option() from public,anon,authenticated;
revoke all on function public.resolve_customer(text),public.save_customer_product_option(jsonb) from public,anon,authenticated;
grant execute on function public.resolve_customer(text),public.save_customer_product_option(jsonb) to authenticated;


-- One immutable customer order owns one ingredient-demand snapshot. Its state is
-- the linked plan's state, so cancellation cannot leave two conflicting statuses.
create table public.customer_orders (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  customer_id uuid not null,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  reference text not null default '' check (length(reference) <= 120),
  needed_on date not null,
  products jsonb not null,
  items jsonb not null default '[]',
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  foreign key(organization_id,customer_id) references public.customers(organization_id,id),
  foreign key (organization_id,facility_id,id)
    references public.material_plans(organization_id,facility_id,id)
);
create index customer_orders_customer on public.customer_orders(customer_id);
create index customer_orders_scope on public.customer_orders(organization_id,facility_id,needed_on);
alter table public.customer_orders enable row level security;
revoke all on public.customer_orders from public,anon,authenticated;
grant select,insert on public.customer_orders to authenticated;
create policy customer_orders_read on public.customer_orders for select to authenticated using (
  organization_id=(select public.current_org()) and facility_id=(select public.current_facility())
  and (select public.has_permission('orders.read'))
);
create policy customer_orders_insert on public.customer_orders for insert to authenticated with check (
  organization_id=(select public.current_org()) and facility_id=(select public.current_facility())
  and created_by=(select auth.uid()) and (select public.has_permission('orders.write'))
);

-- Direct inserts receive exactly the same validation and server-built snapshots
-- as the RPC. Recipe identity, quantities and requirement totals cannot be forged.
create function public.guard_customer_order() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; candidates jsonb; chosen jsonb; batches jsonb := '[]';
  snapshot jsonb := '[]'; canonical jsonb := '[]'; option_row public.customer_product_options%rowtype;
  package jsonb; unit_gallons numeric; unit_count numeric;
begin
  if not public.has_permission('orders.write') or not public.has_permission('orders.read')
    or not public.has_permission('planning.write') or not public.has_permission('planning.read')
    or not public.has_permission('products.read') or not public.has_permission('master_data.read')
    or not public.has_permission('inventory.read') or new.created_by is distinct from auth.uid()
    or new.organization_id is distinct from public.current_org()
    or new.facility_id is distinct from public.current_facility() then
    raise exception 'Order and purchasing permissions required';
  end if;
  new.customer_id := public.resolve_customer(new.customer_name);
  select name into new.customer_name from public.customers where id=new.customer_id;
  new.reference := trim(new.reference);
  if jsonb_typeof(new.products) is distinct from 'array'
    or jsonb_array_length(new.products) not between 1 and 100 then
    raise exception 'Choose between one and one hundred products';
  end if;
  if (select count(distinct value->>'product_id') from jsonb_array_elements(new.products))
    <> jsonb_array_length(new.products) then raise exception 'A product may appear only once'; end if;
  for item in select value from jsonb_array_elements(new.products) order by value->>'product_id' loop
    if (item->>'batch_count')::numeric is null or (item->>'batch_count')::numeric not between 1 and 10000
      or (item->>'batch_count')::numeric <> trunc((item->>'batch_count')::numeric) then
      raise exception 'Batch count must be a whole number from 1 to 10000';
    end if;
    select jsonb_agg(to_jsonb(candidate)) into candidates from (
      select p.id product_id,p.name product_name,p.bag_size_gallons,p.bags_per_case,
        v.id recipe_version_id,v.version_number
      from public.products p join public.recipes r on r.product_id=p.id
        join public.recipe_versions v on v.id=r.active_version_id and v.recipe_id=r.id
      where p.id=(item->>'product_id')::uuid and p.active and p.standard_batch_gallons=40
        and v.status='Released' and v.target_yield_gallons=40
      order by r.id for share of p,r,v
    ) candidate;
    if candidates is null or jsonb_array_length(candidates)<>1 then
      raise exception 'Each product needs exactly one active released 40-gallon recipe';
    end if;
    chosen := candidates->0;
    if nullif(item->>'customer_product_option_id','') is not null then
      select * into option_row from public.customer_product_options
        where id=(item->>'customer_product_option_id')::uuid and customer_id=new.customer_id
          and product_id=(chosen->>'product_id')::uuid and active for share;
      if not found then raise exception 'Choose an active packaging option for this customer and product'; end if;
      unit_gallons := option_row.gallons_per_unit;
      package := jsonb_build_object('customer_product_option_id',option_row.id,
        'packaging_label',option_row.label,'unit_name',option_row.unit_name,
        'gallons_per_unit',unit_gallons,'unit_price',option_row.unit_price,'currency',option_row.currency);
    else
      unit_gallons := (chosen->>'bag_size_gallons')::numeric*(chosen->>'bags_per_case')::numeric;
      package := jsonb_build_object('customer_product_option_id',null,
        'packaging_label','Default packaging','unit_name','case','gallons_per_unit',unit_gallons,
        'unit_price',null,'currency','USD');
    end if;
    unit_count := (item->>'batch_count')::numeric*40/unit_gallons;
    if unit_count<>trunc(unit_count) then
      raise exception 'Batch quantity must divide into whole packaging units; review the batch count or packaging'; end if;
    if unit_count*(package->>'unit_price')::numeric>1000000000000 then
      raise exception 'Order line value exceeds supported precision'; end if;
    package := package || jsonb_build_object('unit_count',unit_count,
      'line_total',round(unit_count*(package->>'unit_price')::numeric,2));
    canonical := canonical || jsonb_build_array(jsonb_build_object(
      'product_id',chosen->>'product_id','batch_count',(item->>'batch_count')::integer,
      'customer_product_option_id',nullif(item->>'customer_product_option_id','')::uuid));
    batches := batches || jsonb_build_array(jsonb_build_object(
      'recipe_version_id',chosen->>'recipe_version_id','batch_count',(item->>'batch_count')::integer));
    snapshot := snapshot || jsonb_build_array(chosen || package || jsonb_build_object(
      'batch_count',(item->>'batch_count')::integer,'batch_gallons',40));
  end loop;
  new.products := canonical;
  new.items := snapshot;
  insert into public.material_plans(id,name,needed_on,batches)
    values(new.id,'Order '||left(new.id::text,8),new.needed_on,batches);
  return new;
end $$;
create trigger customer_order_guard before insert on public.customer_orders
  for each row execute function public.guard_customer_order();
create trigger audit_write after insert on public.customer_orders
  for each row execute function public.audit_change();

create function public.save_customer_order(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid := (payload->>'id')::uuid; prior public.customer_orders%rowtype;
  canonical jsonb;
begin
  if not public.has_permission('orders.write') or not public.has_permission('orders.read') then
    raise exception 'Order permission required'; end if;
  if requested_id is null then raise exception 'Request ID is required'; end if;
  if jsonb_typeof(payload->'products') is distinct from 'array' then
    raise exception 'Choose products and batch counts'; end if;
  select jsonb_agg(jsonb_build_object('product_id',(value->>'product_id')::uuid,
    'batch_count',(value->>'batch_count')::numeric,
    'customer_product_option_id',nullif(value->>'customer_product_option_id','')::uuid) order by value->>'product_id')
    into canonical from jsonb_array_elements(payload->'products');
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0));
  select * into prior from public.customer_orders where id=requested_id;
  if found then
    if prior.created_by=auth.uid() and lower(prior.customer_name)=lower(trim(payload->>'customer_name'))
      and prior.reference=trim(coalesce(payload->>'reference',''))
      and prior.needed_on=(payload->>'needed_on')::date and prior.products=canonical then
      return prior.id;
    end if;
    raise exception 'Request ID already used with different values';
  end if;
  insert into public.customer_orders(id,customer_name,reference,needed_on,products)
    values(requested_id,trim(payload->>'customer_name'),trim(coalesce(payload->>'reference','')),
      (payload->>'needed_on')::date,canonical);
  return requested_id;
end $$;

-- A narrow trigger-only lookup also protects the old plan cancellation endpoint.
-- The definer can detect an order even when a planning-only user cannot read it.
create function public.guard_customer_order_cancellation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.customer_orders where id=old.id)
    and (not public.has_permission('orders.write') or not public.has_permission('orders.read')) then
    raise exception 'Order permission required';
  end if;
  return new;
end $$;
create trigger customer_order_cancellation_guard before update on public.material_plans
  for each row execute function public.guard_customer_order_cancellation();

create function public.cancel_customer_order(order_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
begin
  if not public.has_permission('orders.write') or not public.has_permission('orders.read') then
    raise exception 'Order permission required'; end if;
  perform 1 from public.customer_orders where id=order_id;
  if not found then raise exception 'Customer order not found'; end if;
  perform public.cancel_material_plan(order_id);
  return order_id;
end $$;

revoke all on function public.guard_customer_order(),public.guard_customer_order_cancellation()
  from public,anon,authenticated;
revoke all on function public.save_customer_order(jsonb),public.cancel_customer_order(uuid)
  from public,anon,authenticated;
grant execute on function public.save_customer_order(jsonb),public.cancel_customer_order(uuid)
  to authenticated;
commit;
