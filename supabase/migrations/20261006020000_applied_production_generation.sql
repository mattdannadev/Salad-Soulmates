begin;

-- The existing order proposal remains the scheduling calculation.  This
-- migration records the immutable workflow version it used and attaches its
-- aggregate commitments to the canonical planner records in the same
-- transaction.  It intentionally does not create execution evidence.
create table public.applied_work_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_plan_version_id uuid not null,
  source_type text not null check (source_type in ('customer_order')),
  source_id uuid not null,
  generation_fingerprint text not null check (length(generation_fingerprint) between 1 and 128),
  selected_optional_step_keys jsonb not null default '[]'::jsonb
    check (jsonb_typeof(selected_optional_step_keys) = 'array'),
  definition_snapshot jsonb not null check (jsonb_typeof(definition_snapshot) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, facility_id, source_type, source_id),
  unique (organization_id, facility_id, id),
  foreign key (organization_id, facility_id, work_plan_version_id)
    references public.work_plan_versions(organization_id, facility_id, id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id)
);
alter table public.applied_work_plans enable row level security;
revoke all on public.applied_work_plans from public, anon, authenticated;

alter table public.work_packages
  add column applied_work_plan_id uuid,
  add column operation_kind text check (operation_kind is null or operation_kind in (
    'ingredient_prep', 'pre_op', 'mixing', 'post_op', 'packaging'
  )),
  add column planned_quantity numeric(12, 2) check (planned_quantity is null or planned_quantity > 0),
  add column planned_unit text check (planned_unit is null or length(trim(planned_unit)) between 1 and 30),
  add constraint work_packages_applied_plan_scope_fk foreign key (
    organization_id, facility_id, applied_work_plan_id
  ) references public.applied_work_plans(organization_id, facility_id, id) on delete restrict;
create unique index work_packages_applied_source_unique
  on public.work_packages(organization_id, facility_id, applied_work_plan_id, source_id)
  where applied_work_plan_id is not null;

create function private.capture_order_generation_as_applied_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  order_row public.customer_orders%rowtype;
  plan_version public.work_plan_versions%rowtype;
  applied_id uuid;
  released_count integer;
  definition jsonb;
  mixing_work public.workforce_work_queue_items%rowtype;
  pre_op_id uuid;
  post_op_id uuid;
