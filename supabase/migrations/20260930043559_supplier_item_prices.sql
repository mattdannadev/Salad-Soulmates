begin;

-- Supplier prices are append-only effective-dated facts. A price is for one
-- purchase unit of the referenced supplier item; pack details stay on that
-- item, so price history never couples raw materials to finished products.
create table public.supplier_item_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  supplier_item_id uuid not null,
  purchase_uom text not null check(length(purchase_uom) between 1 and 50),
  pack_quantity numeric(14,4) not null
    check(pack_quantity > 0 and pack_quantity <> 'NaN'::numeric),
  pack_quantity_uom text not null check(length(pack_quantity_uom) between 1 and 50),
  unit_price numeric not null
    check(unit_price > 0 and unit_price <= 1000000000 and unit_price = round(unit_price,2)),
  currency text not null default 'USD' check(currency = 'USD'),
  effective_on date not null,
  note text not null default '' check(length(trim(note)) <= 1000),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  foreign key(organization_id,supplier_item_id)
    references public.supplier_items(organization_id,id),
  unique(organization_id,id),
  unique(supplier_item_id,effective_on)
);

create function public.snapshot_supplier_item_price() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  catalog record;
begin
  select
    supplier_item.organization_id,
    supplier_item.purchase_uom,
    supplier_item.pack_quantity,
    supplier_item.pack_quantity_uom,
    supplier_item.active as item_active,
    ingredient.active as ingredient_active,
    supplier.active as supplier_active
  into catalog
  from public.supplier_items supplier_item
  join public.ingredients ingredient
    on ingredient.organization_id=supplier_item.organization_id
    and ingredient.id=supplier_item.ingredient_id
  join public.suppliers supplier
    on supplier.organization_id=supplier_item.organization_id
    and supplier.id=supplier_item.supplier_id
  where supplier_item.id=new.supplier_item_id
  for share of supplier_item,ingredient,supplier;
  if not found
    or catalog.organization_id<>new.organization_id
    or not catalog.item_active
    or not catalog.ingredient_active
    or not catalog.supplier_active then
    raise exception 'Choose an active supplier item with an active ingredient and supplier';
  end if;
  new.purchase_uom := catalog.purchase_uom;
  new.pack_quantity := catalog.pack_quantity;
  new.pack_quantity_uom := catalog.pack_quantity_uom;
  new.note := trim(new.note);
  return new;
end $$;

create trigger snapshot_supplier_item_price before insert on public.supplier_item_prices
  for each row execute function public.snapshot_supplier_item_price();

create index supplier_item_prices_lookup
  on public.supplier_item_prices(organization_id,supplier_item_id,effective_on desc);

alter table public.supplier_item_prices enable row level security;
revoke all on public.supplier_item_prices from public,anon,authenticated;
grant select,insert on public.supplier_item_prices to authenticated;

create policy supplier_item_prices_read on public.supplier_item_prices
  for select to authenticated
  using(
    organization_id = (select public.current_org())
    and (select public.has_permission('master_data.read'))
  );
create policy supplier_item_prices_insert on public.supplier_item_prices
  for insert to authenticated
  with check(
    organization_id = (select public.current_org())
    and created_by = (select auth.uid())
    and (select public.has_permission('master_data.write'))
  );

create trigger audit_write after insert on public.supplier_item_prices
  for each row execute function public.audit_change();

revoke all on function public.snapshot_supplier_item_price() from public,anon,authenticated;

commit;
