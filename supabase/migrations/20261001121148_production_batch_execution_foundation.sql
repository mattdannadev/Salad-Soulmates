begin;

-- Execution records are additive. Existing production_lots and worksheet rows
-- remain legacy planning/preparation evidence and are not promoted to proof that
-- a mixer charge occurred.
alter table public.facilities
  add column preparation_traceability_mode text not null default 'production_day_product'
    check (preparation_traceability_mode in (
      'production_day_product', 'batch_specific_allocation'
    ));

create table public.finished_recall_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  product_id uuid not null,
  local_production_date date not null,
  recall_lot_code text not null check (
    length(trim(recall_lot_code)) between 1 and 80
    and recall_lot_code = upper(trim(recall_lot_code))
  ),
  product_name_snapshot text not null check (length(trim(product_name_snapshot)) between 1 and 120),
  state text not null default 'open' check (state in ('open', 'released', 'on_hold', 'closed', 'recalled')),
  idempotency_key uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, product_id, local_production_date),
  unique (organization_id, facility_id, recall_lot_code),
  unique (organization_id, facility_id, idempotency_key),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id),
  foreign key (organization_id, product_id)
    references public.products(organization_id, id)
);

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  planned_mixer_batch_id uuid not null,
  product_id uuid not null,
  recipe_version_id uuid not null,
  finished_recall_lot_id uuid,
  local_production_date date not null,
  run_sequence integer not null check (run_sequence > 0),
  run_code text not null check (
    length(trim(run_code)) between 1 and 80
    and run_code = upper(trim(run_code))
  ),
  product_name_snapshot text not null check (length(trim(product_name_snapshot)) between 1 and 120),
  recipe_name_snapshot text not null check (length(trim(recipe_name_snapshot)) between 1 and 120),
  recipe_version_snapshot integer not null check (recipe_version_snapshot > 0),
  preparation_traceability_mode_snapshot text not null check (
    preparation_traceability_mode_snapshot in (
      'production_day_product', 'batch_specific_allocation'
    )
  ),
  state text not null default 'not_started' check (state in (
    'not_started', 'in_progress', 'awaiting_quality', 'released', 'on_hold',
    'rejected', 'cancelled'
  )),
  started_at timestamptz,
  completed_at timestamptz,
  idempotency_key uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, planned_mixer_batch_id),
  unique (organization_id, facility_id, run_code),
  unique (organization_id, facility_id, product_id, local_production_date, run_sequence),
  unique (organization_id, facility_id, idempotency_key),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id),
  foreign key (organization_id, facility_id, planned_mixer_batch_id)
    references public.planned_mixer_batches(organization_id, facility_id, id),
  foreign key (organization_id, product_id)
    references public.products(organization_id, id),
  foreign key (organization_id, recipe_version_id)
    references public.recipe_versions(organization_id, id),
  foreign key (organization_id, facility_id, finished_recall_lot_id)
    references public.finished_recall_lots(organization_id, facility_id, id),
  check (state = 'not_started' or (started_at is not null and finished_recall_lot_id is not null)),
  check (completed_at is null or started_at is not null),
  check (completed_at is null or completed_at >= started_at)
);

create table public.preparation_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  planned_spice_preparation_id uuid not null,
  product_id uuid not null,
  local_production_date date not null,
  traceability_mode_snapshot text not null check (
    traceability_mode_snapshot in (
      'production_day_product', 'batch_specific_allocation'
    )
  ),
  state text not null default 'not_started' check (state in ('not_started', 'in_progress', 'complete', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  output_quantity numeric(14,4) check (
    output_quantity > 0 and output_quantity <> 'NaN'::numeric
      and output_quantity = round(output_quantity, 4)
  ),
  output_uom text check (output_uom is null or length(trim(output_uom)) between 1 and 50),
  idempotency_key uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, planned_spice_preparation_id),
  unique (organization_id, facility_id, idempotency_key),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id),
  foreign key (organization_id, facility_id, planned_spice_preparation_id)
    references public.planned_spice_preparations(organization_id, facility_id, id),
  foreign key (organization_id, product_id)
    references public.products(organization_id, id),
  check (completed_at is null or started_at is not null),
  check (completed_at is null or completed_at >= started_at),
  check ((output_quantity is null) = (output_uom is null)),
  check (output_quantity is null or state = 'complete'),
  check (state <> 'complete' or (
    started_at is not null and completed_at is not null
      and output_quantity is not null and output_uom is not null
  ))
);

