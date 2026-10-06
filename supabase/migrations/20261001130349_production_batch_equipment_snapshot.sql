begin;

-- There is no trustworthy source from which to reconstruct equipment used by an
-- already-started charge. Refuse to fabricate history if this migration is ever
-- applied after the execution foundation has received operational data.
do $$ begin
  if exists (
    select 1 from public.production_batches where state <> 'not_started'
  ) then
    raise exception 'Cannot add equipment snapshots after production batches have started';
  end if;
end $$;

alter table public.production_batches
  add column mixer_equipment_id uuid,
  add column mixer_equipment_code_snapshot text,
  add column mixer_equipment_name_snapshot text,
  add column mixer_equipment_type_snapshot text,
  add column mixer_usable_capacity_snapshot numeric(14, 4),
  add column mixer_usable_capacity_uom_snapshot text,
  add column tank_equipment_id uuid,
  add column tank_equipment_code_snapshot text,
  add column tank_equipment_name_snapshot text,
  add column tank_equipment_type_snapshot text,
  add column tank_usable_capacity_snapshot numeric(14, 4),
  add column tank_usable_capacity_uom_snapshot text,
  add column expected_yield_quantity numeric(14, 4),
  add column expected_yield_uom text,
  add foreign key (organization_id, facility_id, mixer_equipment_id)
    references public.equipment(organization_id, facility_id, id),
  add foreign key (organization_id, facility_id, tank_equipment_id)
    references public.equipment(organization_id, facility_id, id),
  add constraint production_batch_equipment_start_snapshot check (
    (state = 'not_started'
      and mixer_equipment_id is null
      and mixer_equipment_code_snapshot is null
      and mixer_equipment_name_snapshot is null
      and mixer_equipment_type_snapshot is null
      and mixer_usable_capacity_snapshot is null
      and mixer_usable_capacity_uom_snapshot is null
      and tank_equipment_id is null
      and tank_equipment_code_snapshot is null
      and tank_equipment_name_snapshot is null
      and tank_equipment_type_snapshot is null
      and tank_usable_capacity_snapshot is null
      and tank_usable_capacity_uom_snapshot is null
      and expected_yield_quantity is null
      and expected_yield_uom is null)
    or (state <> 'not_started'
      and mixer_equipment_id is not null
      and mixer_equipment_code_snapshot is not null
      and mixer_equipment_name_snapshot is not null
      and mixer_equipment_type_snapshot = 'mixer'
      and mixer_usable_capacity_snapshot > 0
      and mixer_usable_capacity_uom_snapshot is not null
      and tank_equipment_id is not null
      and tank_equipment_code_snapshot is not null
      and tank_equipment_name_snapshot is not null
      and tank_equipment_type_snapshot = 'tank'
      and tank_usable_capacity_snapshot > 0
      and tank_usable_capacity_uom_snapshot is not null
      and expected_yield_quantity = tank_usable_capacity_snapshot
      and expected_yield_uom = tank_usable_capacity_uom_snapshot)
  );

create index production_batches_mixer_equipment
  on public.production_batches(organization_id, facility_id, mixer_equipment_id)
  where mixer_equipment_id is not null;
create index production_batches_tank_equipment
  on public.production_batches(organization_id, facility_id, tank_equipment_id)
  where tank_equipment_id is not null;

create function public.guard_production_batch_equipment_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  selected_mixer public.equipment%rowtype;
  selected_tank public.equipment%rowtype;
