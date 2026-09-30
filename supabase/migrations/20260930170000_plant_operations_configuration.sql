-- Plant-operating defaults are tenant/facility configuration, never global rules.
-- This migration intentionally creates the worker-claim queue beside the existing
-- supervisor scheduling tables so published schedules remain backward compatible.
begin;

-- Product-level planning estimates are intentionally nullable: a plant must configure
-- them rather than inheriting invented durations or crew requirements.
alter table public.products
  add column ingredient_prep_minutes_per_batch numeric(6,2)
    check (ingredient_prep_minutes_per_batch > 0 and ingredient_prep_minutes_per_batch <= 1440),
  add column ingredient_prep_crew_size integer
    check (ingredient_prep_crew_size between 1 and 100),
  add column mixing_minutes_per_batch numeric(6,2)
    check (mixing_minutes_per_batch > 0 and mixing_minutes_per_batch <= 1440),
  add column mixing_crew_size integer
    check (mixing_crew_size between 1 and 100),
  add constraint product_ingredient_prep_labor_estimate_complete check (
    (ingredient_prep_minutes_per_batch is null) = (ingredient_prep_crew_size is null)
  ),
  add constraint product_mixing_labor_estimate_complete check (
    (mixing_minutes_per_batch is null) = (mixing_crew_size is null)
  );

create function public.save_product_labor_estimate(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  product_id_value uuid := (payload->>'product_id')::uuid;
  prep_minutes_value numeric := nullif(payload->>'ingredient_prep_minutes_per_batch', '')::numeric;
  prep_crew_value integer := nullif(payload->>'ingredient_prep_crew_size', '')::integer;
  mixing_minutes_value numeric := nullif(payload->>'mixing_minutes_per_batch', '')::numeric;
  mixing_crew_value integer := nullif(payload->>'mixing_crew_size', '')::integer;
begin
  if not public.has_permission('products.write') then raise exception 'Product write permission required'; end if;
  if product_id_value is null or (prep_minutes_value is null) <> (prep_crew_value is null)
    or (mixing_minutes_value is null) <> (mixing_crew_value is null)
    or (prep_minutes_value is not null and (prep_minutes_value <= 0 or prep_minutes_value > 1440 or prep_crew_value not between 1 and 100))
    or (mixing_minutes_value is not null and (mixing_minutes_value <= 0 or mixing_minutes_value > 1440 or mixing_crew_value not between 1 and 100)) then
    raise exception 'Invalid product labor estimate';
  end if;
  update public.products set ingredient_prep_minutes_per_batch = prep_minutes_value,
    ingredient_prep_crew_size = prep_crew_value, mixing_minutes_per_batch = mixing_minutes_value,
    mixing_crew_size = mixing_crew_value, updated_at = now()
    where id = product_id_value and organization_id = public.current_org();
  if not found then raise exception 'Product unavailable'; end if;
  return product_id_value;
end $$;

alter table public.workforce_schedule_events
  drop constraint workforce_schedule_events_kind_check,
  add constraint workforce_schedule_events_kind_check check (kind in (
    'pre_op', 'post_op', 'ingredient_prep', 'mixing', 'receiving',
    'shipment_loading', 'packaging', 'cleaning', 'off', 'other'
  ));

alter table public.facilities
  add column work_assignment_policy text not null default 'supervisor_assigned'
    check (work_assignment_policy in ('supervisor_assigned', 'worker_claimed', 'hybrid')),
  add column schedule_planning_cadence text not null default 'weekly'
    check (schedule_planning_cadence in ('daily', 'weekly', 'biweekly', 'custom')),
  add column schedule_preparation_weekday smallint not null default 5
    check (schedule_preparation_weekday between 0 and 6),
  add column ingredient_prep_lead_days integer not null default 1
    check (ingredient_prep_lead_days between 0 and 30),
  add column productive_mixing_hours_per_day numeric(5,2) not null default 6
    check (productive_mixing_hours_per_day > 0 and productive_mixing_hours_per_day <= 24),
  add column make_ahead_policy text not null default 'approval_required'
    check (make_ahead_policy in ('disabled', 'approval_required', 'allowed')),
  add column make_ahead_max_days integer not null default 7
    check (make_ahead_max_days between 0 and 365),
  add column packaging_lead_days integer not null default 1
    check (packaging_lead_days between 0 and 30),
  add column cases_per_pallet integer not null default 45
    check (cases_per_pallet > 0),
  add column cycle_count_cadence_days integer not null default 7
    check (cycle_count_cadence_days between 1 and 365),
  add column cycle_count_scope text not null default 'raw_ingredients'
    check (cycle_count_scope in ('raw_ingredients', 'all_inventory', 'configured_locations')),
  add column plant_operations_configuration_revision integer not null default 1
    check (plant_operations_configuration_revision > 0);

create table public.plant_daily_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_on date not null,
  productive_mixing_hours numeric(5,2) not null
    check (productive_mixing_hours > 0 and productive_mixing_hours <= 24),
  reason text not null check (length(trim(reason)) between 3 and 500),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  unique (organization_id, facility_id, work_on),
  foreign key (organization_id, facility_id) references public.facilities(organization_id, id)
);
create index plant_daily_capacity_overrides_calendar
  on public.plant_daily_capacity_overrides(facility_id, work_on);