-- Allocations describe genealogy only. Ingredient inventory was already debited
-- when the preparation was completed, so this table intentionally has no
-- inventory-event foreign key or posting trigger.
create table public.production_batch_preparation_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  production_batch_id uuid not null,
  preparation_execution_id uuid not null,
  quantity numeric(14,4) not null check (
    quantity > 0 and quantity <> 'NaN'::numeric and quantity = round(quantity, 4)
  ),
  uom text not null check (length(trim(uom)) between 1 and 50),
  idempotency_key uuid not null,
  revision integer not null default 1 check (revision = 1),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, production_batch_id, preparation_execution_id),
  unique (organization_id, facility_id, idempotency_key),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id),
  foreign key (organization_id, facility_id, production_batch_id)
    references public.production_batches(organization_id, facility_id, id),
  foreign key (organization_id, facility_id, preparation_execution_id)
    references public.preparation_executions(organization_id, facility_id, id)
);

create index production_batches_recall_lot
  on public.production_batches(organization_id, facility_id, finished_recall_lot_id);
create index production_batches_state_date
  on public.production_batches(organization_id, facility_id, local_production_date, state);
create index preparation_executions_state
  on public.preparation_executions(organization_id, facility_id, state);
create index preparation_executions_trace_scope
  on public.preparation_executions(
    organization_id, facility_id, product_id, local_production_date
  );
create index production_batch_preparation_allocations_preparation
  on public.production_batch_preparation_allocations(
    organization_id, facility_id, preparation_execution_id
  );

create function public.guard_finished_recall_lot_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare canonical_product_name text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Finished recall lot identities cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.organization_id, new.facility_id, new.product_id,
        new.local_production_date, new.recall_lot_code, new.product_name_snapshot,
        new.idempotency_key, new.created_by, new.created_at)
      is distinct from
       (old.id, old.organization_id, old.facility_id, old.product_id,
        old.local_production_date, old.recall_lot_code, old.product_name_snapshot,
        old.idempotency_key, old.created_by, old.created_at)
      or new.revision <> old.revision + 1 then
      raise exception 'Finished recall lot identity is immutable or revision is stale';
    end if;
    new.updated_at := now();
    return new;
  end if;
  select product.name into canonical_product_name
  from public.products product
  where product.organization_id = new.organization_id and product.id = new.product_id;
  if canonical_product_name is null then raise exception 'Choose a product in this organization'; end if;
  new.product_name_snapshot := canonical_product_name;
  return new;
end $$;

create function public.guard_production_batch_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  planned public.planned_mixer_batches%rowtype;
  canonical_product_name text;
  canonical_product_identifier text;
  canonical_recipe_name text;
  canonical_recipe_version integer;
  recall public.finished_recall_lots%rowtype;