begin
  if tg_op = 'DELETE' then return old; end if;

  if tg_op = 'INSERT' and new.state <> 'not_started' then
    raise exception 'Create production batches as not started before actual batch start';
  end if;

  -- Yield, quality, hold, rejection, and cancellation transitions belong to a
  -- later execution layer. Until then, the only enabled lifecycle change is an
  -- actual start with its required equipment snapshot.
  if tg_op = 'UPDATE' and new.state is distinct from old.state
    and (old.state <> 'not_started' or new.state <> 'in_progress') then
    raise exception 'Only actual production batch start is enabled';
  end if;

  if tg_op = 'UPDATE' and old.mixer_equipment_id is not null then
    if (new.mixer_equipment_id, new.mixer_equipment_code_snapshot,
        new.mixer_equipment_name_snapshot, new.mixer_equipment_type_snapshot,
        new.mixer_usable_capacity_snapshot, new.mixer_usable_capacity_uom_snapshot,
        new.tank_equipment_id, new.tank_equipment_code_snapshot,
        new.tank_equipment_name_snapshot, new.tank_equipment_type_snapshot,
        new.tank_usable_capacity_snapshot, new.tank_usable_capacity_uom_snapshot,
        new.expected_yield_quantity, new.expected_yield_uom)
      is distinct from
       (old.mixer_equipment_id, old.mixer_equipment_code_snapshot,
        old.mixer_equipment_name_snapshot, old.mixer_equipment_type_snapshot,
        old.mixer_usable_capacity_snapshot, old.mixer_usable_capacity_uom_snapshot,
        old.tank_equipment_id, old.tank_equipment_code_snapshot,
        old.tank_equipment_name_snapshot, old.tank_equipment_type_snapshot,
        old.tank_usable_capacity_snapshot, old.tank_usable_capacity_uom_snapshot,
        old.expected_yield_quantity, old.expected_yield_uom) then
      raise exception 'Production batch equipment and capacity snapshots are immutable';
    end if;
    return new;
  end if;

  if new.state = 'not_started' then
    if new.mixer_equipment_id is not null or new.tank_equipment_id is not null then
      raise exception 'Select equipment only when starting the actual production batch';
    end if;
    return new;
  end if;

  if new.mixer_equipment_id is null or new.tank_equipment_id is null then
    raise exception 'Actual batch start requires an active mixer and tank with usable capacity';
  end if;

  select * into selected_mixer from public.equipment
  where organization_id = new.organization_id
    and facility_id = new.facility_id
    and id = new.mixer_equipment_id
  for update;
  if selected_mixer.id is null
    or selected_mixer.equipment_type <> 'mixer'
    or selected_mixer.status <> 'active'
    or selected_mixer.usable_capacity is null
    or selected_mixer.usable_capacity_uom is null then
    raise exception 'Choose an active same-facility mixer with typed usable capacity';
  end if;
  select * into selected_tank from public.equipment
  where organization_id = new.organization_id
    and facility_id = new.facility_id
    and id = new.tank_equipment_id
  for update;
  if selected_tank.id is null
    or selected_tank.equipment_type <> 'tank'
    or selected_tank.status <> 'active'
    or selected_tank.usable_capacity is null
    or selected_tank.usable_capacity_uom is null then
    raise exception 'Choose an active same-facility tank with typed usable capacity';
  end if;
  -- Lock capacity units in a deterministic order so two starts using different
  -- mixer/tank unit pairs cannot deadlock while configuration is being edited.
  perform 1 from public.uoms
  where organization_id = new.organization_id
    and code in (
      selected_mixer.usable_capacity_uom, selected_tank.usable_capacity_uom
    )
  order by code
  for update;
  if not exists (
    select 1 from public.uoms
    where organization_id = new.organization_id
      and code = selected_mixer.usable_capacity_uom
      and family_code in ('mass', 'volume')
      and active
      and is_inventory_unit
  ) then
    raise exception 'Choose an active same-facility mixer with typed usable capacity';
  end if;
  if not exists (
    select 1 from public.uoms
    where organization_id = new.organization_id
      and code = selected_tank.usable_capacity_uom
      and family_code in ('mass', 'volume')
      and active
      and is_inventory_unit
  ) then
    raise exception 'Choose an active same-facility tank with typed usable capacity';
  end if;

  new.mixer_equipment_code_snapshot := selected_mixer.equipment_code;
  new.mixer_equipment_name_snapshot := selected_mixer.display_name;
  new.mixer_equipment_type_snapshot := selected_mixer.equipment_type;
  new.mixer_usable_capacity_snapshot := selected_mixer.usable_capacity;
  new.mixer_usable_capacity_uom_snapshot := selected_mixer.usable_capacity_uom;
  new.tank_equipment_code_snapshot := selected_tank.equipment_code;
  new.tank_equipment_name_snapshot := selected_tank.display_name;
  new.tank_equipment_type_snapshot := selected_tank.equipment_type;
  new.tank_usable_capacity_snapshot := selected_tank.usable_capacity;
  new.tank_usable_capacity_uom_snapshot := selected_tank.usable_capacity_uom;
  new.expected_yield_quantity := selected_tank.usable_capacity;
  new.expected_yield_uom := selected_tank.usable_capacity_uom;
  return new;
end $$;

create trigger production_batch_equipment_snapshot_guard
  before insert or update or delete on public.production_batches
  for each row execute function public.guard_production_batch_equipment_snapshot();

create function public.start_production_batch(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_batch_id uuid := (payload->>'production_batch_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  batch public.production_batches%rowtype;
begin
  if not public.has_permission('production.mobile') then
    raise exception 'Production execution permission required';
  end if;
  if requested_batch_id is null or requested_revision is null
    or requested_revision <= 0 then
    raise exception 'Choose a valid production batch before starting';
  end if;

  select * into batch from public.production_batches
  where organization_id = public.current_org()
    and facility_id = public.current_facility()
    and id = requested_batch_id
  for update;
  if batch.id is null then raise exception 'Production batch unavailable'; end if;
  if batch.revision is distinct from requested_revision then
    raise exception 'Production batch changed; reload and try again';
  end if;
  if batch.state <> 'not_started' then
    raise exception 'Production batch has already left not started';
  end if;

  update public.production_batches
  set state = 'in_progress',
    started_at = now(),
    revision = revision + 1
  where id = batch.id;
  return batch.id;
end $$;

revoke all on function public.guard_production_batch_equipment_snapshot()
  from public, anon, authenticated;
revoke all on function public.start_production_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.start_production_batch(jsonb) to authenticated;

commit;
