begin;

-- workforce_work_queue_items already contains the scheduling, staffing,
-- publication, claim, status, revision and audit behavior of a generic work
-- order. Keep that single source of truth and expose work-order terminology at
-- the API boundary rather than creating a second scheduling table.
alter table public.workforce_work_queue_items
  add constraint workforce_work_queue_items_execution_reference
    unique (organization_id, facility_id, id, kind);

-- Planned rows remain planning context; one Work Order can coordinate several
-- physical mixer charges or prep executions.
do $$
declare target_constraint text;
begin
  select constraints.constraint_name into target_constraint
  from information_schema.table_constraints constraints
  where table_schema = 'public' and table_name = 'production_batches'
    and constraint_type = 'UNIQUE'
    and constraints.constraint_name like '%planned_mixer_batch%';
  if target_constraint is not null then
    execute format('alter table public.production_batches drop constraint %I', target_constraint);
  end if;
  select constraints.constraint_name into target_constraint
  from information_schema.table_constraints constraints
  where table_schema = 'public' and table_name = 'preparation_executions'
    and constraint_type = 'UNIQUE'
    and constraints.constraint_name like '%planned_spice_preparation%';
  if target_constraint is not null then
    execute format('alter table public.preparation_executions drop constraint %I', target_constraint);
  end if;
end $$;

alter table public.production_batches
  add column work_order_id uuid,
  add column work_order_kind text generated always as ('mixing'::text) stored,
  add constraint production_batch_work_order_required_at_start check (
    state = 'not_started' or work_order_id is not null
  ),
  add constraint production_batch_mixing_work_order_fk foreign key (
    organization_id, facility_id, work_order_id, work_order_kind
  ) references public.workforce_work_queue_items(
    organization_id, facility_id, id, kind
  ) on delete restrict;

alter table public.preparation_executions
  add column work_order_id uuid,
  add column work_order_kind text generated always as ('ingredient_prep'::text) stored,
  add constraint preparation_execution_work_order_required_at_start check (
    state = 'not_started' or work_order_id is not null
  ),
  add constraint preparation_execution_prep_work_order_fk foreign key (
    organization_id, facility_id, work_order_id, work_order_kind
  ) references public.workforce_work_queue_items(
    organization_id, facility_id, id, kind
  ) on delete restrict;

create index production_batches_work_order
  on public.production_batches(organization_id, facility_id, work_order_id);
create index preparation_executions_work_order
  on public.preparation_executions(organization_id, facility_id, work_order_id);

create function public.guard_execution_work_order_link() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  work_order public.workforce_work_queue_items%rowtype;
  planned_order_id uuid;
begin
  if tg_op = 'UPDATE'
    and old.state <> 'not_started'
    and new.work_order_id is distinct from old.work_order_id then
    raise exception 'Execution work order is immutable after work starts';
  end if;
  if new.state <> 'not_started' and new.work_order_id is null then
    raise exception 'Link the execution to its work order before starting';
  end if;
  if new.work_order_id is null then return new; end if;

  select * into work_order from public.workforce_work_queue_items
  where organization_id = new.organization_id
    and facility_id = new.facility_id
    and id = new.work_order_id
  for key share;
  if work_order.id is null then raise exception 'Work order unavailable'; end if;

  if tg_table_name = 'production_batches' then
    if work_order.kind <> 'mixing' then
      raise exception 'A production batch requires a Mixing work order';
    end if;
    select planned.order_id into planned_order_id
    from public.planned_mixer_batches planned
    where planned.organization_id = new.organization_id
      and planned.facility_id = new.facility_id
      and planned.id = new.planned_mixer_batch_id;
    if (work_order.linked_task_type = 'planned_mixer_batch'
        and work_order.linked_task_id is distinct from new.planned_mixer_batch_id)
      or (work_order.linked_task_type = 'production_plan'
        and work_order.linked_task_id is distinct from planned_order_id) then
      raise exception 'Mixing work order does not match the batch plan';
    end if;
  elsif tg_table_name = 'preparation_executions' then
    if work_order.kind <> 'ingredient_prep' then
      raise exception 'A preparation execution requires an Ingredient prep work order';
    end if;
    select planned_batch.order_id into planned_order_id
    from public.planned_spice_preparations preparation
    join public.planned_mixer_batches planned_batch
      on planned_batch.organization_id = preparation.organization_id
      and planned_batch.facility_id = preparation.facility_id
      and planned_batch.id = preparation.planned_mixer_batch_id
    where preparation.organization_id = new.organization_id
      and preparation.facility_id = new.facility_id
      and preparation.id = new.planned_spice_preparation_id;
    if (work_order.linked_task_type = 'planned_spice_preparation'
        and work_order.linked_task_id is distinct from new.planned_spice_preparation_id)
      or (work_order.linked_task_type = 'production_plan'
        and work_order.linked_task_id is distinct from planned_order_id) then
      raise exception 'Ingredient prep work order does not match the preparation plan';
    end if;
  else
    raise exception 'Unsupported execution work-order link';
  end if;
  return new;