begin
  select * into order_row from public.customer_orders
  where id = new.order_id and organization_id = public.current_org()
    and facility_id = public.current_facility() for key share;
  if order_row.id is null then raise exception 'Order unavailable'; end if;

  select count(*) into released_count from public.work_plan_versions version
  where version.organization_id = order_row.organization_id
    and version.facility_id = order_row.facility_id and version.state = 'released';
  if released_count <> 1 then
    raise exception 'Configure exactly one released Work Plan before generating production work';
  end if;
  select * into plan_version from public.work_plan_versions version
  where version.organization_id = order_row.organization_id
    and version.facility_id = order_row.facility_id and version.state = 'released'
  for key share;
  if exists (
    select 1 from public.work_plan_steps step
    where step.work_plan_version_id = plan_version.id
      and coalesce((step.task_template->>'optional')::boolean, false)
  ) then
    raise exception 'Choose optional Work Plan steps before generating production work';
  end if;

  select jsonb_build_object(
    'version_id', plan_version.id,
    'work_plan_id', plan_version.work_plan_id,
    'name', plan_version.name,
    'version_number', plan_version.version_number,
    'steps', coalesce((select jsonb_agg(jsonb_build_object(
      'key', step.step_key, 'title', step.title,
      'materialization_policy', step.materialization_policy,
      'task_template', step.task_template, 'sort_order', step.sort_order
    ) order by step.sort_order, step.id) from public.work_plan_steps step
      where step.work_plan_version_id = plan_version.id), '[]'::jsonb),
    'dependencies', coalesce((select jsonb_agg(jsonb_build_object(
      'predecessor_key', predecessor.step_key, 'successor_key', successor.step_key
    ) order by predecessor.step_key, successor.step_key)
      from public.work_plan_step_dependencies edge
      join public.work_plan_steps predecessor on predecessor.id = edge.predecessor_step_id
      join public.work_plan_steps successor on successor.id = edge.successor_step_id
      where edge.work_plan_version_id = plan_version.id), '[]'::jsonb)
  ) into definition;

  insert into public.applied_work_plans(
    organization_id, facility_id, work_plan_version_id, source_type, source_id,
    generation_fingerprint, definition_snapshot
  ) values (
    order_row.organization_id, order_row.facility_id, plan_version.id, 'customer_order',
    order_row.id, new.fingerprint, definition
  ) returning id into applied_id;

  -- Pre-Op and Post-Op are accountable work orders, not checklist-only
  -- decorations on Mixing. They retain the same aggregate batch commitment and
  -- schedule projection while keeping their own dependency/lifecycle records.
  for mixing_work in select * from public.workforce_work_queue_items work
    where work.organization_id = order_row.organization_id
      and work.facility_id = order_row.facility_id
      and work.linked_task_type = 'production_plan' and work.linked_task_id = order_row.id
      and work.kind = 'mixing'
  loop
    pre_op_id := gen_random_uuid();
    post_op_id := gen_random_uuid();
    insert into public.workforce_work_queue_items(
      id, organization_id, facility_id, work_on, kind, title, linked_task_type,
      linked_task_id, required_worker_count, start_at, end_at, all_day, timezone,
      product_id, customer_id
    ) values
      (pre_op_id, mixing_work.organization_id, mixing_work.facility_id, mixing_work.work_on,
        'pre_op', left(mixing_work.title || ' — Pre-Op', 120), 'production_plan', order_row.id,
        mixing_work.required_worker_count, mixing_work.start_at, mixing_work.end_at,
        mixing_work.all_day, mixing_work.timezone, mixing_work.product_id, mixing_work.customer_id),
      (post_op_id, mixing_work.organization_id, mixing_work.facility_id, mixing_work.work_on,
        'post_op', left(mixing_work.title || ' — Post-Op', 120), 'production_plan', order_row.id,
        mixing_work.required_worker_count, mixing_work.start_at, mixing_work.end_at,
        mixing_work.all_day, mixing_work.timezone, mixing_work.product_id, mixing_work.customer_id);
    insert into public.workforce_schedule_events(
      id, organization_id, facility_id, start_on, end_on, start_at, end_at, all_day,
      timezone, kind, title, production_plan_id, linked_task_type, linked_task_id,
      product_id, customer_id, required_worker_count, planned_batch_count
    ) values
      (pre_op_id, mixing_work.organization_id, mixing_work.facility_id, mixing_work.work_on,
        mixing_work.work_on + 1, mixing_work.start_at, mixing_work.end_at, mixing_work.all_day,
        mixing_work.timezone, 'pre_op', left(mixing_work.title || ' — Pre-Op', 120), order_row.id,
        'production_plan', order_row.id, mixing_work.product_id, mixing_work.customer_id,
        mixing_work.required_worker_count, mixing_work.batch_quota),
      (post_op_id, mixing_work.organization_id, mixing_work.facility_id, mixing_work.work_on,
        mixing_work.work_on + 1, mixing_work.start_at, mixing_work.end_at, mixing_work.all_day,
        mixing_work.timezone, 'post_op', left(mixing_work.title || ' — Post-Op', 120), order_row.id,
        'production_plan', order_row.id, mixing_work.product_id, mixing_work.customer_id,
        mixing_work.required_worker_count, mixing_work.batch_quota);
    insert into public.work_order_dependencies(organization_id, facility_id, predecessor_id, successor_id)
      values (order_row.organization_id, order_row.facility_id, pre_op_id, mixing_work.id),
        (order_row.organization_id, order_row.facility_id, mixing_work.id, post_op_id);
    insert into public.workforce_schedule_event_dependencies(organization_id, facility_id, predecessor_id, successor_id)
      values (order_row.organization_id, order_row.facility_id, pre_op_id, mixing_work.id),
        (order_row.organization_id, order_row.facility_id, mixing_work.id, post_op_id);
  end loop;

  insert into public.work_packages(
    organization_id, facility_id, package_type, source_type, source_id, title,
    applied_work_plan_id, operation_kind, planned_quantity, planned_unit, created_by, updated_by
  )
  select work.organization_id, work.facility_id, 'production', 'generated_work_order', work.id,
    work.title, applied_id, work.kind,
    case when work.kind in ('ingredient_prep', 'mixing') then work.batch_quota else schedule.planned_batch_count end,
    case when work.kind in ('ingredient_prep', 'mixing') then 'batch' else 'batch' end,
    auth.uid(), auth.uid()
  from public.workforce_work_queue_items work
  left join public.workforce_schedule_events schedule on schedule.id = work.id
  where work.organization_id = order_row.organization_id and work.facility_id = order_row.facility_id
    and work.linked_task_type = 'production_plan' and work.linked_task_id = order_row.id
    and work.kind in ('ingredient_prep', 'pre_op', 'mixing', 'post_op', 'packaging');

  update public.workforce_work_queue_items work set work_package_id = package.id
  from public.work_packages package
  where package.applied_work_plan_id = applied_id
    and package.source_type = 'generated_work_order' and package.source_id = work.id
    and work.organization_id = order_row.organization_id and work.facility_id = order_row.facility_id;
  return new;
end $$;

create trigger order_generation_applied_plan_capture
  after insert on private.order_work_generations
  for each row execute function private.capture_order_generation_as_applied_plan();

revoke all on function private.capture_order_generation_as_applied_plan() from public, anon, authenticated;
comment on table public.applied_work_plans is
  'Immutable released Work Plan snapshot applied by an order production generation.';
comment on column public.work_packages.operation_kind is
  'Aggregate generation commitment kind; it never records execution completion or material availability.';

notify pgrst, 'reload schema';
commit;
