begin;

-- Dependencies belong to canonical work orders, not to a scheduler projection.
-- Scoped foreign keys make it impossible to connect work across a tenant or plant.
alter table public.workforce_work_queue_items
  add constraint workforce_work_queue_items_dependency_scope
    unique (organization_id, facility_id, id);

create table public.work_order_dependencies (
  organization_id uuid not null,
  facility_id uuid not null,
  predecessor_id uuid not null,
  successor_id uuid not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (predecessor_id, successor_id),
  check (predecessor_id <> successor_id),
  foreign key (organization_id, facility_id, predecessor_id)
    references public.workforce_work_queue_items(organization_id, facility_id, id),
  foreign key (organization_id, facility_id, successor_id)
    references public.workforce_work_queue_items(organization_id, facility_id, id)
);
create index work_order_dependencies_successor
  on public.work_order_dependencies(organization_id, facility_id, successor_id);

alter table public.work_order_dependencies enable row level security;
revoke all on public.work_order_dependencies from public, anon, authenticated;

create function public.guard_work_order_dependency() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    with recursive downstream(id) as (
      select dependency.successor_id
      from public.work_order_dependencies dependency
      where dependency.organization_id = new.organization_id
        and dependency.facility_id = new.facility_id
        and dependency.predecessor_id = new.successor_id
      union
      select dependency.successor_id
      from public.work_order_dependencies dependency
      join downstream on downstream.id = dependency.predecessor_id
      where dependency.organization_id = new.organization_id
        and dependency.facility_id = new.facility_id
    )
    select 1 from downstream where id = new.predecessor_id
  ) then
    raise exception 'Work order dependencies cannot contain a cycle';
  end if;
  return new;
end $$;

create trigger work_order_dependency_cycle_guard
  before insert or update on public.work_order_dependencies
  for each row execute function public.guard_work_order_dependency();

-- Temporary compatibility storage for the current scheduler. It preserves the
-- same scoped guarantees while legacy schedule rows are migrated to Work.
create table public.workforce_schedule_event_dependencies (
  organization_id uuid not null,
  facility_id uuid not null,
  predecessor_id uuid not null,
  successor_id uuid not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (predecessor_id, successor_id),
  check (predecessor_id <> successor_id),
  foreign key (organization_id, facility_id, predecessor_id)
    references public.workforce_schedule_events(organization_id, facility_id, id) on delete cascade,
  foreign key (organization_id, facility_id, successor_id)
    references public.workforce_schedule_events(organization_id, facility_id, id) on delete cascade
);
create index workforce_schedule_event_dependencies_successor
  on public.workforce_schedule_event_dependencies(organization_id, facility_id, successor_id);
alter table public.workforce_schedule_event_dependencies enable row level security;
revoke all on public.workforce_schedule_event_dependencies from public, anon, authenticated;

create function public.guard_schedule_event_dependency() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    with recursive downstream(id) as (
      select dependency.successor_id
      from public.workforce_schedule_event_dependencies dependency
      where dependency.organization_id = new.organization_id
        and dependency.facility_id = new.facility_id
        and dependency.predecessor_id = new.successor_id
      union
      select dependency.successor_id
      from public.workforce_schedule_event_dependencies dependency
      join downstream on downstream.id = dependency.predecessor_id
      where dependency.organization_id = new.organization_id
        and dependency.facility_id = new.facility_id
    ) select 1 from downstream where id = new.predecessor_id
  ) then
    raise exception 'Schedule dependencies cannot contain a cycle';
  end if;
  return new;
end $$;
create trigger workforce_schedule_event_dependency_cycle_guard
  before insert or update on public.workforce_schedule_event_dependencies
  for each row execute function public.guard_schedule_event_dependency();