end $$;

create trigger production_batch_work_order_guard
  before insert or update on public.production_batches
  for each row execute function public.guard_execution_work_order_link();
create trigger preparation_execution_work_order_guard
  before insert or update on public.preparation_executions
  for each row execute function public.guard_execution_work_order_link();

-- Stable product-facing create name. The established function remains the
-- compatibility implementation and retains all permission and payload checks.
create function public.create_work_order(payload jsonb) returns uuid
language sql security invoker set search_path = '' as $$
  select public.create_workforce_work_queue_item(payload)
$$;

create function public.link_execution_work_order(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  execution_type_value text;
  execution_id_value uuid;
  work_order_id_value uuid;
  requested_revision integer;
  batch public.production_batches%rowtype;
  preparation public.preparation_executions%rowtype;
begin
  if not (public.has_permission('production.mobile')
      or public.has_permission('workforce.manage')) then
    raise exception 'Production execution or workforce management permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['execution_type', 'execution_id', 'work_order_id', 'revision']
    or payload - array['execution_type', 'execution_id', 'work_order_id', 'revision'] <> '{}'::jsonb
    or payload->>'execution_type' not in ('production_batch', 'preparation_execution')
    or coalesce(payload->>'execution_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'work_order_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'revision', '') !~ '^[1-9][0-9]*$' then
    raise exception 'Choose an execution, work order, and current revision';
  end if;
  execution_type_value := payload->>'execution_type';
  execution_id_value := (payload->>'execution_id')::uuid;
  work_order_id_value := (payload->>'work_order_id')::uuid;
  requested_revision := (payload->>'revision')::integer;

  if execution_type_value = 'production_batch' then
    select * into batch from public.production_batches
    where organization_id = public.current_org()
      and facility_id = public.current_facility()
      and id = execution_id_value
    for update;
    if batch.id is null then raise exception 'Production batch unavailable'; end if;
    if batch.revision is distinct from requested_revision then
      raise exception 'Production batch changed; reload and try again';
    end if;
    if batch.state <> 'not_started' then
      raise exception 'Production batch work order cannot change after work starts';
    end if;
    if batch.work_order_id is not distinct from work_order_id_value then return batch.id; end if;
    update public.production_batches
    set work_order_id = work_order_id_value, revision = revision + 1
    where id = batch.id;
    return batch.id;
  end if;

  select * into preparation from public.preparation_executions
  where organization_id = public.current_org()
    and facility_id = public.current_facility()
    and id = execution_id_value
  for update;
  if preparation.id is null then raise exception 'Preparation execution unavailable'; end if;
  if preparation.revision is distinct from requested_revision then
    raise exception 'Preparation execution changed; reload and try again';
  end if;
  if preparation.state <> 'not_started' then
    raise exception 'Preparation execution work order cannot change after work starts';
  end if;
  if preparation.work_order_id is not distinct from work_order_id_value then
    return preparation.id;
  end if;
  update public.preparation_executions
  set work_order_id = work_order_id_value, revision = revision + 1
  where id = preparation.id;
  return preparation.id;
end $$;

create function public.get_work_order(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  work_order_id_value uuid;
  work_order public.workforce_work_queue_items%rowtype;
begin
  if not (public.has_permission('workforce.read')
      or public.has_permission('production.mobile')) then
    raise exception 'Workforce or production read permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ? 'work_order_id'
    or payload - 'work_order_id' <> '{}'::jsonb
    or coalesce(payload->>'work_order_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Choose a valid work order';
  end if;
  work_order_id_value := (payload->>'work_order_id')::uuid;
  select * into work_order from public.workforce_work_queue_items item
  where item.organization_id = public.current_org()
    and item.facility_id = public.current_facility()
    and item.id = work_order_id_value;
  if work_order.id is null then raise exception 'Work order unavailable'; end if;

  return jsonb_build_object(
    'work_order', to_jsonb(work_order),
    'production_batches', coalesce((select jsonb_agg(jsonb_build_object(
      'id', batch.id, 'run_code', batch.run_code, 'state', batch.state,
      'revision', batch.revision, 'started_at', batch.started_at,
      'completed_at', batch.completed_at
    ) order by batch.local_production_date, batch.run_sequence)
      from public.production_batches batch
      where batch.organization_id = work_order.organization_id
        and batch.facility_id = work_order.facility_id
        and batch.work_order_id = work_order.id), '[]'::jsonb),
    'preparation_executions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', preparation.id, 'state', preparation.state,
      'revision', preparation.revision, 'started_at', preparation.started_at,
      'completed_at', preparation.completed_at
    ) order by preparation.local_production_date, preparation.created_at)
      from public.preparation_executions preparation
      where preparation.organization_id = work_order.organization_id
        and preparation.facility_id = work_order.facility_id
        and preparation.work_order_id = work_order.id), '[]'::jsonb)
  );
