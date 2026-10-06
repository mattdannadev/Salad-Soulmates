begin;

-- A work package is planning/context only.  It deliberately has no worker
-- claim, completion, or dependency lifecycle: those belong to executable work
-- orders below it.  A source can therefore have any number of receiving jobs.
create table public.work_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  package_type text not null check (package_type in ('customer_order', 'inbound', 'production', 'maintenance', 'other')),
  source_type text,
  source_id uuid,
  title text not null default '' check (length(trim(title)) <= 160),
  status text not null default 'open' check (status in ('open', 'cancelled', 'closed')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  check ((source_type is null) = (source_id is null)),
  foreign key (organization_id, facility_id) references public.facilities(organization_id, id)
);
create index work_packages_source on public.work_packages(organization_id, facility_id, source_type, source_id);
alter table public.work_packages enable row level security;
revoke all on public.work_packages from public, anon, authenticated;

-- Work orders are always executable leaves.  Their optional package provides
-- containment only; dependencies remain in work_order_dependencies.
alter table public.workforce_work_queue_items
  add column work_package_id uuid,
  add constraint workforce_work_queue_items_work_package_scope_fk
    foreign key (organization_id, facility_id, work_package_id)
    references public.work_packages(organization_id, facility_id, id) on delete restrict;
create index workforce_work_queue_items_package
  on public.workforce_work_queue_items(organization_id, facility_id, work_package_id)
  where work_package_id is not null;

alter table public.workforce_work_queue_items
  drop constraint if exists workforce_work_queue_items_kind_check,
  add constraint workforce_work_queue_items_kind_check check (kind in (
    'pre_op', 'post_op', 'ingredient_prep', 'mixing', 'shipment_loading',
    'receiving', 'packaging', 'maintenance', 'cleaning', 'other'
  )),
  drop constraint if exists workforce_work_queue_items_linked_task_type_check,
  add constraint workforce_work_queue_items_linked_task_type_check check (
    linked_task_type is null or linked_task_type in (
      'purchase_draft', 'purchase_order', 'purchase_receipt', 'order',
      'production_plan', 'planned_spice_preparation', 'planned_mixer_batch',
      'production_lot', 'packaging_run', 'shipment_fulfillment',
      'plant_operations', 'equipment'
    )
  );

-- Shared operational behavior.  Specialized records (receipt lines, batch
-- worksheets, maintenance parts) remain their own auditable transactions.
create table public.work_order_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_order_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 240),
  required boolean not null default false,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  sequence integer not null default 1 check (sequence > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  foreign key (organization_id, facility_id, work_order_id)
    references public.workforce_work_queue_items(organization_id, facility_id, id) on delete cascade,
  check ((completed_by is null) = (completed_at is null))
);
create index work_order_tasks_work_order on public.work_order_tasks(organization_id, facility_id, work_order_id, sequence);
alter table public.work_order_tasks enable row level security;
revoke all on public.work_order_tasks from public, anon, authenticated;

create table public.work_order_time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_order_id uuid not null,
  worker_id uuid not null references auth.users(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  note text not null default '' check (length(note) <= 1000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  foreign key (organization_id, facility_id, work_order_id)
    references public.workforce_work_queue_items(organization_id, facility_id, id) on delete cascade,
  check (ended_at is null or ended_at > started_at)
);
create unique index work_order_time_entries_one_open_entry
  on public.work_order_time_entries(organization_id, facility_id, worker_id)
  where ended_at is null;
alter table public.work_order_time_entries enable row level security;
revoke all on public.work_order_time_entries from public, anon, authenticated;

-- Versioned operation definitions compose a worker experience from explicitly
-- supported capabilities; they never turn physical evidence into opaque JSON.
create table public.operation_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,79}$'),
  title text not null check (length(trim(title)) between 1 and 120),
  active boolean not null default true,
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, key),
  foreign key (organization_id, facility_id) references public.facilities(organization_id, id)
);
create table public.operation_definition_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  operation_definition_id uuid not null,
  version integer not null check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (operation_definition_id, version),
  foreign key (organization_id, facility_id, operation_definition_id)
    references public.operation_definitions(organization_id, facility_id, id) on delete restrict
);
create table public.operation_definition_capabilities (
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  operation_definition_version_id uuid not null,
  capability text not null check (capability in (
    'material_receipt', 'material_consumption', 'parts_consumption',
    'lot_capture', 'measurement', 'quality_check', 'equipment_confirmation',
    'output_yield', 'label_print', 'document_review'
  )),
  primary key (operation_definition_version_id, capability),
  foreign key (organization_id, facility_id, operation_definition_version_id)
    references public.operation_definition_versions(organization_id, facility_id, id) on delete cascade
);
alter table public.operation_definitions enable row level security;
alter table public.operation_definition_versions enable row level security;
alter table public.operation_definition_capabilities enable row level security;
revoke all on public.operation_definitions, public.operation_definition_versions,
  public.operation_definition_capabilities from public, anon, authenticated;