alter table public.plant_daily_capacity_overrides enable row level security;
revoke all on public.plant_daily_capacity_overrides from public, anon, authenticated;
grant select on public.plant_daily_capacity_overrides to authenticated;
create policy plant_daily_capacity_overrides_read on public.plant_daily_capacity_overrides
  for select to authenticated using (
    organization_id = public.current_org() and facility_id = public.current_facility()
  );

create function public.save_plant_daily_capacity_override(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_id uuid := (payload->>'id')::uuid;
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_date date := (payload->>'work_on')::date;
  requested_hours numeric := (payload->>'productive_mixing_hours')::numeric;
  requested_reason text := trim(coalesce(payload->>'reason', ''));
  requested_revision integer := coalesce((payload->>'revision')::integer, 0);
  prior public.plant_daily_capacity_overrides%rowtype;
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  if requested_id is null or requested_facility is distinct from public.current_facility()
    or requested_date is null or requested_hours <= 0 or requested_hours > 24
    or length(requested_reason) not between 3 and 500 then raise exception 'Invalid daily capacity override'; end if;
  select * into prior from public.plant_daily_capacity_overrides where organization_id=public.current_org()
    and facility_id=requested_facility and work_on=requested_date for update;
  if prior.id is null then
    if requested_revision <> 0 then raise exception 'Capacity override changed; reload and try again'; end if;
    insert into public.plant_daily_capacity_overrides(id,organization_id,facility_id,work_on,
      productive_mixing_hours,reason,created_by,updated_by)
    values(requested_id,public.current_org(),requested_facility,requested_date,requested_hours,
      requested_reason,auth.uid(),auth.uid());
  else
    if prior.revision <> requested_revision then raise exception 'Capacity override changed; reload and try again'; end if;
    update public.plant_daily_capacity_overrides set productive_mixing_hours=requested_hours,
      reason=requested_reason,revision=revision+1,updated_by=auth.uid(),updated_at=now()
      where id=prior.id;
    requested_id := prior.id;
  end if;
  return requested_id;
end $$;

create function public.save_plant_operations_configuration(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  assignment_policy_value text := payload->>'work_assignment_policy';
  cadence_value text := payload->>'schedule_planning_cadence';
  preparation_weekday_value smallint := (payload->>'schedule_preparation_weekday')::smallint;
  prep_lead_days_value integer := (payload->>'ingredient_prep_lead_days')::integer;
  mixing_hours_value numeric := (payload->>'productive_mixing_hours_per_day')::numeric;
  make_ahead_policy_value text := payload->>'make_ahead_policy';
  make_ahead_days_value integer := (payload->>'make_ahead_max_days')::integer;
  packaging_lead_days_value integer := (payload->>'packaging_lead_days')::integer;
  cases_per_pallet_value integer := (payload->>'cases_per_pallet')::integer;
  count_cadence_value integer := (payload->>'cycle_count_cadence_days')::integer;
  count_scope_value text := payload->>'cycle_count_scope';
  prior public.facilities%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  if not public.has_permission('settings.manage') then raise exception 'Settings permission required'; end if;
  if requested_facility is distinct from public.current_facility() then raise exception 'Invalid plant scope'; end if;
  select * into prior from public.facilities f where f.organization_id = public.current_org()
    and f.id = requested_facility and f.active for update;
  if prior.id is null then raise exception 'Plant unavailable'; end if;
  if prior.plant_operations_configuration_revision is distinct from requested_revision then
    raise exception 'Plant configuration changed; reload and try again';
  end if;
  if assignment_policy_value not in ('supervisor_assigned', 'worker_claimed', 'hybrid')
    or cadence_value not in ('daily', 'weekly', 'biweekly', 'custom')
    or preparation_weekday_value not between 0 and 6
    or prep_lead_days_value not between 0 and 30
    or mixing_hours_value is null or mixing_hours_value <= 0 or mixing_hours_value > 24
    or make_ahead_policy_value not in ('disabled', 'approval_required', 'allowed')
    or make_ahead_days_value not between 0 and 365
    or packaging_lead_days_value not between 0 and 30
    or cases_per_pallet_value is null or cases_per_pallet_value <= 0
    or count_cadence_value not between 1 and 365
    or count_scope_value not in ('raw_ingredients', 'all_inventory', 'configured_locations') then
    raise exception 'Invalid plant operations configuration';
  end if;
  before_snapshot := jsonb_build_object(
    'work_assignment_policy', prior.work_assignment_policy,
    'schedule_planning_cadence', prior.schedule_planning_cadence,
    'schedule_preparation_weekday', prior.schedule_preparation_weekday,
    'ingredient_prep_lead_days', prior.ingredient_prep_lead_days,
    'productive_mixing_hours_per_day', prior.productive_mixing_hours_per_day,
    'make_ahead_policy', prior.make_ahead_policy,
    'make_ahead_max_days', prior.make_ahead_max_days,
    'packaging_lead_days', prior.packaging_lead_days,
    'cases_per_pallet', prior.cases_per_pallet,
    'cycle_count_cadence_days', prior.cycle_count_cadence_days,
    'cycle_count_scope', prior.cycle_count_scope,
    'revision', prior.plant_operations_configuration_revision
  );
  update public.facilities set
    work_assignment_policy = assignment_policy_value,
    schedule_planning_cadence = cadence_value,
    schedule_preparation_weekday = preparation_weekday_value,
    ingredient_prep_lead_days = prep_lead_days_value,
    productive_mixing_hours_per_day = mixing_hours_value,
    make_ahead_policy = make_ahead_policy_value,
    make_ahead_max_days = make_ahead_days_value,
    packaging_lead_days = packaging_lead_days_value,
    cases_per_pallet = cases_per_pallet_value,
    cycle_count_cadence_days = count_cadence_value,
    cycle_count_scope = count_scope_value,
    plant_operations_configuration_revision = plant_operations_configuration_revision + 1
    where id = prior.id and organization_id = prior.organization_id;
  select jsonb_build_object(
    'work_assignment_policy', f.work_assignment_policy,
    'schedule_planning_cadence', f.schedule_planning_cadence,
    'schedule_preparation_weekday', f.schedule_preparation_weekday,
    'ingredient_prep_lead_days', f.ingredient_prep_lead_days,
    'productive_mixing_hours_per_day', f.productive_mixing_hours_per_day,
    'make_ahead_policy', f.make_ahead_policy,
    'make_ahead_max_days', f.make_ahead_max_days,
    'packaging_lead_days', f.packaging_lead_days,
    'cases_per_pallet', f.cases_per_pallet,
    'cycle_count_cadence_days', f.cycle_count_cadence_days,
    'cycle_count_scope', f.cycle_count_scope,
    'revision', f.plant_operations_configuration_revision
  ) into after_snapshot from public.facilities f where f.id = prior.id;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, before_data, after_data
  ) values (
    public.current_org(), auth.uid(), 'facilities', prior.id,
    'PLANT_OPERATIONS_CONFIGURATION_CHANGED', before_snapshot, after_snapshot
  );
  return prior.id;
end $$;

create table public.workforce_work_queue_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_on date not null,
  kind text not null check (kind in ('pre_op', 'post_op', 'ingredient_prep', 'mixing', 'shipment_loading', 'receiving', 'packaging', 'cleaning', 'other')),
  title text not null default '' check (length(trim(title)) <= 120),
  instructions text not null default '' check (length(instructions) <= 2000),
  batch_quota integer check (batch_quota between 1 and 100000),
  estimated_minutes numeric(8,2) check (estimated_minutes > 0 and estimated_minutes <= 100000),
  linked_task_type text,
  linked_task_id uuid,
  required_worker_count integer not null default 1 check (required_worker_count between 1 and 100),
  status text not null default 'available'
    check (status in ('available', 'claimed', 'cancelled', 'completed')),
  publication_state text not null default 'draft'
    check (publication_state in ('draft', 'published', 'cancelled')),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  check ((linked_task_type is null) = (linked_task_id is null)),
  check (
    (kind in ('ingredient_prep', 'mixing') and batch_quota is not null and estimated_minutes is not null)
    or (kind not in ('ingredient_prep', 'mixing') and batch_quota is null and estimated_minutes is null)
  ),
  check (linked_task_type is null or linked_task_type in (
    'purchase_draft', 'purchase_order', 'purchase_receipt', 'order', 'production_plan',
    'planned_spice_preparation', 'planned_mixer_batch', 'production_lot',
    'packaging_run', 'shipment_fulfillment', 'plant_operations'
  )),
  check ((completed_by is null) = (completed_at is null)),
  check ((published_by is null) = (published_at is null)),
  check (status <> 'completed' or completed_by is not null),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id)
);
create index workforce_work_queue_items_available
  on public.workforce_work_queue_items(facility_id, work_on, status);

