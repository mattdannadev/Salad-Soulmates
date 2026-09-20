begin;

-- Product-level setup only. No tank balances, production lots or inventory postings.
create table public.packaging_profile_versions (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  product_id uuid not null,
  version integer not null check(version>0),
  status text not null check(status in ('Draft','Approved')),
  bag_size_gallons numeric not null check(bag_size_gallons>0 and bag_size_gallons<=1000 and scale(bag_size_gallons)<=4),
  bags_per_case integer not null check(bags_per_case between 1 and 1000),
  label_width_inches numeric not null default 3 check(label_width_inches between 1 and 12 and scale(label_width_inches)<=2),
  label_height_inches numeric not null default 5 check(label_height_inches between 1 and 12 and scale(label_height_inches)<=2),
  labels_per_bag integer not null default 1 check(labels_per_bag=1),
  display_name text not null check(length(btrim(display_name)) between 1 and 120),
  ingredient_statement text not null default '' check(length(ingredient_statement)<=4000),
  template_key text not null default 'bag-label-v1' check(template_key='bag-label-v1'),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users,
  approved_at timestamptz,
  foreign key(organization_id,product_id) references public.products(organization_id,id),
  unique(product_id,version),
  check ((status='Draft' and approved_by is null and approved_at is null)
    or (status='Approved' and approved_by is not null and approved_at is not null and length(btrim(ingredient_statement))>0))
);
alter table public.packaging_profile_versions enable row level security;
revoke all on public.packaging_profile_versions from public,anon,authenticated;
grant select,insert on public.packaging_profile_versions to authenticated;
create policy packaging_read on public.packaging_profile_versions for select to authenticated
  using(organization_id=(select public.current_org()) and (select public.has_permission('products.read')));
create policy packaging_insert on public.packaging_profile_versions for insert to authenticated
  with check(organization_id=(select public.current_org()) and (select public.has_permission('products.read'))
    and (select public.has_permission('products.write')));

-- Serialize every version against the same product, including direct table inserts.
create function public.guard_packaging_profile_version() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_version integer;
begin
  if auth.uid() is null or not public.has_permission('products.read') or not public.has_permission('products.write') then
    raise exception 'Product setup permission required'; end if;
  perform 1 from public.products where id=new.product_id and organization_id=public.current_org() and active for update;
  if not found then raise exception 'Choose an active product'; end if;
  if new.organization_id is distinct from public.current_org() then raise exception 'Choose an active product'; end if;
  select coalesce(max(version),0) into current_version from public.packaging_profile_versions where product_id=new.product_id;
  if new.version is distinct from current_version+1 then raise exception 'Packaging setup changed; reload before trying again'; end if;
  new.created_by := auth.uid();
  new.created_at := now();
  new.display_name := btrim(new.display_name);
  new.ingredient_statement := btrim(new.ingredient_statement);
  if new.status='Approved' then
    if coalesce(length(new.ingredient_statement),0)=0 then raise exception 'Enter the approved ingredient statement before approval'; end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  else new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end $$;
create trigger packaging_version_guard before insert on public.packaging_profile_versions
  for each row execute function public.guard_packaging_profile_version();

-- Approval changes defaults for future orders only. Existing order/price snapshots stay intact.
create function public.activate_packaging_profile_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.status='Approved' then
    update public.products set bag_size_gallons=new.bag_size_gallons,bags_per_case=new.bags_per_case,
      approved_ingredient_statement=new.ingredient_statement where id=new.product_id;
    if not found then raise exception 'Could not activate packaging defaults'; end if;
  end if;
  return new;
end $$;
create trigger packaging_version_activate after insert on public.packaging_profile_versions
  for each row execute function public.activate_packaging_profile_version();
create trigger audit_write after insert on public.packaging_profile_versions
  for each row execute function public.audit_change();

create function public.save_packaging_profile(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid := (payload->>'id')::uuid; product uuid := (payload->>'product_id')::uuid;
  prior public.packaging_profile_versions%rowtype; saved_id uuid;
begin
  if auth.uid() is null or not public.has_permission('products.read') or not public.has_permission('products.write') then
    raise exception 'Product setup permission required'; end if;
  perform 1 from public.products where id=product and organization_id=public.current_org() and active for update;
  if not found then raise exception 'Choose an active product'; end if;
  select * into prior from public.packaging_profile_versions where id=requested_id;
  if found then
    if prior.created_by=auth.uid() and prior.product_id=product
      and prior.version=(payload->>'expected_version')::integer+1 and prior.status=payload->>'status'
      and prior.bag_size_gallons=(payload->>'bag_size_gallons')::numeric
      and prior.bags_per_case=(payload->>'bags_per_case')::integer
      and prior.label_width_inches=(payload->>'label_width_inches')::numeric
      and prior.label_height_inches=(payload->>'label_height_inches')::numeric
      and prior.display_name=btrim(payload->>'display_name') and prior.ingredient_statement=btrim(payload->>'ingredient_statement') then
      return prior.id;
    end if;
    raise exception 'Packaging request already used; reload before trying again';
  end if;
  insert into public.packaging_profile_versions(id,product_id,version,status,bag_size_gallons,bags_per_case,
    label_width_inches,label_height_inches,display_name,ingredient_statement)
  values(requested_id,product,(payload->>'expected_version')::integer+1,payload->>'status',
    (payload->>'bag_size_gallons')::numeric,(payload->>'bags_per_case')::integer,
    (payload->>'label_width_inches')::numeric,(payload->>'label_height_inches')::numeric,
    payload->>'display_name',payload->>'ingredient_statement') returning id into saved_id;
  return saved_id;
end $$;
revoke all on function public.guard_packaging_profile_version(),public.activate_packaging_profile_version() from public,anon,authenticated;
revoke all on function public.save_packaging_profile(jsonb) from public,anon,authenticated;
grant execute on function public.save_packaging_profile(jsonb) to authenticated;
commit;
