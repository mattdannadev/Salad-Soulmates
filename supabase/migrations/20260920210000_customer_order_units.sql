begin;

-- A customer/product combination may offer several sell units, but exactly one
-- active option is the customer's normal ordering unit.
alter table public.customer_product_options
  add column is_preferred boolean not null default false;

-- The backfill is maintenance performed by the migration role, not an
-- application write, so do not invoke application authorization or auditing.
alter table public.customer_product_options disable trigger customer_option_guard;
alter table public.customer_product_options disable trigger audit_write;

with ranked as (
  select id, row_number() over (
    partition by customer_id, product_id order by created_at, id
  ) as position
  from public.customer_product_options
  where active
)
update public.customer_product_options option_row
set is_preferred = ranked.position = 1
from ranked
where ranked.id = option_row.id;

alter table public.customer_product_options enable trigger customer_option_guard;
alter table public.customer_product_options enable trigger audit_write;

create unique index customer_options_one_preferred
  on public.customer_product_options(customer_id, product_id)
  where active and is_preferred;
create unique index customer_options_active_unit
  on public.customer_product_options(customer_id, product_id, lower(trim(unit_name)))
  where active;

create or replace function public.guard_customer_product_option() returns trigger
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
  if not exists(
    select 1 from public.reference_options
    where organization_id=public.current_org() and list_code='purchase_unit'
      and code=new.unit_name and active
  ) then raise exception 'Choose an active ordering unit'; end if;
  return new;
end $$;

create or replace function public.save_customer_product_option(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid := (payload->>'id')::uuid; prior public.customer_product_options%rowtype;
  customer uuid; expected integer := (payload->>'revision')::integer;
  preferred boolean := false;
  existing boolean := false;
begin
  if not public.has_permission('products.write') or not public.has_permission('products.read') then
    raise exception 'Product write permission required'; end if;
  if requested_id is null or expected is null or expected<0 then raise exception 'Invalid option request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0));
  customer := public.resolve_customer(payload->>'customer_name');
  preferred := coalesce((payload->>'is_preferred')::boolean, false);
  select * into prior from public.customer_product_options where id=requested_id for update;
  if found then
    existing := true;
    if prior.revision=expected+1 and prior.customer_id=customer
      and prior.product_id=(payload->>'product_id')::uuid and prior.label=trim(payload->>'label')
      and prior.packaging_mode=payload->>'packaging_mode' and prior.unit_price=(payload->>'unit_price')::numeric
      and prior.currency=payload->>'currency' and prior.active=(payload->>'active')::boolean
      and prior.is_preferred=preferred
      and (prior.packaging_mode='product_default' or (prior.unit_name=trim(payload->>'unit_name')
        and prior.gallons_per_unit=(payload->>'gallons_per_unit')::numeric)) then return prior.id; end if;
    if prior.revision<>expected or prior.customer_id<>customer or prior.product_id<>(payload->>'product_id')::uuid then
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
      gallons_per_unit=(payload->>'gallons_per_unit')::numeric,unit_price=(payload->>'unit_price')::numeric,
      currency=payload->>'currency',active=(payload->>'active')::boolean,is_preferred=preferred,
      revision=revision+1 where id=requested_id;
  else
    insert into public.customer_product_options(id,customer_id,product_id,label,packaging_mode,unit_name,gallons_per_unit,unit_price,currency,active,is_preferred)
      values(requested_id,customer,(payload->>'product_id')::uuid,trim(payload->>'label'),payload->>'packaging_mode',
        trim(payload->>'unit_name'),(payload->>'gallons_per_unit')::numeric,(payload->>'unit_price')::numeric,
        payload->>'currency',(payload->>'active')::boolean,preferred);
  end if;
  return requested_id;
end $$;

commit;