end $$;

-- Equipment is confirmed for the physical mixer charge. The optional saved
-- worker/day selection remains usable as a UI prefill but is not read here and
-- never gates batch execution.
create or replace function public.start_production_batch(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_batch_id uuid;
  requested_revision integer;
  requested_mixer_id uuid;
  requested_tank_id uuid;
  batch public.production_batches%rowtype;
  work_order public.workforce_work_queue_items%rowtype;
begin
  if not public.has_permission('production.mobile') then
    raise exception 'Production execution permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array[
      'production_batch_id', 'revision', 'mixer_equipment_id', 'tank_equipment_id'
    ]
    or payload - array[
      'production_batch_id', 'revision', 'mixer_equipment_id', 'tank_equipment_id'
    ] <> '{}'::jsonb
    or coalesce(payload->>'production_batch_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'mixer_equipment_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'tank_equipment_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'revision', '') !~ '^[1-9][0-9]*$' then
    raise exception 'Select a production batch, mixer, tank, and current revision before starting';
  end if;
  requested_batch_id := (payload->>'production_batch_id')::uuid;
  requested_revision := (payload->>'revision')::integer;
  requested_mixer_id := (payload->>'mixer_equipment_id')::uuid;
  requested_tank_id := (payload->>'tank_equipment_id')::uuid;

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
  if batch.work_order_id is null then
    raise exception 'Link the production batch to its Mixing work order before starting';
  end if;
  select * into work_order from public.workforce_work_queue_items item
  where item.organization_id = batch.organization_id
    and item.facility_id = batch.facility_id
    and item.id = batch.work_order_id
    and item.kind = 'mixing'
  for key share;
  if work_order.id is null then raise exception 'Mixing work order unavailable'; end if;
  if work_order.publication_state <> 'published'
    or work_order.status in ('cancelled', 'completed') then
    raise exception 'Mixing work order is not available to start';
  end if;

  update public.production_batches
  set mixer_equipment_id = requested_mixer_id,
    tank_equipment_id = requested_tank_id,
    state = 'in_progress', started_at = now(), revision = revision + 1
  where id = batch.id;
  return batch.id;
end $$;

revoke all on function public.guard_execution_work_order_link(),
  public.create_work_order(jsonb), public.link_execution_work_order(jsonb),
  public.get_work_order(jsonb), public.start_production_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_work_order(jsonb),
  public.link_execution_work_order(jsonb), public.get_work_order(jsonb),
  public.start_production_batch(jsonb) to authenticated;

comment on table public.workforce_work_queue_items is
  'Canonical generic work orders: scheduled, staffed, published and status-tracked work.';
comment on column public.production_batches.work_order_id is
  'Mixing work order that coordinated this physical mixer charge; planning linkage remains separate.';
comment on column public.preparation_executions.work_order_id is
  'Ingredient Prep work order that coordinated this preparation execution; planning linkage remains separate.';

commit;
/* Superseded draft retained only while this uncommitted shared worktree is
   reconciled. It is intentionally excluded from the migration. */
/*

-- `workforce_work_queue_items` is the operational work-order system.  Its
-- historical name remains internal for now; this view is the canonical read
-- vocabulary without copying rows or introducing another lifecycle.
create view public.work_orders with (security_invoker = true) as
  select * from public.workforce_work_queue_items;

comment on view public.work_orders is
  'Canonical operational work orders. Backed by workforce_work_queue_items; scheduling remains a projection.';

alter table public.workforce_work_queue_items
  add constraint workforce_work_queue_items_org_facility_id_key
    unique (organization_id, facility_id, id);

-- A planned mixer/prep row may now result in more than one physical execution.
-- The actual execution instead belongs to its work order, while the planned
-- row remains useful planning context.
alter table public.production_batches
  drop constraint production_batches_organization_id_facility_id_planned_mixer_batch_id_key,
  add column work_order_id uuid,
  add foreign key (organization_id, facility_id, work_order_id)
    references public.workforce_work_queue_items(organization_id, facility_id, id);

alter table public.preparation_executions
  drop constraint preparation_executions_organization_id_facility_id_planned_spice_preparation_id_key,
  add column work_order_id uuid,
  add foreign key (organization_id, facility_id, work_order_id)
    references public.workforce_work_queue_items(organization_id, facility_id, id);

create index production_batches_work_order
  on public.production_batches(organization_id, facility_id, work_order_id)
  where work_order_id is not null;
create index preparation_executions_work_order
  on public.preparation_executions(organization_id, facility_id, work_order_id)
  where work_order_id is not null;

create function public.guard_execution_work_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare expected_kind text := case tg_table_name
  when 'production_batches' then 'mixing'
  when 'preparation_executions' then 'ingredient_prep'
end;
declare linked_work public.workforce_work_queue_items%rowtype;
begin
  if new.work_order_id is null then
    return new;
  end if;
  select * into linked_work
  from public.workforce_work_queue_items
  where organization_id = new.organization_id and facility_id = new.facility_id
    and id = new.work_order_id
  for key share;
  if linked_work.id is null or linked_work.kind <> expected_kind
    or linked_work.publication_state = 'cancelled'
    or linked_work.status = 'cancelled' then
    raise exception 'Execution must link to an active % work order', expected_kind;
  end if;
  return new;
end $$;

create trigger production_batch_work_order_guard
  before insert or update on public.production_batches
  for each row execute function public.guard_execution_work_order();
create trigger preparation_execution_work_order_guard
  before insert or update on public.preparation_executions
  for each row execute function public.guard_execution_work_order();

-- A start is the mixing event: it names the accountable Mixing work order and
-- confirms the mixer/tank. The existing equipment snapshot trigger validates
-- both assets and freezes their identity/capacity on the actual batch.
create or replace function public.start_production_batch(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_batch_id uuid := (payload->>'production_batch_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  requested_work_order_id uuid := (payload->>'work_order_id')::uuid;
  requested_mixer_id uuid := (payload->>'mixer_equipment_id')::uuid;
  requested_tank_id uuid := (payload->>'tank_equipment_id')::uuid;
  batch public.production_batches%rowtype;
  linked_work public.workforce_work_queue_items%rowtype;
begin
  if not public.has_permission('production.mobile') then
    raise exception 'Production execution permission required';
  end if;
  if requested_batch_id is null or requested_revision is null or requested_revision <= 0
    or requested_work_order_id is null or requested_mixer_id is null or requested_tank_id is null then
    raise exception 'Choose the Mixing work order, mixer, tank, and current batch revision before starting';
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
  select * into linked_work from public.workforce_work_queue_items
  where organization_id = batch.organization_id and facility_id = batch.facility_id
    and id = requested_work_order_id for key share;
  if linked_work.id is null or linked_work.kind <> 'mixing'
    or linked_work.publication_state = 'cancelled' or linked_work.status = 'cancelled' then
    raise exception 'Choose an active Mixing work order for this batch';
  end if;
  update public.production_batches
  set work_order_id = requested_work_order_id,
    mixer_equipment_id = requested_mixer_id,
    tank_equipment_id = requested_tank_id,
    state = 'in_progress', started_at = now(), revision = revision + 1
  where id = batch.id;
  return batch.id;
end $$;

revoke all on function public.guard_execution_work_order() from public, anon, authenticated;
revoke all on function public.start_production_batch(jsonb) from public, anon, authenticated;
revoke all on public.work_orders from public, anon, authenticated;
grant execute on function public.start_production_batch(jsonb) to authenticated;

commit;
*/
