begin;

-- Equipment is durable facility master data. Every serialized physical piece is
-- its own row; parent_equipment_id expresses assemblies without collapsing their
-- identities or maintenance history.
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org() references public.organizations,
  facility_id uuid not null default public.current_facility(),
  parent_equipment_id uuid,
  equipment_code text not null check (equipment_code ~ '^[A-Z0-9][A-Z0-9._-]{0,49}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  equipment_type text not null check (equipment_type in (
    'mixer', 'tank', 'pump', 'filler', 'packaging_line', 'utility', 'other'
  )),
  status text not null default 'active' check (status in (
    'active', 'inactive', 'out_of_service', 'retired'
  )),
  manufacturer text check (manufacturer is null or length(trim(manufacturer)) between 1 and 120),
  model text check (model is null or length(trim(model)) between 1 and 120),
  serial_number text check (serial_number is null or length(trim(serial_number)) between 1 and 120),
  location text check (location is null or length(trim(location)) between 1 and 120),
  commissioned_on date,
  retired_on date,
  usable_capacity numeric(14, 4),
  usable_capacity_uom text,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users,
  updated_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id),
  foreign key (organization_id, facility_id, parent_equipment_id)
    references public.equipment(organization_id, facility_id, id),
  check (parent_equipment_id is null or parent_equipment_id <> id),
  check (commissioned_on is null or retired_on is null or retired_on >= commissioned_on),
  check (
    (status = 'retired' and retired_on is not null)
    or (status <> 'retired' and retired_on is null)
  ),
  check (
    (equipment_type in ('mixer', 'tank')
      and usable_capacity > 0
      and usable_capacity <> 'NaN'::numeric
      and usable_capacity_uom is not null)
    or (equipment_type not in ('mixer', 'tank')
      and usable_capacity is null
      and usable_capacity_uom is null)
  )
);

create unique index equipment_facility_code_unique
  on public.equipment(organization_id, facility_id, equipment_code);
create unique index equipment_serial_number_unique
  on public.equipment(organization_id, lower(serial_number))
  where serial_number is not null;
create index equipment_parent_lookup
  on public.equipment(organization_id, facility_id, parent_equipment_id);
create index equipment_directory_lookup
  on public.equipment(organization_id, facility_id, status, equipment_type, display_name);

create function public.guard_equipment_record() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  cycle_found boolean;
begin
  new.equipment_code := upper(trim(new.equipment_code));
  new.display_name := trim(new.display_name);
  new.manufacturer := nullif(trim(new.manufacturer), '');
  new.model := nullif(trim(new.model), '');
  new.serial_number := nullif(trim(new.serial_number), '');
  new.location := nullif(trim(new.location), '');

  if tg_op = 'INSERT' then
    if new.created_by is distinct from auth.uid()
      or new.updated_by is distinct from auth.uid() then
      raise exception 'Invalid equipment actor';
    end if;
  elsif (new.id, new.organization_id, new.facility_id, new.equipment_code,
      new.created_by, new.created_at)
    is distinct from
    (old.id, old.organization_id, old.facility_id, old.equipment_code,
      old.created_by, old.created_at)
    or new.revision <> old.revision + 1 then
    raise exception 'Equipment identity is immutable or revision is stale';
  else
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;

  if new.equipment_type in ('mixer', 'tank') and not exists (
    select 1 from public.uoms
    where organization_id = new.organization_id
      and code = new.usable_capacity_uom
      and family_code in ('mass', 'volume')
      and active
      and is_inventory_unit
  ) then
    raise exception 'Choose an active mass or volume unit for usable equipment capacity';
  end if;

  if new.parent_equipment_id is not null then
    with recursive ancestors as (
      select parent.id, parent.parent_equipment_id
      from public.equipment parent
      where parent.organization_id = new.organization_id
        and parent.facility_id = new.facility_id
        and parent.id = new.parent_equipment_id
      union all
      select parent.id, parent.parent_equipment_id
      from public.equipment parent
      join ancestors child on child.parent_equipment_id = parent.id
      where parent.organization_id = new.organization_id
        and parent.facility_id = new.facility_id
    )
    select exists(select 1 from ancestors where id = new.id) into cycle_found;
    if cycle_found then raise exception 'Equipment hierarchy cannot contain a cycle'; end if;
  end if;

  return new;
end $$;

create function public.prevent_equipment_delete() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Equipment identities cannot be deleted; retire the equipment instead';
end $$;

create trigger equipment_record_guard
  before insert or update on public.equipment
  for each row execute function public.guard_equipment_record();
create trigger equipment_delete_guard
  before delete on public.equipment
  for each row execute function public.prevent_equipment_delete();
create trigger equipment_audit_write
  after insert or update on public.equipment
  for each row execute function public.audit_change();

alter table public.equipment enable row level security;
create policy equipment_read on public.equipment for select to authenticated
  using (
    organization_id = public.current_org()
    and facility_id = public.current_facility()
    and public.has_permission('master_data.read')
  );
create policy equipment_insert on public.equipment for insert to authenticated
  with check (
    organization_id = public.current_org()
    and facility_id = public.current_facility()
    and created_by = auth.uid()
    and updated_by = auth.uid()
    and public.has_permission('master_data.write')
  );
create policy equipment_update on public.equipment for update to authenticated
  using (
    organization_id = public.current_org()
    and facility_id = public.current_facility()
    and public.has_permission('master_data.write')
  )
  with check (
    organization_id = public.current_org()
    and facility_id = public.current_facility()
    and updated_by = auth.uid()
    and public.has_permission('master_data.write')
  );

revoke all on public.equipment from anon, authenticated;
grant select, insert, update on public.equipment to authenticated;
revoke all on function public.guard_equipment_record() from public, anon, authenticated;
revoke all on function public.prevent_equipment_delete() from public, anon, authenticated;

-- The recursive read remains SECURITY INVOKER so table RLS is enforced for every
-- row while callers receive a stable, typed hierarchy contract.
create function public.equipment_tree(
  requested_facility_id uuid default public.current_facility()
) returns table (
  id uuid,
  organization_id uuid,
  facility_id uuid,
  parent_equipment_id uuid,
  equipment_code text,
  display_name text,
  equipment_type text,
  status text,
  manufacturer text,
  model text,
  serial_number text,
  location text,
  commissioned_on date,
  retired_on date,
  usable_capacity numeric,
  usable_capacity_uom text,
  revision integer,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  depth integer,
  hierarchy_path uuid[]
) language sql stable security invoker set search_path = '' as $$
  with recursive hierarchy as (
    select equipment.*, 0 as depth, array[equipment.id] as hierarchy_path
    from public.equipment
    where equipment.facility_id = requested_facility_id
      and equipment.parent_equipment_id is null
    union all
    select child.*, parent.depth + 1, parent.hierarchy_path || child.id
    from public.equipment child
    join hierarchy parent
      on child.organization_id = parent.organization_id
      and child.facility_id = parent.facility_id
      and child.parent_equipment_id = parent.id
  )
  select hierarchy.* from hierarchy
  order by hierarchy.hierarchy_path
$$;

revoke all on function public.equipment_tree(uuid) from public, anon;
grant execute on function public.equipment_tree(uuid) to authenticated;

commit;