begin
  if tg_op = 'DELETE' then raise exception 'Production batch identities cannot be deleted'; end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.organization_id, new.facility_id, new.planned_mixer_batch_id,
        new.product_id, new.recipe_version_id, new.local_production_date,
        new.run_sequence, new.run_code, new.product_name_snapshot,
        new.recipe_name_snapshot, new.recipe_version_snapshot,
        new.preparation_traceability_mode_snapshot,
        new.idempotency_key, new.created_by, new.created_at)
      is distinct from
       (old.id, old.organization_id, old.facility_id, old.planned_mixer_batch_id,
        old.product_id, old.recipe_version_id, old.local_production_date,
        old.run_sequence, old.run_code, old.product_name_snapshot,
        old.recipe_name_snapshot, old.recipe_version_snapshot,
        old.preparation_traceability_mode_snapshot,
        old.idempotency_key, old.created_by, old.created_at)
      or (old.finished_recall_lot_id is not null
        and new.finished_recall_lot_id is distinct from old.finished_recall_lot_id)
      or new.revision <> old.revision + 1 then
      raise exception 'Production batch identity is immutable or revision is stale';
    end if;
    new.updated_at := now();
  end if;

  select * into planned from public.planned_mixer_batches
  where organization_id = new.organization_id and facility_id = new.facility_id
    and id = new.planned_mixer_batch_id;
  if planned.id is null or new.product_id is distinct from planned.product_id
    or new.recipe_version_id is distinct from planned.recipe_version_id then
    raise exception 'Production batch must match its planned mixer batch';
  end if;

  select product.name, upper(trim(product.production_lot_identifier)),
      recipe.name, version.version_number
    into canonical_product_name, canonical_product_identifier, canonical_recipe_name,
      canonical_recipe_version
  from public.products product
  join public.recipes recipe
    on recipe.organization_id = product.organization_id and recipe.product_id = product.id
  join public.recipe_versions version
    on version.organization_id = recipe.organization_id and version.recipe_id = recipe.id
  where product.organization_id = new.organization_id and product.id = new.product_id
    and version.id = new.recipe_version_id;
  if canonical_product_name is null then raise exception 'Production recipe does not belong to the planned product'; end if;
  if canonical_product_identifier is null or canonical_product_identifier = '' then
    raise exception 'Configure the product production lot identifier before starting a batch';
  end if;

  if tg_op = 'INSERT' then
    new.product_name_snapshot := canonical_product_name;
    new.recipe_name_snapshot := canonical_recipe_name;
    new.recipe_version_snapshot := canonical_recipe_version;
    select preparation_traceability_mode into new.preparation_traceability_mode_snapshot
    from public.facilities
    where organization_id = new.organization_id and id = new.facility_id;
  end if;

  -- Starting an actual mixer charge and assigning its production-day recall lot
  -- are one transaction. The scoped uniqueness constraint makes concurrent
  -- starts converge on the same lot.
  if new.state <> 'not_started' and new.finished_recall_lot_id is null then
    insert into public.finished_recall_lots(
      organization_id, facility_id, product_id, local_production_date,
      recall_lot_code, product_name_snapshot, idempotency_key
    ) values (
      new.organization_id, new.facility_id, new.product_id,
      new.local_production_date,
      canonical_product_identifier || '-' || to_char(new.local_production_date, 'YYYYMMDD'),
      canonical_product_name, gen_random_uuid()
    ) on conflict (organization_id, facility_id, product_id, local_production_date)
      do nothing;
    select id into new.finished_recall_lot_id
    from public.finished_recall_lots
    where organization_id = new.organization_id and facility_id = new.facility_id
      and product_id = new.product_id
      and local_production_date = new.local_production_date
    for update;
    if new.finished_recall_lot_id is null then
      raise exception 'Actual batch start requires a production-day recall lot';
    end if;
  end if;

  if new.finished_recall_lot_id is not null then
    select * into recall from public.finished_recall_lots
    where organization_id = new.organization_id and facility_id = new.facility_id
      and id = new.finished_recall_lot_id;
    if recall.id is null or recall.product_id is distinct from new.product_id
      or recall.local_production_date is distinct from new.local_production_date then
      raise exception 'Finished recall lot must match the batch product, facility, and local production date';
    end if;
  end if;
  return new;
end $$;

