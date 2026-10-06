begin;

alter table public.equipment
  add column is_production_preferred boolean not null default false,
  add constraint equipment_production_preference_is_active check (
    not is_production_preferred
    or (equipment_type in ('mixer', 'tank') and status = 'active')
  );

create unique index equipment_one_production_preference_per_type
  on public.equipment(organization_id, facility_id, equipment_type)
  where is_production_preferred;

-- Preserve the established equipment-tree return contract after adding the
-- preference column. The original recursive SELECT * would otherwise become
-- wider than its declared table shape.
create or replace function public.equipment_tree(
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
  select hierarchy.id, hierarchy.organization_id, hierarchy.facility_id,
    hierarchy.parent_equipment_id, hierarchy.equipment_code, hierarchy.display_name,
    hierarchy.equipment_type, hierarchy.status, hierarchy.manufacturer, hierarchy.model,
    hierarchy.serial_number, hierarchy.location, hierarchy.commissioned_on,
    hierarchy.retired_on, hierarchy.usable_capacity, hierarchy.usable_capacity_uom,
    hierarchy.revision, hierarchy.created_by, hierarchy.updated_by,
    hierarchy.created_at, hierarchy.updated_at, hierarchy.depth,
    hierarchy.hierarchy_path
  from hierarchy order by hierarchy.hierarchy_path
$$;

create function public.guard_equipment_production_preference() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.is_production_preferred
    and new.status is distinct from 'active' then
    raise exception 'Remove the production preference before deactivating or retiring this equipment';
  end if;
  if new.is_production_preferred
    and (new.equipment_type not in ('mixer', 'tank') or new.status <> 'active') then
    raise exception 'Only active mixers and tanks can be preferred for production';
  end if;
  return new;
end $$;

create trigger equipment_production_preference_guard
  before insert or update on public.equipment
  for each row execute function public.guard_equipment_production_preference();

create table public.production_day_equipment_selections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org() references public.organizations,
  facility_id uuid not null default public.current_facility(),
  local_production_date date not null,
  worker_id uuid not null default auth.uid() references auth.users,
  mixer_equipment_id uuid not null,
  tank_equipment_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users,
  updated_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, local_production_date, worker_id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id),
  foreign key (organization_id, facility_id, mixer_equipment_id)
    references public.equipment(organization_id, facility_id, id),
  foreign key (organization_id, facility_id, tank_equipment_id)
    references public.equipment(organization_id, facility_id, id)
);

create function public.guard_production_day_equipment_selection() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  selected_mixer public.equipment%rowtype;
  selected_tank public.equipment%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.worker_id is distinct from auth.uid()
      or new.created_by is distinct from auth.uid()
      or new.updated_by is distinct from auth.uid() then
      raise exception 'Invalid production-day equipment actor';
    end if;
  elsif (new.id, new.organization_id, new.facility_id, new.local_production_date,
      new.worker_id, new.created_by, new.created_at)
    is distinct from
    (old.id, old.organization_id, old.facility_id, old.local_production_date,
      old.worker_id, old.created_by, old.created_at)
    or new.revision <> old.revision + 1 then
    raise exception 'Production-day equipment identity is immutable or revision is stale';
  else
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;

  select * into selected_mixer from public.equipment
  where organization_id = new.organization_id and facility_id = new.facility_id
    and id = new.mixer_equipment_id;
  if selected_mixer.id is null or selected_mixer.equipment_type <> 'mixer'
    or selected_mixer.status <> 'active' or selected_mixer.usable_capacity is null
    or not exists (select 1 from public.uoms where organization_id = new.organization_id
      and code = selected_mixer.usable_capacity_uom
      and family_code in ('mass', 'volume') and active and is_inventory_unit) then
    raise exception 'Choose an active same-facility mixer with typed usable capacity';
  end if;

  select * into selected_tank from public.equipment
  where organization_id = new.organization_id and facility_id = new.facility_id
    and id = new.tank_equipment_id;
  if selected_tank.id is null or selected_tank.equipment_type <> 'tank'
    or selected_tank.status <> 'active' or selected_tank.usable_capacity is null
    or not exists (select 1 from public.uoms where organization_id = new.organization_id
      and code = selected_tank.usable_capacity_uom
      and family_code in ('mass', 'volume') and active and is_inventory_unit) then
    raise exception 'Choose an active same-facility tank with typed usable capacity';
  end if;
  return new;
end $$;

create trigger production_day_equipment_selection_guard
  before insert or update on public.production_day_equipment_selections
  for each row execute function public.guard_production_day_equipment_selection();
create trigger production_day_equipment_selection_audit
  after insert or update on public.production_day_equipment_selections
  for each row execute function public.audit_change();

alter table public.production_day_equipment_selections enable row level security;
create policy production_day_equipment_selection_read
  on public.production_day_equipment_selections for select to authenticated
  using (organization_id = public.current_org() and facility_id = public.current_facility()
    and worker_id = auth.uid() and public.has_permission('production.mobile'));
create policy production_day_equipment_selection_insert
  on public.production_day_equipment_selections for insert to authenticated
  with check (organization_id = public.current_org() and facility_id = public.current_facility()
    and worker_id = auth.uid() and created_by = auth.uid() and updated_by = auth.uid()
    and public.has_permission('production.mobile'));