create function public.get_work_order_dependencies(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare requested_facility uuid := (payload->>'facility_id')::uuid;
begin
  if not public.has_permission('workforce.read') then
    raise exception 'Workforce access required';
  end if;
  if requested_facility is distinct from public.current_facility()
    or payload - 'facility_id' <> '{}'::jsonb then
    raise exception 'Invalid work order dependency scope';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'predecessor_id', dependency.predecessor_id,
      'successor_id', dependency.successor_id
    ) order by dependency.predecessor_id, dependency.successor_id)
    from (
      select edge.organization_id, edge.facility_id, edge.predecessor_id, edge.successor_id
        from public.work_order_dependencies edge
      union all
      select edge.organization_id, edge.facility_id, edge.predecessor_id, edge.successor_id
        from public.workforce_schedule_event_dependencies edge
    ) dependency
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = requested_facility
      and (
        (exists (select 1 from public.workforce_work_queue_items work
          where work.id = dependency.predecessor_id and work.publication_state <> 'cancelled')
        and exists (select 1 from public.workforce_work_queue_items work
          where work.id = dependency.successor_id and work.publication_state <> 'cancelled'))
        or
        (exists (select 1 from public.workforce_schedule_events event
          where event.id = dependency.predecessor_id)
        and exists (select 1 from public.workforce_schedule_events event
          where event.id = dependency.successor_id))
      )
  ), '[]'::jsonb);
end $$;