create table public.workforce_work_queue_claims (
  organization_id uuid not null,
  facility_id uuid not null,
  queue_item_id uuid not null references public.workforce_work_queue_items(id) on delete cascade,
  worker_id uuid not null references auth.users(id),
  claim_source text not null check (claim_source in ('worker_claimed', 'supervisor_assigned')),
  claimed_at timestamptz not null default now(),
  primary key (queue_item_id, worker_id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id)
);
create index workforce_work_queue_claims_worker
  on public.workforce_work_queue_claims(facility_id, worker_id, queue_item_id);

create table public.workforce_work_queue_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  queue_item_id uuid not null references public.workforce_work_queue_items(id) on delete cascade,
  action text not null check (action in ('created', 'published', 'claimed', 'cancelled', 'completed')),
  actor_user_id uuid not null references auth.users(id),
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id)
);

alter table public.workforce_work_queue_items enable row level security;
alter table public.workforce_work_queue_claims enable row level security;
alter table public.workforce_work_queue_history enable row level security;
revoke all on public.workforce_work_queue_items, public.workforce_work_queue_claims,
  public.workforce_work_queue_history
  from public, anon, authenticated;

create function public.create_workforce_work_queue_item(payload jsonb) returns uuid
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
  required_worker_count_value integer := coalesce((payload->>'required_worker_count')::integer, 1);
  snapshot jsonb;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  if requested_facility is distinct from public.current_facility() then
    raise exception 'Invalid plant scope';
  end if;
  if requested_item_id is null or requested_work_on is null
    or requested_work_on > current_date + 366 or requested_work_on < current_date - 31 then
    raise exception 'Invalid work queue item';
  end if;
  if kind_value not in ('pre_op', 'post_op', 'ingredient_prep', 'mixing', 'shipment_loading', 'receiving', 'packaging', 'cleaning', 'other')
    or length(title_value) > 120 or length(instructions_value) > 2000
    or (linked_type_value is null) <> (linked_id_value is null)
    or required_worker_count_value not between 1 and 100
    or (kind_value in ('ingredient_prep', 'mixing') and (batch_quota_value not between 1 and 100000
      or estimated_minutes_value is null or estimated_minutes_value <= 0 or estimated_minutes_value > 100000))
    or (kind_value not in ('ingredient_prep', 'mixing') and (batch_quota_value is not null or estimated_minutes_value is not null)) then
    raise exception 'Invalid work queue item';
  end if;
  if (kind_value = 'receiving' and coalesce(linked_type_value not in ('purchase_draft', 'purchase_order', 'purchase_receipt'), true))
    or (kind_value = 'ingredient_prep' and coalesce(linked_type_value not in ('planned_spice_preparation', 'production_plan'), true))
    or (kind_value = 'mixing' and coalesce(linked_type_value not in ('planned_mixer_batch', 'production_plan'), true))
    or (kind_value = 'packaging' and coalesce(linked_type_value not in ('production_lot', 'packaging_run'), true))
    or (kind_value = 'shipment_loading' and coalesce(linked_type_value not in ('order', 'shipment_fulfillment'), true))
    or (kind_value in ('pre_op', 'post_op') and coalesce(linked_type_value not in ('production_plan', 'production_lot', 'plant_operations'), true)) then
    raise exception 'Work queue item has an incompatible operational context';
  end if;
  if not exists (select 1 from public.facilities f where f.organization_id = public.current_org()
    and f.id = requested_facility and f.active) then raise exception 'Plant unavailable'; end if;
  insert into public.workforce_work_queue_items(
    id, organization_id, facility_id, work_on, kind, title, instructions, batch_quota, estimated_minutes, required_worker_count,
    linked_task_type, linked_task_id, created_by, updated_by
  ) values (
    requested_item_id, public.current_org(), requested_facility, requested_work_on,
    kind_value, title_value, instructions_value, batch_quota_value, estimated_minutes_value, required_worker_count_value, linked_type_value, linked_id_value,
    auth.uid(), auth.uid()
  );
  select to_jsonb(q) into snapshot from public.workforce_work_queue_items q where q.id = requested_item_id;
  insert into public.workforce_work_queue_history(
    organization_id, facility_id, queue_item_id, action, actor_user_id, after_data
  ) values (
    public.current_org(), requested_facility, requested_item_id, 'created', auth.uid(), snapshot
  );
  return requested_item_id;