create function public.guard_preparation_execution_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare planned_preparation public.planned_spice_preparations%rowtype; planned_product_id uuid;
begin
  if tg_op = 'DELETE' then raise exception 'Preparation execution identities cannot be deleted'; end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.organization_id, new.facility_id,
        new.planned_spice_preparation_id, new.product_id, new.local_production_date,
        new.traceability_mode_snapshot,
        new.idempotency_key, new.created_by, new.created_at)
      is distinct from
       (old.id, old.organization_id, old.facility_id,
        old.planned_spice_preparation_id, old.product_id, old.local_production_date,
        old.traceability_mode_snapshot,
        old.idempotency_key, old.created_by, old.created_at)
      or (old.output_quantity is not null and (
        new.output_quantity is distinct from old.output_quantity
          or new.output_uom is distinct from old.output_uom
      )) or new.revision <> old.revision + 1 then
      raise exception 'Preparation execution identity is immutable or revision is stale';
    end if;
    new.updated_at := now();
  end if;
  select * into planned_preparation from public.planned_spice_preparations
  where organization_id = new.organization_id and facility_id = new.facility_id
    and id = new.planned_spice_preparation_id;
  select product_id into planned_product_id from public.planned_mixer_batches
  where organization_id = new.organization_id and facility_id = new.facility_id
    and id = planned_preparation.planned_mixer_batch_id;
  if planned_preparation.id is null or planned_product_id is null then
    raise exception 'Preparation execution must match its preparation plan';
  end if;
  if tg_op = 'INSERT' then
    new.product_id := planned_product_id;
    select preparation_traceability_mode into new.traceability_mode_snapshot
    from public.facilities
    where organization_id = new.organization_id and id = new.facility_id;
  elsif new.product_id is distinct from planned_product_id then
    raise exception 'Preparation execution product is immutable';
  end if;
  if new.output_uom is not null and not exists (
    select 1 from public.uoms
    where organization_id = new.organization_id and code = new.output_uom
      and active and is_inventory_unit
  ) then
    raise exception 'Choose an active inventory unit for measured preparation output';
  end if;
  return new;
end $$;

create function public.guard_production_batch_preparation_allocation() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  batch public.production_batches%rowtype;
  preparation public.preparation_executions%rowtype;
  allocated_quantity numeric;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Production batch preparation allocations are immutable';
  end if;
  -- Always lock preparation before batch. This serializes the cumulative output
  -- check and gives every allocation writer the same lock order.
  select * into preparation from public.preparation_executions
  where organization_id = new.organization_id and facility_id = new.facility_id
    and id = new.preparation_execution_id for update;
  select * into batch from public.production_batches
  where organization_id = new.organization_id and facility_id = new.facility_id
    and id = new.production_batch_id for update;
  if batch.id is null or preparation.id is null
    or batch.product_id is distinct from preparation.product_id
    or batch.local_production_date is distinct from preparation.local_production_date then
    raise exception 'Preparation allocation must match the batch product, facility, and local production date';
  end if;
  if preparation.traceability_mode_snapshot <> 'batch_specific_allocation'
    or batch.preparation_traceability_mode_snapshot <> 'batch_specific_allocation' then
    raise exception 'Exact allocation requires batch-specific traceability snapshots';
  end if;
  if preparation.state <> 'complete' or preparation.output_quantity is null
    or preparation.output_uom is null then
    raise exception 'Complete the preparation with measured output before allocating it';
  end if;
  if batch.state in ('not_started', 'cancelled') or batch.started_at is null then
    raise exception 'Start the production batch before allocating preparation output';
  end if;
  if new.uom is distinct from preparation.output_uom then
    raise exception 'Preparation allocation unit must match measured output';
  end if;
  if not exists (
    select 1 from public.uoms
    where organization_id = new.organization_id and code = new.uom
      and active and is_inventory_unit
  ) then
    raise exception 'Choose an active inventory unit for the preparation allocation';
  end if;
  select coalesce(sum(quantity), 0) into allocated_quantity
  from public.production_batch_preparation_allocations
  where organization_id = new.organization_id and facility_id = new.facility_id
    and preparation_execution_id = new.preparation_execution_id;
  if allocated_quantity + new.quantity > preparation.output_quantity then
    raise exception 'Preparation allocations exceed measured output';
  end if;
  return new;
end $$;

create trigger finished_recall_lot_identity_guard
  before insert or update or delete on public.finished_recall_lots
  for each row execute function public.guard_finished_recall_lot_identity();
create trigger production_batch_identity_guard
  before insert or update or delete on public.production_batches
  for each row execute function public.guard_production_batch_identity();
create trigger preparation_execution_identity_guard
  before insert or update or delete on public.preparation_executions
  for each row execute function public.guard_preparation_execution_identity();
create trigger production_batch_preparation_allocation_guard
  before insert or update or delete on public.production_batch_preparation_allocations
  for each row execute function public.guard_production_batch_preparation_allocation();