create function public.set_schedule_event_predecessors(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_facility uuid := (payload->>'facility_id')::uuid;
declare requested_successor uuid := (payload->>'successor_id')::uuid;
declare requested_revision integer := (payload->>'revision')::integer;
declare requested_predecessors jsonb := payload->'predecessor_ids';
declare successor public.workforce_schedule_events%rowtype;
declare before_dependencies jsonb;
declare after_dependencies jsonb;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  if requested_facility is distinct from public.current_facility()
    or requested_successor is null or requested_revision is null or requested_revision <= 0
    or jsonb_typeof(requested_predecessors) <> 'array'
    or payload - array['facility_id', 'successor_id', 'revision', 'predecessor_ids'] <> '{}'::jsonb
    or exists (select 1 from jsonb_array_elements(requested_predecessors) value
      where jsonb_typeof(value) <> 'string'
        or trim(both '"' from value::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    or (select count(*) from jsonb_array_elements_text(requested_predecessors))
      <> (select count(distinct value) from jsonb_array_elements_text(requested_predecessors) value) then
    raise exception 'Choose valid schedule predecessors and a current revision';
  end if;
  select * into successor from public.workforce_schedule_events event
    where event.organization_id = public.current_org()
      and event.facility_id = requested_facility and event.id = requested_successor
    for update;
  if successor.id is null then raise exception 'Schedule event unavailable'; end if;
  if successor.revision <> requested_revision then
    raise exception 'Schedule changed; reload and try again';
  end if;
  perform 1 from public.workforce_schedule_events event
    where event.organization_id = public.current_org() and event.facility_id = requested_facility
      and event.id in (select value::uuid from jsonb_array_elements_text(requested_predecessors) value)
    order by event.id for update;
  if exists (
    select 1 from jsonb_array_elements_text(requested_predecessors) requested(value)
    left join public.workforce_schedule_events predecessor
      on predecessor.organization_id = public.current_org()
      and predecessor.facility_id = requested_facility and predecessor.id = requested.value::uuid
    where predecessor.id is null or predecessor.id = requested_successor
  ) then raise exception 'Schedule predecessor unavailable'; end if;
  select coalesce(jsonb_agg(edge.predecessor_id order by edge.predecessor_id), '[]'::jsonb)
    into before_dependencies from public.workforce_schedule_event_dependencies edge
    where edge.organization_id = public.current_org() and edge.facility_id = requested_facility
      and edge.successor_id = requested_successor;
  delete from public.workforce_schedule_event_dependencies edge
    where edge.organization_id = public.current_org() and edge.facility_id = requested_facility
      and edge.successor_id = requested_successor;
  insert into public.workforce_schedule_event_dependencies(
    organization_id, facility_id, predecessor_id, successor_id, created_by
  ) select public.current_org(), requested_facility, value::uuid, requested_successor, auth.uid()
    from jsonb_array_elements_text(requested_predecessors) value;
  update public.workforce_schedule_events set
    updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where id = requested_successor;
  select coalesce(jsonb_agg(edge.predecessor_id order by edge.predecessor_id), '[]'::jsonb)
    into after_dependencies from public.workforce_schedule_event_dependencies edge
    where edge.organization_id = public.current_org() and edge.facility_id = requested_facility
      and edge.successor_id = requested_successor;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, before_data, after_data
  ) values (public.current_org(), auth.uid(), 'workforce_schedule_events', requested_successor,
    'SCHEDULE_EVENT_PREDECESSORS_CHANGED',
    jsonb_build_object('predecessor_ids', before_dependencies),
    jsonb_build_object('predecessor_ids', after_dependencies));
  return requested_successor;
end $$;

-- Replace one work order's incoming edges as one optimistic, audited change.
-- This supports initial work (an empty predecessor list) and arbitrary insertion.
create function public.set_work_order_predecessors(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_facility uuid := (payload->>'facility_id')::uuid;
declare requested_successor uuid := (payload->>'successor_id')::uuid;
declare requested_revision integer := (payload->>'revision')::integer;
declare requested_predecessors jsonb := payload->'predecessor_ids';
declare successor public.workforce_work_queue_items%rowtype;
declare before_dependencies jsonb;
declare after_dependencies jsonb;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  if requested_facility is distinct from public.current_facility()
    or requested_successor is null or requested_revision is null or requested_revision <= 0
    or jsonb_typeof(requested_predecessors) <> 'array'
    or payload - array['facility_id', 'successor_id', 'revision', 'predecessor_ids'] <> '{}'::jsonb
    or exists (select 1 from jsonb_array_elements(requested_predecessors) value
      where jsonb_typeof(value) <> 'string'
        or trim(both '"' from value::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    or (select count(*) from jsonb_array_elements_text(requested_predecessors))
      <> (select count(distinct value) from jsonb_array_elements_text(requested_predecessors) value) then
    raise exception 'Choose valid work order predecessors and a current revision';
  end if;

  select * into successor from public.workforce_work_queue_items work
    where work.organization_id = public.current_org()
      and work.facility_id = requested_facility and work.id = requested_successor
    for update;
  if successor.id is null or successor.publication_state = 'cancelled' then
    raise exception 'Work order unavailable';
  end if;
  if successor.revision <> requested_revision then
    raise exception 'Work order changed; reload and try again';
  end if;
  if successor.status = 'completed' then
    raise exception 'Completed work dependencies cannot be changed';
  end if;

  perform 1 from public.workforce_work_queue_items work
    where work.organization_id = public.current_org()
      and work.facility_id = requested_facility
      and work.id in (select value::uuid from jsonb_array_elements_text(requested_predecessors) value)
    order by work.id for update;
  if exists (
    select 1 from jsonb_array_elements_text(requested_predecessors) requested(value)
    left join public.workforce_work_queue_items predecessor
      on predecessor.organization_id = public.current_org()
      and predecessor.facility_id = requested_facility
      and predecessor.id = requested.value::uuid
      and predecessor.publication_state <> 'cancelled'
    where predecessor.id is null or predecessor.id = requested_successor
  ) then
    raise exception 'Work order predecessor unavailable';
  end if;

  select coalesce(jsonb_agg(dependency.predecessor_id order by dependency.predecessor_id), '[]'::jsonb)
    into before_dependencies from public.work_order_dependencies dependency
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = requested_facility
      and dependency.successor_id = requested_successor;
  delete from public.work_order_dependencies dependency
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = requested_facility
      and dependency.successor_id = requested_successor;
  insert into public.work_order_dependencies(
    organization_id, facility_id, predecessor_id, successor_id, created_by
  ) select public.current_org(), requested_facility, value::uuid, requested_successor, auth.uid()
    from jsonb_array_elements_text(requested_predecessors) value;
  update public.workforce_work_queue_items set
    updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where id = requested_successor;
  select coalesce(jsonb_agg(dependency.predecessor_id order by dependency.predecessor_id), '[]'::jsonb)
    into after_dependencies from public.work_order_dependencies dependency
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = requested_facility
      and dependency.successor_id = requested_successor;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, before_data, after_data
  ) values (
    public.current_org(), auth.uid(), 'workforce_work_queue_items', requested_successor,
    'WORK_ORDER_PREDECESSORS_CHANGED',
    jsonb_build_object('predecessor_ids', before_dependencies),
    jsonb_build_object('predecessor_ids', after_dependencies)
  );
  return requested_successor;
end $$;

-- Delete means audited cancellation: historical work remains available, while
-- every direct successor is atomically reattached to every direct predecessor.
create function public.delete_work_order(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_facility uuid := (payload->>'facility_id')::uuid;
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_revision integer := (payload->>'revision')::integer;
declare work public.workforce_work_queue_items%rowtype;
declare before_snapshot jsonb;
declare predecessor_ids jsonb;
declare successor_ids jsonb;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  if requested_facility is distinct from public.current_facility()
    or requested_id is null or requested_revision is null or requested_revision <= 0
    or payload - array['facility_id', 'id', 'revision'] <> '{}'::jsonb then
    raise exception 'Choose a valid work order and current revision';
  end if;
  select * into work from public.workforce_work_queue_items item
    where item.organization_id = public.current_org()
      and item.facility_id = requested_facility and item.id = requested_id
    for update;
  if work.id is null or work.publication_state = 'cancelled' then
    raise exception 'Work order unavailable';
  end if;
  if work.revision <> requested_revision then
    raise exception 'Work order changed; reload and try again';
  end if;
  if work.status = 'completed' or exists (
    select 1 from public.production_batches batch
      where batch.organization_id = public.current_org() and batch.facility_id = requested_facility
        and batch.work_order_id = requested_id and batch.state <> 'not_started'
    union all
    select 1 from public.preparation_executions preparation
      where preparation.organization_id = public.current_org() and preparation.facility_id = requested_facility
        and preparation.work_order_id = requested_id and preparation.state <> 'not_started'
  ) then
    raise exception 'Started or completed work cannot be deleted';
  end if;

  perform 1 from public.workforce_work_queue_items item
    where item.organization_id = public.current_org() and item.facility_id = requested_facility
      and item.id in (
        select dependency.predecessor_id from public.work_order_dependencies dependency
          where dependency.organization_id = public.current_org()
            and dependency.facility_id = requested_facility and dependency.successor_id = requested_id
        union
        select dependency.successor_id from public.work_order_dependencies dependency
          where dependency.organization_id = public.current_org()
            and dependency.facility_id = requested_facility and dependency.predecessor_id = requested_id
      ) order by item.id for update;
  if exists (
    select 1 from public.work_order_dependencies dependency
    join public.workforce_work_queue_items successor on successor.id = dependency.successor_id
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = requested_facility
      and dependency.predecessor_id = requested_id and successor.status = 'completed'
  ) then
    raise exception 'Completed work dependencies cannot be changed';
  end if;

  before_snapshot := to_jsonb(work);
  select coalesce(jsonb_agg(dependency.predecessor_id order by dependency.predecessor_id), '[]'::jsonb)
    into predecessor_ids from public.work_order_dependencies dependency
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = requested_facility and dependency.successor_id = requested_id;
  select coalesce(jsonb_agg(dependency.successor_id order by dependency.successor_id), '[]'::jsonb)
    into successor_ids from public.work_order_dependencies dependency
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = requested_facility and dependency.predecessor_id = requested_id;

  delete from public.work_order_dependencies dependency
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = requested_facility
      and (dependency.predecessor_id = requested_id or dependency.successor_id = requested_id);
  insert into public.work_order_dependencies(
    organization_id, facility_id, predecessor_id, successor_id, created_by
  ) select public.current_org(), requested_facility, predecessor.value::uuid,
      successor.value::uuid, auth.uid()
    from jsonb_array_elements_text(predecessor_ids) predecessor
    cross join jsonb_array_elements_text(successor_ids) successor
    where predecessor.value <> successor.value
    on conflict (predecessor_id, successor_id) do nothing;

  delete from public.workforce_work_queue_claims claim
    where claim.organization_id = public.current_org()
      and claim.facility_id = requested_facility and claim.queue_item_id = requested_id;
  update public.workforce_work_queue_items set
    status = 'cancelled', publication_state = 'cancelled',
    updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where id = requested_id;
  update public.workforce_work_queue_items successor set
    updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where successor.organization_id = public.current_org()
      and successor.facility_id = requested_facility
      and successor.id in (select value::uuid from jsonb_array_elements_text(successor_ids) value);
  insert into public.workforce_work_queue_history(
    organization_id, facility_id, queue_item_id, action, actor_user_id, before_data, after_data
  ) select public.current_org(), requested_facility, requested_id, 'cancelled', auth.uid(),
      before_snapshot, to_jsonb(item)
    from public.workforce_work_queue_items item where item.id = requested_id;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, before_data, after_data
  ) values (
    public.current_org(), auth.uid(), 'workforce_work_queue_items', requested_id,
    'WORK_ORDER_DELETED',
    before_snapshot || jsonb_build_object('predecessor_ids', predecessor_ids, 'successor_ids', successor_ids),
    jsonb_build_object('status', 'cancelled', 'relinked_predecessor_ids', predecessor_ids,
      'relinked_successor_ids', successor_ids)
  );
  return requested_id;
end $$;

-- Preserve the established canonical move RPC while making dependency movement
-- one transaction. Only downstream work moves; predecessors never move.
create or replace function public.move_scheduled_work_order(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_revision integer := (payload->>'revision')::integer;
declare requested_start timestamptz := (payload->>'start_at')::timestamptz;
declare requested_end timestamptz := (payload->>'end_at')::timestamptz;
declare root_work public.workforce_work_queue_items%rowtype;
declare move_delta interval;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  if requested_id is null or requested_revision is null or requested_revision <= 0
    or requested_start is null or requested_end is null or requested_end <= requested_start
    or payload - array['id', 'revision', 'start_at', 'end_at'] <> '{}'::jsonb then
    raise exception 'Choose a valid work time and current revision';
  end if;
  select * into root_work from public.workforce_work_queue_items work
    where work.organization_id = public.current_org()
      and work.facility_id = public.current_facility() and work.id = requested_id
    for update;
  if root_work.id is null or root_work.start_at is null
    or root_work.publication_state = 'cancelled' then
    raise exception 'Scheduled work unavailable';
  end if;
  if root_work.revision <> requested_revision then
    raise exception 'Scheduled work changed; reload and try again';
  end if;
  if root_work.status = 'completed' then raise exception 'Completed work cannot be moved'; end if;
  move_delta := requested_start - root_work.start_at;

  perform 1 from public.workforce_work_queue_items work
    where work.organization_id = public.current_org()
      and work.facility_id = public.current_facility()
      and work.id in (
        with recursive downstream(id) as (
          select requested_id
          union
          select dependency.successor_id
          from public.work_order_dependencies dependency
          join downstream on downstream.id = dependency.predecessor_id
          where dependency.organization_id = public.current_org()
            and dependency.facility_id = public.current_facility()
        ) select id from downstream
      ) order by work.id for update;
  if exists (
    with recursive downstream(id) as (
      select dependency.successor_id from public.work_order_dependencies dependency
      where dependency.organization_id = public.current_org()
        and dependency.facility_id = public.current_facility()
        and dependency.predecessor_id = requested_id
      union
      select dependency.successor_id from public.work_order_dependencies dependency
      join downstream on downstream.id = dependency.predecessor_id
      where dependency.organization_id = public.current_org()
        and dependency.facility_id = public.current_facility()
    ) select 1 from downstream
      join public.workforce_work_queue_items work on work.id = downstream.id
      where work.status = 'completed'
  ) then raise exception 'Completed dependent work cannot be moved'; end if;
  if exists (
    with recursive downstream(id) as (
      select dependency.successor_id from public.work_order_dependencies dependency
      where dependency.organization_id = public.current_org()
        and dependency.facility_id = public.current_facility()
        and dependency.predecessor_id = requested_id
      union
      select dependency.successor_id from public.work_order_dependencies dependency
      join downstream on downstream.id = dependency.predecessor_id
      where dependency.organization_id = public.current_org()
        and dependency.facility_id = public.current_facility()
    ) select 1 from downstream
      join public.workforce_work_queue_items work on work.id = downstream.id
      where work.start_at is null or work.end_at is null or work.publication_state = 'cancelled'
  ) then raise exception 'Dependent work is not available to move'; end if;

  with recursive downstream(id) as (
    select dependency.successor_id from public.work_order_dependencies dependency
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = public.current_facility()
      and dependency.predecessor_id = requested_id
    union
    select dependency.successor_id from public.work_order_dependencies dependency
    join downstream on downstream.id = dependency.predecessor_id
    where dependency.organization_id = public.current_org()
      and dependency.facility_id = public.current_facility()
  ) update public.workforce_work_queue_items work set
      start_at = work.start_at + move_delta, end_at = work.end_at + move_delta,
      work_on = ((work.start_at + move_delta) at time zone work.timezone)::date,
      updated_by = auth.uid(), updated_at = now(), revision = work.revision + 1
    where work.organization_id = public.current_org()
      and work.facility_id = public.current_facility()
      and work.id in (select id from downstream);
  update public.workforce_work_queue_items set
    start_at = requested_start, end_at = requested_end,
    work_on = (requested_start at time zone root_work.timezone)::date,
    updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where id = requested_id;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, before_data, after_data
  ) values (public.current_org(), auth.uid(), 'workforce_work_queue_items', requested_id,
    'WORK_ORDER_CHAIN_MOVED',
    jsonb_build_object('start_at', root_work.start_at, 'end_at', root_work.end_at),
    jsonb_build_object('start_at', requested_start, 'end_at', requested_end, 'delta', move_delta));
  return requested_id;
end $$;

create function public.move_schedule_event_with_successors(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_revision integer := (payload->>'revision')::integer;
declare requested_start timestamptz := (payload->>'start_at')::timestamptz;
declare requested_end timestamptz := (payload->>'end_at')::timestamptz;
declare root_event public.workforce_schedule_events%rowtype;
declare moved_event public.workforce_schedule_events%rowtype;
declare move_delta interval;
declare assigned_workers uuid[];
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  select * into root_event from public.workforce_schedule_events event
    where event.organization_id = public.current_org()
      and event.facility_id = public.current_facility() and event.id = requested_id for update;
  if root_event.id is null or requested_revision is null or requested_revision <= 0
    or requested_start is null or requested_end is null or requested_end <= requested_start then
    raise exception 'Schedule event unavailable';
  end if;
  if root_event.revision <> requested_revision then raise exception 'Schedule changed; reload and try again'; end if;
  move_delta := requested_start - root_event.start_at;
  perform 1 from public.workforce_schedule_events event
    where event.organization_id = public.current_org() and event.facility_id = public.current_facility()
      and event.id in (
        with recursive downstream(id) as (
          select requested_id union
          select edge.successor_id from public.workforce_schedule_event_dependencies edge
          join downstream on downstream.id = edge.predecessor_id
          where edge.organization_id = public.current_org()
            and edge.facility_id = public.current_facility()
        ) select id from downstream
      ) order by event.id for update;
  if exists (
    with recursive downstream(id) as (
      select edge.successor_id from public.workforce_schedule_event_dependencies edge
      where edge.organization_id = public.current_org() and edge.facility_id = public.current_facility()
        and edge.predecessor_id = requested_id
      union
      select edge.successor_id from public.workforce_schedule_event_dependencies edge
      join downstream on downstream.id = edge.predecessor_id
      where edge.organization_id = public.current_org() and edge.facility_id = public.current_facility()
    ) select 1 from downstream join public.workforce_work_queue_items work on work.id = downstream.id
      where work.status = 'completed'
  ) then raise exception 'Completed dependent work cannot be moved'; end if;
  with recursive downstream(id) as (
    select edge.successor_id from public.workforce_schedule_event_dependencies edge
    where edge.organization_id = public.current_org() and edge.facility_id = public.current_facility()
      and edge.predecessor_id = requested_id
    union
    select edge.successor_id from public.workforce_schedule_event_dependencies edge
    join downstream on downstream.id = edge.predecessor_id
    where edge.organization_id = public.current_org() and edge.facility_id = public.current_facility()
  ) update public.workforce_schedule_events event set
      start_at = event.start_at + move_delta, end_at = event.end_at + move_delta,
      start_on = ((event.start_at + move_delta) at time zone event.timezone)::date,
      end_on = (((event.end_at + move_delta - interval '1 microsecond') at time zone event.timezone)::date + 1),
      updated_by = auth.uid(), updated_at = now(), revision = event.revision + 1
    where event.organization_id = public.current_org() and event.facility_id = public.current_facility()
      and event.id in (select id from downstream);
  update public.workforce_schedule_events set
    start_at = requested_start, end_at = requested_end,
    start_on = (requested_start at time zone root_event.timezone)::date,
    end_on = (((requested_end - interval '1 microsecond') at time zone root_event.timezone)::date + 1),
    updated_by = auth.uid(), updated_at = now(), revision = revision + 1 where id = requested_id;
  for moved_event in
    with recursive downstream(id) as (
      select requested_id union
      select edge.successor_id from public.workforce_schedule_event_dependencies edge
      join downstream on downstream.id = edge.predecessor_id
      where edge.organization_id = public.current_org() and edge.facility_id = public.current_facility()
    ) select event.* from public.workforce_schedule_events event
      where event.id in (select id from downstream)
  loop
    select coalesce(array_agg(assignment.employee_id), array[]::uuid[]) into assigned_workers
      from public.workforce_schedule_assignments assignment where assignment.event_id = moved_event.id;
    perform public.check_workforce_conflict(moved_event.facility_id, moved_event.id,
      moved_event.start_at, moved_event.end_at, assigned_workers, moved_event.availability_override_reason);
  end loop;
  return requested_id;
end $$;

create or replace function public.delete_workforce_schedule_event(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_facility uuid := (payload->>'facility_id')::uuid;
declare requested_revision integer := (payload->>'revision')::integer;
declare prior public.workforce_schedule_events%rowtype;
declare before_snapshot jsonb;
declare predecessor_ids jsonb;
declare successor_ids jsonb;
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  perform public.lock_workforce_facility(requested_facility);
  select * into prior from public.workforce_schedule_events event
    where event.id = requested_id and event.organization_id = public.current_org()
      and event.facility_id = requested_facility for update;
  if prior.id is null then raise exception 'Schedule event unavailable'; end if;
  if prior.revision <> requested_revision then raise exception 'Schedule changed; reload and try again'; end if;
  perform 1 from public.workforce_schedule_events event
    where event.organization_id = public.current_org() and event.facility_id = requested_facility
      and event.id in (
        select edge.predecessor_id from public.workforce_schedule_event_dependencies edge
          where edge.successor_id = requested_id
        union select edge.successor_id from public.workforce_schedule_event_dependencies edge
          where edge.predecessor_id = requested_id
      ) order by event.id for update;
  if exists (select 1 from public.workforce_schedule_event_dependencies edge
    join public.workforce_work_queue_items work on work.id = edge.successor_id
    where edge.predecessor_id = requested_id and work.status = 'completed') then
    raise exception 'Completed work dependencies cannot be changed';
  end if;
  before_snapshot := to_jsonb(prior) || jsonb_build_object('employee_ids',
    (select coalesce(jsonb_agg(assignment.employee_id order by assignment.employee_id), '[]'::jsonb)
      from public.workforce_schedule_assignments assignment where assignment.event_id = requested_id));
  select coalesce(jsonb_agg(edge.predecessor_id order by edge.predecessor_id), '[]'::jsonb)
    into predecessor_ids from public.workforce_schedule_event_dependencies edge
    where edge.organization_id = public.current_org() and edge.facility_id = requested_facility
      and edge.successor_id = requested_id;
  select coalesce(jsonb_agg(edge.successor_id order by edge.successor_id), '[]'::jsonb)
    into successor_ids from public.workforce_schedule_event_dependencies edge
    where edge.organization_id = public.current_org() and edge.facility_id = requested_facility
      and edge.predecessor_id = requested_id;
  delete from public.workforce_schedule_event_dependencies edge
    where edge.organization_id = public.current_org() and edge.facility_id = requested_facility
      and (edge.predecessor_id = requested_id or edge.successor_id = requested_id);
  insert into public.workforce_schedule_event_dependencies(
    organization_id, facility_id, predecessor_id, successor_id, created_by
  ) select public.current_org(), requested_facility, predecessor.value::uuid,
      successor.value::uuid, auth.uid()
    from jsonb_array_elements_text(predecessor_ids) predecessor
    cross join jsonb_array_elements_text(successor_ids) successor
    where predecessor.value <> successor.value
    on conflict (predecessor_id, successor_id) do nothing;
  update public.workforce_schedule_events successor set
    updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where successor.id in (select value::uuid from jsonb_array_elements_text(successor_ids) value);
  delete from public.workforce_schedule_events where id = requested_id;
  insert into public.workforce_schedule_history(
    organization_id, facility_id, event_id, action, actor_user_id, before_data
  ) values (public.current_org(), requested_facility, requested_id, 'deleted', auth.uid(),
    before_snapshot || jsonb_build_object('predecessor_ids', predecessor_ids, 'successor_ids', successor_ids));
  return requested_id;
end $$;

revoke all on function public.guard_work_order_dependency(), public.guard_schedule_event_dependency(),
  public.get_work_order_dependencies(jsonb), public.set_work_order_predecessors(jsonb),
  public.set_schedule_event_predecessors(jsonb),
  public.delete_work_order(jsonb), public.move_scheduled_work_order(jsonb),
  public.move_schedule_event_with_successors(jsonb) from public, anon, authenticated;
grant execute on function public.get_work_order_dependencies(jsonb),
  public.set_work_order_predecessors(jsonb), public.set_schedule_event_predecessors(jsonb),
  public.delete_work_order(jsonb), public.move_scheduled_work_order(jsonb),
  public.move_schedule_event_with_successors(jsonb) to authenticated;

comment on table public.work_order_dependencies is
  'Durable finish-to-start relationships between canonical work orders in one organization and facility.';

commit;