alter table public.workforce_work_queue_items
  add column operation_definition_version_id uuid,
  add constraint workforce_work_queue_items_operation_definition_scope_fk foreign key (
    organization_id, facility_id, operation_definition_version_id
  ) references public.operation_definition_versions(organization_id, facility_id, id) on delete restrict;
create index workforce_work_queue_items_operation_definition
  on public.workforce_work_queue_items(organization_id, facility_id, operation_definition_version_id)
  where operation_definition_version_id is not null;

-- A planned prep/mixing unit has exactly one leaf work order.  Multiple
-- receiving work orders intentionally have no analogous source uniqueness.
alter table public.planned_mixer_batches
  add column work_order_id uuid,
  add column work_order_kind text generated always as ('mixing'::text) stored,
  add constraint planned_mixer_batches_work_order_unique unique (organization_id, facility_id, work_order_id),
  add constraint planned_mixer_batches_work_order_fk foreign key (
    organization_id, facility_id, work_order_id, work_order_kind
  ) references public.workforce_work_queue_items(organization_id, facility_id, id, kind) on delete restrict;
alter table public.planned_spice_preparations
  add column work_order_id uuid,
  add column work_order_kind text generated always as ('ingredient_prep'::text) stored,
  add constraint planned_spice_preparations_work_order_unique unique (organization_id, facility_id, work_order_id),
  add constraint planned_spice_preparations_work_order_fk foreign key (
    organization_id, facility_id, work_order_id, work_order_kind
  ) references public.workforce_work_queue_items(organization_id, facility_id, id, kind) on delete restrict;

create function public.guard_planned_unit_work_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare work_order public.workforce_work_queue_items%rowtype;
declare expected_type text := case tg_table_name
  when 'planned_mixer_batches' then 'planned_mixer_batch'
  when 'planned_spice_preparations' then 'planned_spice_preparation'
end;
begin
  if new.work_order_id is null then return new; end if;
  select * into work_order from public.workforce_work_queue_items item
  where item.organization_id = new.organization_id and item.facility_id = new.facility_id
    and item.id = new.work_order_id for key share;
  if work_order.id is null or work_order.linked_task_type <> expected_type
    or work_order.linked_task_id is distinct from new.id then
    raise exception 'Work order must be linked to this exact planned unit';
  end if;
  return new;
end $$;
create trigger planned_mixer_batch_work_order_guard before insert or update on public.planned_mixer_batches
  for each row execute function public.guard_planned_unit_work_order();
create trigger planned_spice_preparation_work_order_guard before insert or update on public.planned_spice_preparations
  for each row execute function public.guard_planned_unit_work_order();

revoke all on function public.guard_planned_unit_work_order() from public, anon, authenticated;
notify pgrst, 'reload schema';

comment on table public.work_packages is 'Non-executable containment for multiple related work orders; source links are intentionally non-unique.';
comment on table public.work_order_tasks is 'Shared checklist tasks for all executable work-order kinds.';
comment on table public.work_order_time_entries is 'Shared worker time records for all executable work-order kinds.';
comment on table public.operation_definition_capabilities is 'Versioned operation behavior, including specialized receipt, consumption, and maintenance-parts capabilities.';

commit;