end $$;

create function public.publish_workforce_work_queue(payload jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_work_on date := (payload->>'work_on')::date;
  published_count integer;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  if requested_facility is distinct from public.current_facility() or requested_work_on is null then
    raise exception 'Invalid plant work queue scope';
  end if;
  with changed as (
    update public.workforce_work_queue_items q set
      publication_state = 'published', published_by = auth.uid(), published_at = now(),
      updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where q.organization_id = public.current_org() and q.facility_id = requested_facility
      and q.work_on = requested_work_on and q.publication_state = 'draft'
    returning q.id, q.organization_id, q.facility_id, to_jsonb(q) as after_data
  ), history as (
    insert into public.workforce_work_queue_history(
      organization_id, facility_id, queue_item_id, action, actor_user_id, after_data
    ) select organization_id, facility_id, id, 'published', auth.uid(), after_data from changed
  ) select count(*) into published_count from changed;
  return published_count;
end $$;

create function public.claim_workforce_work_queue_item(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_item_id uuid := (payload->>'id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  item public.workforce_work_queue_items%rowtype;
  policy_value text;
  actor public.profiles%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
  existing_claim_count integer;
begin
  select * into actor from public.profiles p
    where p.id = auth.uid() and p.organization_id = public.current_org()
      and p.facility_id = public.current_facility() and p.active;
  if actor.id is null then raise exception 'Active plant worker profile required'; end if;

  select f.work_assignment_policy into policy_value from public.facilities f
    where f.organization_id = public.current_org() and f.id = public.current_facility()
      and f.active;
  if policy_value not in ('worker_claimed', 'hybrid') then
    raise exception 'This plant requires supervisor assignment';
  end if;

  select * into item from public.workforce_work_queue_items q
    where q.id = requested_item_id and q.organization_id = public.current_org()
      and q.facility_id = public.current_facility() for update;
  if item.id is null then raise exception 'Work item unavailable'; end if;
  if item.revision is distinct from requested_revision then
    raise exception 'Work queue changed; reload and try again';
  end if;
  if item.publication_state <> 'published' or item.status not in ('available', 'claimed') then
    raise exception 'Work item is unavailable';
  end if;
  select count(*) into existing_claim_count from public.workforce_work_queue_claims c
    where c.queue_item_id = item.id;
  if existing_claim_count >= item.required_worker_count then
    raise exception 'Work item already has its required workers';
  end if;
  if exists (select 1 from public.workforce_work_queue_claims c
    where c.queue_item_id = item.id and c.worker_id = auth.uid()) then
    raise exception 'You have already claimed this work item';
  end if;

  before_snapshot := jsonb_build_object('item', to_jsonb(item), 'claims', coalesce((
    select jsonb_agg(jsonb_build_object('worker_id', c.worker_id, 'claim_source', c.claim_source,
      'claimed_at', c.claimed_at) order by c.claimed_at)
    from public.workforce_work_queue_claims c where c.queue_item_id = item.id
  ), '[]'::jsonb));
  insert into public.workforce_work_queue_claims(
    organization_id, facility_id, queue_item_id, worker_id, claim_source
  ) values (
    public.current_org(), public.current_facility(), item.id, auth.uid(), policy_value
  );
  update public.workforce_work_queue_items set
    status = 'claimed', updated_by = auth.uid(), updated_at = now(),
    revision = revision + 1
    where id = item.id;
  select jsonb_build_object('item', to_jsonb(q), 'claims', coalesce((
    select jsonb_agg(jsonb_build_object('worker_id', c.worker_id, 'claim_source', c.claim_source,
      'claimed_at', c.claimed_at) order by c.claimed_at)
    from public.workforce_work_queue_claims c where c.queue_item_id = item.id
  ), '[]'::jsonb)) into after_snapshot from public.workforce_work_queue_items q where q.id = item.id;
  insert into public.workforce_work_queue_history(
    organization_id, facility_id, queue_item_id, action, actor_user_id, before_data, after_data
  ) values (
    public.current_org(), public.current_facility(), item.id, 'claimed', auth.uid(), before_snapshot, after_snapshot
  );
  return item.id;
end $$;

create function public.get_my_workforce_work_queue(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  actor public.profiles%rowtype;
begin
  select * into actor from public.profiles p
    where p.id = auth.uid() and p.organization_id = public.current_org()
      and p.facility_id = public.current_facility() and p.active;
  if actor.id is null then raise exception 'Active plant worker profile required'; end if;
  if requested_start is null or requested_end is null or requested_end <= requested_start
    or requested_end > requested_start + 31 then raise exception 'Invalid work queue range'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', q.id, 'work_on', q.work_on, 'kind', q.kind, 'title', q.title,
    'instructions', q.instructions, 'batch_quota', q.batch_quota, 'estimated_minutes', q.estimated_minutes,
    'status', q.status, 'publication_state', q.publication_state, 'revision', q.revision,
    'required_worker_count', q.required_worker_count,
    'claimed_worker_count', (select count(*) from public.workforce_work_queue_claims c where c.queue_item_id = q.id),
    'claimed_by_me', exists(select 1 from public.workforce_work_queue_claims c where c.queue_item_id = q.id and c.worker_id = auth.uid()),
    'linked_task_type', q.linked_task_type, 'linked_task_id', q.linked_task_id
  ) order by q.work_on, q.created_at)
  from public.workforce_work_queue_items q
  where q.organization_id = actor.organization_id and q.facility_id = actor.facility_id
    and q.work_on >= requested_start and q.work_on < requested_end
    and q.publication_state = 'published'
    and (q.status = 'available' or exists(select 1 from public.workforce_work_queue_claims c
      where c.queue_item_id = q.id and c.worker_id = auth.uid()))), '[]'::jsonb);