do $$ declare relation_name text; begin
  foreach relation_name in array array[
    'finished_recall_lots', 'production_batches', 'preparation_executions',
    'production_batch_preparation_allocations'
  ] loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('revoke all on public.%I from public, anon, authenticated', relation_name);
    execute format('grant select on public.%I to authenticated', relation_name);
    execute format('create policy execution_read on public.%I for select to authenticated using (
      organization_id = (select public.current_org())
      and facility_id = (select public.current_facility())
      and ((select public.has_permission(''planning.read''))
        or (select public.has_permission(''production.mobile'')))
    )', relation_name);
    execute format('create trigger audit_write after insert or update on public.%I
      for each row execute function public.audit_change()', relation_name);
  end loop;
end $$;

create function public.save_preparation_traceability_mode(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_facility_id uuid := (payload->>'facility_id')::uuid;
  requested_mode text := payload->>'preparation_traceability_mode';
  requested_revision integer := (payload->>'revision')::integer;
  facility public.facilities%rowtype;
begin
  if not public.has_permission('settings.manage') then
    raise exception 'Settings permission required';
  end if;
  if requested_facility_id is distinct from public.current_facility()
    or requested_mode not in ('production_day_product', 'batch_specific_allocation') then
    raise exception 'Invalid preparation traceability configuration';
  end if;
  select * into facility from public.facilities
  where organization_id = public.current_org() and id = requested_facility_id
    and active for update;
  if facility.id is null then raise exception 'Plant unavailable'; end if;
  if facility.plant_operations_configuration_revision is distinct from requested_revision then
    raise exception 'Plant configuration changed; reload and try again';
  end if;
  update public.facilities
  set preparation_traceability_mode = requested_mode,
    plant_operations_configuration_revision = plant_operations_configuration_revision + 1
  where organization_id = facility.organization_id and id = facility.id;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type,
    before_data, after_data
  ) values (
    facility.organization_id, auth.uid(), 'facilities', facility.id,
    'PREPARATION_TRACEABILITY_MODE_CHANGED',
    jsonb_build_object(
      'preparation_traceability_mode', facility.preparation_traceability_mode,
      'revision', facility.plant_operations_configuration_revision
    ),
    jsonb_build_object(
      'preparation_traceability_mode', requested_mode,
      'revision', facility.plant_operations_configuration_revision + 1
    )
  );
  return facility.id;
end $$;

create function public.record_production_batch_preparation_allocation(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  request_id uuid := (payload->>'id')::uuid;
  batch_id uuid := (payload->>'production_batch_id')::uuid;
  preparation_id uuid := (payload->>'preparation_execution_id')::uuid;
  requested_quantity numeric := (payload->>'quantity')::numeric;
  requested_uom text := trim(coalesce(payload->>'uom', ''));
  prior public.production_batch_preparation_allocations%rowtype;
begin
  if not public.has_permission('production.mobile') then
    raise exception 'Production execution permission required';
  end if;
  if request_id is null or batch_id is null or preparation_id is null
    or requested_quantity is null or requested_quantity <= 0
    or requested_quantity <> round(requested_quantity, 4)
    or length(requested_uom) not between 1 and 50 then
    raise exception 'Enter a valid preparation allocation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(request_id::text, 5));
  select * into prior from public.production_batch_preparation_allocations
  where organization_id = public.current_org()
    and facility_id = public.current_facility() and idempotency_key = request_id;
  if prior.id is not null then
    if prior.production_batch_id = batch_id
      and prior.preparation_execution_id = preparation_id
      and prior.quantity = requested_quantity and prior.uom = requested_uom
      and prior.created_by = auth.uid() then
      return prior.id;
    end if;
    raise exception 'Allocation request is already in use with different values';
  end if;
  insert into public.production_batch_preparation_allocations(
    organization_id, facility_id, production_batch_id,
    preparation_execution_id, quantity, uom, idempotency_key
  ) values (
    public.current_org(), public.current_facility(), batch_id,
    preparation_id, requested_quantity, requested_uom, request_id
  ) returning id into request_id;
  return request_id;
end $$;

create function public.production_batch_execution(batch_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(batch) || jsonb_build_object(
    'preparation_traceability_mode', batch.preparation_traceability_mode_snapshot,
    'preparation_allocations', coalesce((
      select jsonb_agg(to_jsonb(allocation) order by allocation.created_at, allocation.id)
      from public.production_batch_preparation_allocations allocation
      where allocation.organization_id = batch.organization_id
        and allocation.facility_id = batch.facility_id
        and allocation.production_batch_id = batch.id
    ), '[]'::jsonb),
    'preparation_scope', coalesce((
      select jsonb_agg(jsonb_build_object(
        'trace_scope', case
          when batch.preparation_traceability_mode_snapshot = 'production_day_product'
            then 'candidate'
          else 'affected'
        end,
        'preparation_execution', to_jsonb(preparation)
      ) order by preparation.created_at, preparation.id)
      from public.preparation_executions preparation
      where preparation.organization_id = batch.organization_id
        and preparation.facility_id = batch.facility_id
        and batch.state not in ('not_started', 'cancelled')
        and batch.started_at is not null
        and preparation.state not in ('not_started', 'cancelled')
        and (
          (batch.preparation_traceability_mode_snapshot = 'batch_specific_allocation'
            and exists (
              select 1 from public.production_batch_preparation_allocations allocation
              where allocation.organization_id = batch.organization_id
                and allocation.facility_id = batch.facility_id
                and allocation.production_batch_id = batch.id
                and allocation.preparation_execution_id = preparation.id
            ))
          or (batch.preparation_traceability_mode_snapshot = 'production_day_product'
            and preparation.product_id = batch.product_id
            and preparation.local_production_date = batch.local_production_date)
        )
    ), '[]'::jsonb),
    'finished_recall_lot', case when recall.id is null then null else to_jsonb(recall) end
  )
  from public.production_batches batch
  left join public.finished_recall_lots recall
    on recall.organization_id = batch.organization_id
    and recall.facility_id = batch.facility_id
    and recall.id = batch.finished_recall_lot_id
  where batch.id = production_batch_execution.batch_id
$$;

create function public.preparation_execution_trace(preparation_execution_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'preparation_execution', to_jsonb(preparation),
    'traceability_mode', preparation.traceability_mode_snapshot,
    'production_batches', coalesce((
      select jsonb_agg(to_jsonb(batch) || jsonb_build_object(
        'trace_scope', case
          when preparation.traceability_mode_snapshot = 'production_day_product'
            then 'candidate'
          else 'affected'
        end
      ) order by batch.run_sequence, batch.id)
      from public.production_batches batch
      where batch.organization_id = preparation.organization_id
        and batch.facility_id = preparation.facility_id
        and (
          (preparation.traceability_mode_snapshot = 'batch_specific_allocation'
            and exists (
              select 1 from public.production_batch_preparation_allocations allocation
              where allocation.organization_id = batch.organization_id
                and allocation.facility_id = batch.facility_id
                and allocation.production_batch_id = batch.id
                and allocation.preparation_execution_id = preparation.id
            ))
          or (preparation.traceability_mode_snapshot = 'production_day_product'
            and batch.product_id = preparation.product_id
            and batch.local_production_date = preparation.local_production_date
            and batch.state not in ('not_started', 'cancelled')
            and batch.started_at is not null)
        )
    ), '[]'::jsonb)
  )
  from public.preparation_executions preparation
  where preparation.id = preparation_execution_trace.preparation_execution_id
$$;

revoke all on function public.guard_finished_recall_lot_identity(),
  public.guard_production_batch_identity(), public.guard_preparation_execution_identity(),
  public.guard_production_batch_preparation_allocation()
  from public, anon, authenticated;
revoke all on function public.production_batch_execution(uuid) from public, anon, authenticated;
revoke all on function public.preparation_execution_trace(uuid) from public, anon, authenticated;
revoke all on function public.save_preparation_traceability_mode(jsonb),
  public.record_production_batch_preparation_allocation(jsonb)
  from public, anon, authenticated;
grant execute on function public.production_batch_execution(uuid),
  public.preparation_execution_trace(uuid),
  public.save_preparation_traceability_mode(jsonb),
  public.record_production_batch_preparation_allocation(jsonb) to authenticated;

commit;