-- Preserve the established creation RPC while admitting the common package
-- context and maintenance leaf work orders.
create or replace function public.create_workforce_work_queue_item(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_item_id uuid := (payload->>'id')::uuid;
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_work_on date := (payload->>'work_on')::date;
  kind_value text := payload->>'kind';
  title_value text := trim(coalesce(payload->>'title', ''));
  instructions_value text := coalesce(payload->>'instructions', '');
  batch_quota_value integer := nullif(payload->>'batch_quota', '')::integer;
  estimated_minutes_value numeric := nullif(payload->>'estimated_minutes', '')::numeric;
  linked_type_value text := nullif(payload->>'linked_task_type', '');
  linked_id_value uuid := nullif(payload->>'linked_task_id', '')::uuid;
  package_id_value uuid := nullif(payload->>'work_package_id', '')::uuid;
  required_worker_count_value integer := coalesce((payload->>'required_worker_count')::integer, 1);
  snapshot jsonb;
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  if requested_item_id is null or requested_facility is distinct from public.current_facility()
    or requested_work_on is null or requested_work_on > current_date + 366 or requested_work_on < current_date - 31
    or kind_value not in ('pre_op','post_op','ingredient_prep','mixing','shipment_loading','receiving','packaging','maintenance','cleaning','other')
    or length(title_value) > 120 or length(instructions_value) > 2000
    or (linked_type_value is null) <> (linked_id_value is null)
    or required_worker_count_value not between 1 and 100
    or (kind_value in ('ingredient_prep','mixing') and (batch_quota_value not between 1 and 100000 or estimated_minutes_value is null or estimated_minutes_value <= 0 or estimated_minutes_value > 100000))
    or (kind_value not in ('ingredient_prep','mixing') and (batch_quota_value is not null or estimated_minutes_value is not null)) then
    raise exception 'Invalid work order';
  end if;
  if (kind_value = 'receiving' and coalesce(linked_type_value not in ('purchase_draft','purchase_order','purchase_receipt'), true))
    or (kind_value = 'ingredient_prep' and coalesce(linked_type_value not in ('planned_spice_preparation','production_plan'), true))
    or (kind_value = 'mixing' and coalesce(linked_type_value not in ('planned_mixer_batch','production_plan'), true))
    or (kind_value = 'packaging' and coalesce(linked_type_value not in ('production_lot','packaging_run'), true))
    or (kind_value = 'shipment_loading' and coalesce(linked_type_value not in ('order','shipment_fulfillment'), true))
    or (kind_value in ('pre_op','post_op') and coalesce(linked_type_value not in ('production_plan','production_lot','plant_operations'), true))
    or (kind_value = 'maintenance' and linked_type_value is not null and linked_type_value <> 'equipment') then
    raise exception 'Work order has an incompatible operational context';
  end if;
  if package_id_value is not null and not exists (select 1 from public.work_packages package where package.organization_id = public.current_org() and package.facility_id = requested_facility and package.id = package_id_value and package.status = 'open') then
    raise exception 'Work package unavailable';
  end if;
  insert into public.workforce_work_queue_items(
    id, organization_id, facility_id, work_on, kind, title, instructions, batch_quota,
    estimated_minutes, required_worker_count, linked_task_type, linked_task_id,
    work_package_id, created_by, updated_by
  ) values (
    requested_item_id, public.current_org(), requested_facility, requested_work_on,
    kind_value, title_value, instructions_value, batch_quota_value, estimated_minutes_value,
    required_worker_count_value, linked_type_value, linked_id_value, package_id_value, auth.uid(), auth.uid()
  );
  select to_jsonb(item) into snapshot from public.workforce_work_queue_items item where item.id = requested_item_id;
  insert into public.workforce_work_queue_history(organization_id, facility_id, queue_item_id, action, actor_user_id, after_data)
    values (public.current_org(), requested_facility, requested_item_id, 'created', auth.uid(), snapshot);
  return requested_item_id;
end $$;
revoke all on function public.create_workforce_work_queue_item(jsonb) from public, anon;
grant execute on function public.create_workforce_work_queue_item(jsonb) to authenticated;

create function public.create_work_package(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  package_id uuid := (payload->>'id')::uuid;
  requested_facility uuid := (payload->>'facility_id')::uuid;
  type_value text := payload->>'package_type';
  source_type_value text := nullif(payload->>'source_type', '');
  source_id_value uuid := nullif(payload->>'source_id', '')::uuid;
  title_value text := trim(coalesce(payload->>'title', ''));
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  if package_id is null or requested_facility is distinct from public.current_facility()
    or type_value not in ('customer_order','inbound','production','maintenance','other')
    or length(title_value) > 160
    or (source_type_value is null) <> (source_id_value is null) then
    raise exception 'Invalid work package';
  end if;
  insert into public.work_packages(id, organization_id, facility_id, package_type, source_type, source_id, title, created_by, updated_by)
    values (package_id, public.current_org(), requested_facility, type_value, source_type_value, source_id_value, title_value, auth.uid(), auth.uid());
  return package_id;
end $$;
revoke all on function public.create_work_package(jsonb) from public, anon;
grant execute on function public.create_work_package(jsonb) to authenticated;
notify pgrst, 'reload schema';