end $$;

create function public.get_workforce_work_queue_overview(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_work_on date := (payload->>'work_on')::date;
begin
  if not public.has_permission('workforce.read') then raise exception 'Workforce read permission required'; end if;
  if requested_facility is distinct from public.current_facility() or requested_work_on is null then
    raise exception 'Invalid plant work queue scope';
  end if;
  return jsonb_build_object(
    'work_on', requested_work_on,
    'draft_count', (select count(*) from public.workforce_work_queue_items q
      where q.organization_id = public.current_org() and q.facility_id = requested_facility
        and q.work_on = requested_work_on and q.publication_state = 'draft'),
    'available_count', (select count(*) from public.workforce_work_queue_items q
      where q.organization_id = public.current_org() and q.facility_id = requested_facility
        and q.work_on = requested_work_on and q.publication_state = 'published' and q.status = 'available'),
    'claimed_count', (select count(*) from public.workforce_work_queue_items q
      where q.organization_id = public.current_org() and q.facility_id = requested_facility
        and q.work_on = requested_work_on and q.publication_state = 'published' and q.status = 'claimed'),
    'unfilled_worker_slots', (select coalesce(sum(q.required_worker_count - (
      select count(*) from public.workforce_work_queue_claims c where c.queue_item_id = q.id
    )), 0) from public.workforce_work_queue_items q
      where q.organization_id = public.current_org() and q.facility_id = requested_facility
        and q.work_on = requested_work_on and q.publication_state = 'published'
        and q.status in ('available', 'claimed')),
    'unfilled_by_kind', coalesce((select jsonb_object_agg(grouped.kind, grouped.total)
      from (select q.kind, sum(q.required_worker_count - (
        select count(*) from public.workforce_work_queue_claims c where c.queue_item_id = q.id
      )) as total from public.workforce_work_queue_items q
        where q.organization_id = public.current_org() and q.facility_id = requested_facility
          and q.work_on = requested_work_on and q.publication_state = 'published'
          and q.status in ('available', 'claimed')
        group by q.kind) grouped), '{}'::jsonb)
  );
end $$;

-- Return concise authorized anchors for operational queue items; the queue never
-- substitutes for the receiving, fulfillment, or production transactions.
create function public.get_workforce_work_context(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  result jsonb;
begin
  if requested_facility is null or requested_start is null or requested_end is null
    or requested_end <= requested_start then raise exception 'Invalid work context range'; end if;
  if not public.has_permission('workforce.read') then raise exception 'Workforce access required'; end if;
  if requested_facility is distinct from public.current_facility() then raise exception 'Plant unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('type', item.type, 'id', item.id,
    'production_plan_id', item.production_plan_id, 'label', item.label) order by item.label, item.id), '[]'::jsonb)
  into result from (
    select 'purchase_draft'::text type, d.id, d.material_plan_id production_plan_id,
      'Expected PO ' || coalesce(nullif(d.reference, ''), left(d.id::text, 8)) || ' · ' || d.expected_on label
    from public.purchase_drafts d where d.organization_id=public.current_org()
      and d.facility_id=requested_facility and d.material_plan_id is not null
      and d.status in ('Draft', 'Confirmed')
      and d.expected_on >= requested_start and d.expected_on < requested_end
    union all
    select 'order'::text type, o.id, o.id production_plan_id,
      'Pickup ' || coalesce(nullif(o.reference, ''), left(o.id::text, 8)) || ' · ' || o.needed_on label
    from public.customer_orders o where o.organization_id=public.current_org()
      and o.facility_id=requested_facility and o.needed_on >= requested_start and o.needed_on < requested_end
  ) item;
  return result;
end $$;

revoke all on function public.save_plant_operations_configuration(jsonb),
  public.save_plant_daily_capacity_override(jsonb),
  public.save_product_labor_estimate(jsonb),
  public.create_workforce_work_queue_item(jsonb),
  public.publish_workforce_work_queue(jsonb),
  public.claim_workforce_work_queue_item(jsonb),
  public.get_my_workforce_work_queue(jsonb), public.get_workforce_work_queue_overview(jsonb),
  public.get_workforce_work_context(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_plant_operations_configuration(jsonb),
  public.save_plant_daily_capacity_override(jsonb),
  public.save_product_labor_estimate(jsonb),
  public.create_workforce_work_queue_item(jsonb),
  public.publish_workforce_work_queue(jsonb),
  public.claim_workforce_work_queue_item(jsonb),
  public.get_my_workforce_work_queue(jsonb), public.get_workforce_work_queue_overview(jsonb),
  public.get_workforce_work_context(jsonb)
  to authenticated;

commit;