create policy production_day_equipment_selection_update
  on public.production_day_equipment_selections for update to authenticated
  using (organization_id = public.current_org() and facility_id = public.current_facility()
    and worker_id = auth.uid() and public.has_permission('production.mobile'))
  with check (organization_id = public.current_org() and facility_id = public.current_facility()
    and worker_id = auth.uid() and updated_by = auth.uid()
    and public.has_permission('production.mobile'));

revoke all on public.production_day_equipment_selections from anon, authenticated;
grant select, insert, update on public.production_day_equipment_selections to authenticated;

create function public.production_day_equipment_setup(requested_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'local_production_date', requested_date,
    'selection', (select to_jsonb(selection) from public.production_day_equipment_selections selection
      where selection.organization_id = public.current_org()
        and selection.facility_id = public.current_facility()
        and selection.worker_id = auth.uid()
        and selection.local_production_date = requested_date),
    'mixers', coalesce((select jsonb_agg(to_jsonb(equipment) order by
      equipment.is_production_preferred desc, equipment.display_name)
      from public.equipment equipment
      join public.uoms capacity_uom on capacity_uom.organization_id = equipment.organization_id
        and capacity_uom.code = equipment.usable_capacity_uom
        and capacity_uom.family_code in ('mass', 'volume')
        and capacity_uom.active and capacity_uom.is_inventory_unit
      where equipment.organization_id = public.current_org()
        and equipment.facility_id = public.current_facility()
        and equipment.equipment_type = 'mixer' and equipment.status = 'active'), '[]'::jsonb),
    'tanks', coalesce((select jsonb_agg(to_jsonb(equipment) order by
      equipment.is_production_preferred desc, equipment.display_name)
      from public.equipment equipment
      join public.uoms capacity_uom on capacity_uom.organization_id = equipment.organization_id
        and capacity_uom.code = equipment.usable_capacity_uom
        and capacity_uom.family_code in ('mass', 'volume')
        and capacity_uom.active and capacity_uom.is_inventory_unit
      where equipment.organization_id = public.current_org()
        and equipment.facility_id = public.current_facility()
        and equipment.equipment_type = 'tank' and equipment.status = 'active'), '[]'::jsonb)
  ) where public.has_permission('production.mobile')
$$;

create function public.save_production_day_equipment_selection(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_date date := (payload->>'local_production_date')::date;
  requested_mixer_id uuid := (payload->>'mixer_equipment_id')::uuid;
  requested_tank_id uuid := (payload->>'tank_equipment_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  prior public.production_day_equipment_selections%rowtype;
begin
  if not public.has_permission('production.mobile') then
    raise exception 'Production execution permission required';
  end if;
  if requested_date is null or requested_mixer_id is null or requested_tank_id is null
    or requested_revision is null or requested_revision < 0 then
    raise exception 'Confirm a production date, mixer, tank, and current revision';
  end if;
  select * into prior from public.production_day_equipment_selections
  where organization_id = public.current_org() and facility_id = public.current_facility()
    and worker_id = auth.uid() and local_production_date = requested_date for update;
  if prior.id is null then
    if requested_revision <> 0 then
      raise exception 'Production-day equipment changed; reload and try again';
    end if;
    insert into public.production_day_equipment_selections(
      local_production_date, mixer_equipment_id, tank_equipment_id
    ) values (requested_date, requested_mixer_id, requested_tank_id) returning id into prior.id;
  else
    if prior.revision is distinct from requested_revision then
      raise exception 'Production-day equipment changed; reload and try again';
    end if;
    update public.production_day_equipment_selections
    set mixer_equipment_id = requested_mixer_id, tank_equipment_id = requested_tank_id,
      revision = revision + 1 where id = prior.id;
  end if;
  return prior.id;
end $$;

create or replace function public.start_production_batch(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_batch_id uuid := (payload->>'production_batch_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  batch public.production_batches%rowtype;
  day_selection public.production_day_equipment_selections%rowtype;
begin
  if not public.has_permission('production.mobile') then
    raise exception 'Production execution permission required';
  end if;
  if requested_batch_id is null or requested_revision is null or requested_revision <= 0 then
    raise exception 'Select a production batch with a current revision before starting';
  end if;
  select * into batch from public.production_batches
  where organization_id = public.current_org() and facility_id = public.current_facility()
    and id = requested_batch_id for update;
  if batch.id is null then raise exception 'Production batch unavailable'; end if;
  if batch.revision is distinct from requested_revision then
    raise exception 'Production batch changed; reload and try again';
  end if;
  if batch.state <> 'not_started' then
    raise exception 'Production batch has already left not started';
  end if;
  select * into day_selection from public.production_day_equipment_selections
  where organization_id = batch.organization_id and facility_id = batch.facility_id
    and worker_id = auth.uid() and local_production_date = batch.local_production_date for update;
  if day_selection.id is null then
    raise exception 'Confirm your mixer and tank for this production day before starting a batch';
  end if;
  update public.production_batches
  set mixer_equipment_id = day_selection.mixer_equipment_id,
    tank_equipment_id = day_selection.tank_equipment_id,
    state = 'in_progress', started_at = now(), revision = revision + 1
  where id = batch.id;
  return batch.id;
end $$;

revoke all on function public.guard_equipment_production_preference(),
  public.guard_production_day_equipment_selection() from public, anon, authenticated;
revoke all on function public.production_day_equipment_setup(date),
  public.save_production_day_equipment_selection(jsonb),
  public.start_production_batch(jsonb) from public, anon, authenticated;
grant execute on function public.production_day_equipment_setup(date),
  public.save_production_day_equipment_selection(jsonb),
  public.start_production_batch(jsonb) to authenticated;

commit;
