begin;

insert into public.permissions(code, area, label, description)
values (
  'operations.work_plans.manage', 'Operations', 'Manage Work Plans',
  'Create, review, and release versioned operational workflow plans'
) on conflict (code) do nothing;

insert into public.access_profile_permissions(organization_id, access_profile_id, permission_code)
select profile.organization_id, profile.id, 'operations.work_plans.manage'
from public.access_profiles profile
where profile.is_system and profile.base_role = 'admin'
on conflict do nothing;

create table public.work_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,79}$'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, facility_id, code),
  unique (organization_id, facility_id, id),
  foreign key (organization_id, facility_id) references public.facilities(organization_id, id)
);

create table public.work_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_plan_id uuid not null,
  version_number integer not null check (version_number > 0),
  state text not null default 'draft' check (state in ('draft', 'review', 'released', 'retired')),
  name text not null check (length(trim(name)) between 2 and 120),
  revision integer not null default 1 check (revision > 0),
  released_by uuid references auth.users(id),
  released_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (work_plan_id, version_number),
  unique (organization_id, facility_id, id),
  foreign key (organization_id, facility_id, work_plan_id)
    references public.work_plans(organization_id, facility_id, id),
  check ((released_by is null) = (released_at is null)),
  check (state <> 'released' or released_by is not null)
);

create table public.work_plan_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_plan_version_id uuid not null,
  step_key text not null check (step_key ~ '^[a-z][a-z0-9_]{0,79}$'),
  title text not null check (length(trim(title)) between 1 and 120),
  materialization_policy text not null check (materialization_policy in ('work_order', 'task_only')),
  task_template jsonb not null default '{}'::jsonb check (
    jsonb_typeof(task_template) = 'object'
    and task_template - array['instructions', 'requires_verification', 'optional'] = '{}'::jsonb
    and (not task_template ? 'instructions' or (
      jsonb_typeof(task_template->'instructions') = 'string'
      and length(task_template->>'instructions') <= 2000))
    and (not task_template ? 'requires_verification'
      or jsonb_typeof(task_template->'requires_verification') = 'boolean')
    and (not task_template ? 'optional' or jsonb_typeof(task_template->'optional') = 'boolean')
  ),
  sort_order integer not null check (sort_order >= 0),
  unique (work_plan_version_id, step_key),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, work_plan_version_id, id),
  foreign key (organization_id, facility_id, work_plan_version_id)
    references public.work_plan_versions(organization_id, facility_id, id)
);

create table public.work_plan_step_dependencies (
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_plan_version_id uuid not null,
  predecessor_step_id uuid not null,
  successor_step_id uuid not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (work_plan_version_id, predecessor_step_id, successor_step_id),
  check (predecessor_step_id <> successor_step_id),
  foreign key (organization_id, facility_id, work_plan_version_id)
    references public.work_plan_versions(organization_id, facility_id, id),
  foreign key (organization_id, facility_id, work_plan_version_id, predecessor_step_id)
    references public.work_plan_steps(organization_id, facility_id, work_plan_version_id, id),
  foreign key (organization_id, facility_id, work_plan_version_id, successor_step_id)
    references public.work_plan_steps(organization_id, facility_id, work_plan_version_id, id)
);

create function public.guard_work_plan_version_mutation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.state in ('released', 'retired') and not (
    tg_op = 'UPDATE' and old.state = 'released' and new.state = 'retired'
    and new.revision = old.revision + 1
    and (to_jsonb(new) - array['state','revision']) = (to_jsonb(old) - array['state','revision'])
  ) then
    raise exception 'Released Work Plan versions are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create function public.guard_work_plan_content_mutation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- Both parents matter: moving content out of released history also changes history.
  if exists (select 1 from public.work_plan_versions
    where id in (new.work_plan_version_id, old.work_plan_version_id)
      and state in ('released', 'retired')) then
    raise exception 'Released Work Plan versions are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger work_plan_version_immutable
  before update or delete on public.work_plan_versions
  for each row execute function public.guard_work_plan_version_mutation();
create trigger work_plan_step_immutable
  before insert or update or delete on public.work_plan_steps
  for each row execute function public.guard_work_plan_content_mutation();
create trigger work_plan_dependency_immutable
  before insert or update or delete on public.work_plan_step_dependencies
  for each row execute function public.guard_work_plan_content_mutation();

alter table public.work_plans enable row level security;
alter table public.work_plan_versions enable row level security;
alter table public.work_plan_steps enable row level security;
alter table public.work_plan_step_dependencies enable row level security;
revoke all on public.work_plans, public.work_plan_versions, public.work_plan_steps,
  public.work_plan_step_dependencies from public, anon, authenticated;

create function public.release_work_plan_version(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_version_id uuid;
declare requested_revision integer;
declare plan_version public.work_plan_versions%rowtype;
begin
  if not public.has_permission('settings.manage')
    or not public.has_permission('operations.work_plans.manage') then
    raise exception 'Work Plan management permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['version_id', 'revision']
    or payload - array['version_id', 'revision'] <> '{}'::jsonb
    or coalesce(payload->>'version_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(payload->'revision') is distinct from 'number'
    or coalesce(payload->>'revision', '') !~ '^[1-9][0-9]*$' then
    raise exception 'Choose a current Work Plan version';
  end if;
  requested_version_id := (payload->>'version_id')::uuid;
  requested_revision := (payload->>'revision')::integer;
  select * into plan_version from public.work_plan_versions
  where id = requested_version_id and organization_id = public.current_org()
    and facility_id = public.current_facility() for update;
  if plan_version.id is null then raise exception 'Work Plan version unavailable'; end if;
  if plan_version.revision <> requested_revision then
    raise exception 'Work Plan version changed; reload and try again';
  end if;
  if plan_version.state not in ('draft', 'review') then
    raise exception 'Only draft or review Work Plan versions can be released';
  end if;
  if not exists (select 1 from public.work_plan_steps where work_plan_version_id = plan_version.id) then
    raise exception 'A Work Plan version needs at least one step';
  end if;
  if exists (
    with recursive reach(origin_id, current_id) as (
      select predecessor_step_id, successor_step_id
      from public.work_plan_step_dependencies where work_plan_version_id = plan_version.id
      union
      select reach.origin_id, dependency.successor_step_id
      from reach join public.work_plan_step_dependencies dependency
        on dependency.work_plan_version_id = plan_version.id
        and dependency.predecessor_step_id = reach.current_id
    ) select 1 from reach where current_id = origin_id
  ) then raise exception 'Work Plan dependencies cannot contain a cycle'; end if;
  update public.work_plan_versions set state = 'released', released_by = auth.uid(), released_at = now(),
    revision = revision + 1 where id = plan_version.id;
  insert into public.audit_events(organization_id, actor_user_id, entity_type, entity_id, event_type, before_data, after_data)
  values (plan_version.organization_id, auth.uid(), 'work_plan_versions', plan_version.id,
    'WORK_PLAN_VERSION_RELEASED', jsonb_build_object('state', plan_version.state, 'revision', plan_version.revision),
    jsonb_build_object('state', 'released', 'revision', plan_version.revision + 1));
  return plan_version.id;
end $$;

-- Validate nested JSON before any content write; text extraction must not coerce scalars.
create function public.validate_work_plan_definition(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare step jsonb;
declare edge jsonb;
begin
  if jsonb_typeof(payload->'name') is distinct from 'string'
    or jsonb_typeof(payload->'steps') is distinct from 'array'
    or jsonb_typeof(payload->'dependencies') is distinct from 'array' then
    raise exception 'Enter a valid Work Plan definition';
  end if;
  if jsonb_array_length(payload->'steps') > 100
    or jsonb_array_length(payload->'dependencies') > 500 then
    raise exception 'Work Plans allow at most 100 steps and 500 dependencies';
  end if;
  for step in select value from jsonb_array_elements(payload->'steps') loop
    if jsonb_typeof(step) is distinct from 'object'
      or not step ?& array['key','title','materialization_policy','task_template']
      or step - array['key','title','materialization_policy','task_template'] <> '{}'::jsonb
      or jsonb_typeof(step->'key') is distinct from 'string'
      or jsonb_typeof(step->'title') is distinct from 'string'
      or jsonb_typeof(step->'materialization_policy') is distinct from 'string' then
      raise exception 'Enter a valid Work Plan definition';
    end if;
    if jsonb_typeof(step->'task_template') is distinct from 'object'
      or (step->'task_template') - array['instructions','requires_verification','optional'] <> '{}'::jsonb
      or ((step->'task_template') ? 'instructions' and
        jsonb_typeof(step->'task_template'->'instructions') is distinct from 'string')
      or ((step->'task_template') ? 'requires_verification' and
        jsonb_typeof(step->'task_template'->'requires_verification') is distinct from 'boolean')
      or ((step->'task_template') ? 'optional' and
        jsonb_typeof(step->'task_template'->'optional') is distinct from 'boolean') then
      raise exception 'Invalid Work Plan task template check constraint';
    end if;
  end loop;
  for edge in select value from jsonb_array_elements(payload->'dependencies') loop
    if jsonb_typeof(edge) is distinct from 'object'
      or not edge ?& array['predecessor_key','successor_key']
      or edge - array['predecessor_key','successor_key'] <> '{}'::jsonb
      or jsonb_typeof(edge->'predecessor_key') is distinct from 'string'
      or jsonb_typeof(edge->'successor_key') is distinct from 'string' then
      raise exception 'Enter a valid Work Plan definition';
    end if;
  end loop;
end $$;
revoke all on function public.validate_work_plan_definition(jsonb) from public, anon, authenticated;

create function public.create_work_plan(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare plan_id uuid;
declare version_id uuid;
declare plan_code text;
declare plan_name text;
declare dependency record;
begin
  if not public.has_permission('settings.manage')
    or not public.has_permission('operations.work_plans.manage') then
    raise exception 'Work Plan management permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['code', 'name', 'steps', 'dependencies']
    or payload - array['code', 'name', 'steps', 'dependencies'] <> '{}'::jsonb
    or jsonb_typeof(payload->'steps') is distinct from 'array'
    or jsonb_typeof(payload->'dependencies') is distinct from 'array'
    or jsonb_typeof(payload->'code') is distinct from 'string'
    or coalesce(payload->>'code', '') !~ '^[a-z][a-z0-9_]{1,79}$'
    or length(trim(coalesce(payload->>'name', ''))) not between 2 and 120 then
    raise exception 'Enter a valid Work Plan definition';
  end if;
  perform public.validate_work_plan_definition(payload);
  plan_code := payload->>'code';
  plan_name := trim(payload->>'name');
  if jsonb_array_length(payload->'steps') > 100
    or jsonb_array_length(payload->'dependencies') > 500 then
    raise exception 'Work Plans allow at most 100 steps and 500 dependencies';
  end if;
  if jsonb_array_length(payload->'steps') = 0 then
    raise exception 'A Work Plan version needs at least one step';
  end if;
  insert into public.work_plans(code) values (plan_code) returning id into plan_id;
  insert into public.work_plan_versions(work_plan_id, version_number, name)
  values (plan_id, 1, plan_name) returning id into version_id;
  insert into public.work_plan_steps(
    work_plan_version_id, step_key, title, materialization_policy, task_template, sort_order
  ) select version_id, trim(source.value->>'key'), trim(source.value->>'title'),
    source.value->>'materialization_policy', source.value->'task_template',
    (source.position - 1)::integer
  from jsonb_array_elements(payload->'steps') with ordinality as source(value, position)
  ;
  if (select count(*) from public.work_plan_steps where work_plan_version_id = version_id)
    <> jsonb_array_length(payload->'steps') then
    raise exception 'Work Plan steps must be unique and complete';
  end if;
  for dependency in select * from jsonb_to_recordset(payload->'dependencies') as item(
    predecessor_key text, successor_key text
  ) loop
    insert into public.work_plan_step_dependencies(
      work_plan_version_id, predecessor_step_id, successor_step_id
    ) select version_id, predecessor.id, successor.id
      from public.work_plan_steps predecessor join public.work_plan_steps successor
        on successor.work_plan_version_id = predecessor.work_plan_version_id
      where predecessor.work_plan_version_id = version_id
        and predecessor.step_key = dependency.predecessor_key
        and successor.step_key = dependency.successor_key;
    if not found then raise exception 'Dependencies must reference Work Plan steps'; end if;
  end loop;
  if exists (
    with recursive reach(origin_id, current_id) as (
      select predecessor_step_id, successor_step_id
      from public.work_plan_step_dependencies where work_plan_version_id = version_id
      union
      select reach.origin_id, edge.successor_step_id
      from reach join public.work_plan_step_dependencies edge
        on edge.work_plan_version_id = version_id and edge.predecessor_step_id = reach.current_id
    ) select 1 from reach where current_id = origin_id
  ) then raise exception 'Work Plan dependencies cannot contain a cycle'; end if;
  insert into public.audit_events(organization_id, actor_user_id, entity_type, entity_id, event_type, after_data)
  values (public.current_org(), auth.uid(), 'work_plan_versions', version_id, 'WORK_PLAN_VERSION_CREATED',
    jsonb_build_object('work_plan_id', plan_id, 'version_number', 1, 'state', 'draft'));
  return version_id;
end $$;

create function public.list_work_plan_versions() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.has_permission('settings.manage')
      and public.has_permission('operations.work_plans.manage') then
    coalesce(jsonb_agg(jsonb_build_object(
      'id', version.id, 'work_plan_id', plan.id, 'code', plan.code, 'name', version.name,
      'version_number', version.version_number, 'state', version.state,
      'revision', version.revision, 'step_count', step_counts.count,
      'steps', coalesce((select jsonb_agg(jsonb_build_object(
        'key', step.step_key, 'title', step.title,
        'materialization_policy', step.materialization_policy,
        'requires_verification', coalesce((step.task_template->>'requires_verification')::boolean, false),
        'optional', coalesce((step.task_template->>'optional')::boolean, false),
        'instructions', coalesce(step.task_template->>'instructions', '')
      ) order by step.sort_order) from public.work_plan_steps step
      where step.work_plan_version_id = version.id), '[]'::jsonb)
      , 'dependencies', coalesce((select jsonb_agg(jsonb_build_object(
        'predecessor_key', predecessor.step_key, 'successor_key', successor.step_key
      ) order by predecessor.step_key, successor.step_key)
      from public.work_plan_step_dependencies dependency
      join public.work_plan_steps predecessor on predecessor.id = dependency.predecessor_step_id
      join public.work_plan_steps successor on successor.id = dependency.successor_step_id
      where dependency.work_plan_version_id = version.id), '[]'::jsonb)
    ) order by lower(version.name), version.version_number desc), '[]'::jsonb)
    else '[]'::jsonb end
  from public.work_plans plan
  join public.work_plan_versions version on version.work_plan_id = plan.id
  left join lateral (
    select count(*)::integer as count from public.work_plan_steps step
    where step.work_plan_version_id = version.id
  ) step_counts on true
  where plan.organization_id = public.current_org() and plan.facility_id = public.current_facility()
$$;

create function public.save_work_plan_draft(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare version_row public.work_plan_versions%rowtype;
declare edge record;
begin
  if not public.has_permission('settings.manage') or not public.has_permission('operations.work_plans.manage') then
    raise exception 'Work Plan management permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or not payload ?& array['version_id','revision','name','steps','dependencies']
    or payload - array['version_id','revision','name','steps','dependencies'] <> '{}'::jsonb
    or jsonb_typeof(payload->'steps') is distinct from 'array' or jsonb_typeof(payload->'dependencies') is distinct from 'array'
    or jsonb_typeof(payload->'revision') is distinct from 'number'
    or coalesce(payload->>'version_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'revision','') !~ '^[1-9][0-9]*$' or length(trim(coalesce(payload->>'name',''))) not between 2 and 120
    or jsonb_array_length(payload->'steps') = 0 then raise exception 'Enter a valid Work Plan definition'; end if;
  perform public.validate_work_plan_definition(payload);
  select * into version_row from public.work_plan_versions where id=(payload->>'version_id')::uuid
    and organization_id=public.current_org() and facility_id=public.current_facility() for update;
  if version_row.id is null then raise exception 'Work Plan version unavailable'; end if;
  if version_row.revision <> (payload->>'revision')::integer then raise exception 'Work Plan version changed; reload and try again'; end if;
  if version_row.state <> 'draft' then raise exception 'Return this Work Plan version to draft before editing'; end if;
  if jsonb_array_length(payload->'steps') > 100
    or jsonb_array_length(payload->'dependencies') > 500 then
    raise exception 'Work Plans allow at most 100 steps and 500 dependencies';
  end if;
  delete from public.work_plan_step_dependencies where work_plan_version_id=version_row.id;
  delete from public.work_plan_steps where work_plan_version_id=version_row.id;
  insert into public.work_plan_steps(work_plan_version_id,step_key,title,materialization_policy,task_template,sort_order)
  select version_row.id, trim(source.value->>'key'), trim(source.value->>'title'),
    source.value->>'materialization_policy', coalesce(source.value->'task_template', '{}'::jsonb),
    (source.position - 1)::integer
  from jsonb_array_elements(payload->'steps') with ordinality as source(value, position)
  ;
  for edge in select * from jsonb_to_recordset(payload->'dependencies') as row_value(predecessor_key text,successor_key text) loop
    insert into public.work_plan_step_dependencies(work_plan_version_id,predecessor_step_id,successor_step_id)
    select version_row.id, predecessor.id, successor.id from public.work_plan_steps predecessor join public.work_plan_steps successor
      on successor.work_plan_version_id=predecessor.work_plan_version_id where predecessor.work_plan_version_id=version_row.id
      and predecessor.step_key=edge.predecessor_key and successor.step_key=edge.successor_key;
    if not found then raise exception 'Dependencies must reference Work Plan steps'; end if;
  end loop;
  if exists (
    with recursive reach(origin_id,current_id) as (
      select predecessor_step_id,successor_step_id
      from public.work_plan_step_dependencies where work_plan_version_id=version_row.id
      union
      select reach.origin_id,dependency.successor_step_id
      from reach join public.work_plan_step_dependencies dependency
        on dependency.work_plan_version_id=version_row.id and dependency.predecessor_step_id=reach.current_id
    ) select 1 from reach where current_id=origin_id
  ) then raise exception 'Work Plan dependencies cannot contain a cycle'; end if;
  update public.work_plan_versions set name=trim(payload->>'name'), revision=revision+1 where id=version_row.id;
  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data)
  values(version_row.organization_id,auth.uid(),'work_plan_versions',version_row.id,'WORK_PLAN_DRAFT_SAVED',
    jsonb_build_object('revision',version_row.revision),jsonb_build_object('revision',version_row.revision+1));
  return version_row.id;
end $$;

-- Durable operation receipts remain private and survive release of the created draft.
create table public.work_plan_clone_requests (
  organization_id uuid not null,
  facility_id uuid not null,
  request_id uuid not null,
  work_plan_id uuid not null,
  version_id uuid not null,
  requested_by uuid not null references auth.users(id),
  primary key (organization_id, facility_id, request_id),
  foreign key (organization_id, facility_id, work_plan_id)
    references public.work_plans(organization_id, facility_id, id),
  foreign key (organization_id, facility_id, version_id)
    references public.work_plan_versions(organization_id, facility_id, id)
);
alter table public.work_plan_clone_requests enable row level security;
revoke all on public.work_plan_clone_requests from public, anon, authenticated;

create function public.create_work_plan_draft_version(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare source_version public.work_plan_versions%rowtype;
declare new_version_id uuid;
declare plan_row public.work_plans%rowtype;
declare next_version_number integer;
declare receipt public.work_plan_clone_requests%rowtype;
begin
  if not public.has_permission('settings.manage') or not public.has_permission('operations.work_plans.manage') then raise exception 'Work Plan management permission required'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload - array['work_plan_id','request_id'] <> '{}'::jsonb
    or coalesce(payload->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'work_plan_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Choose a valid Work Plan'; end if;
  -- Serialize draft creation per plan, including retries after a lost response.
  select * into plan_row from public.work_plans
    where id = (payload->>'work_plan_id')::uuid
      and organization_id = public.current_org() and facility_id = public.current_facility()
    for update;
  if plan_row.id is null then raise exception 'Work Plan unavailable'; end if;
  select * into receipt from public.work_plan_clone_requests
    where organization_id = public.current_org() and facility_id = public.current_facility()
      and request_id = (payload->>'request_id')::uuid;
  if receipt.request_id is not null then
    if receipt.work_plan_id <> plan_row.id or receipt.requested_by <> auth.uid() then
      raise exception 'Work Plan request does not match the original operation';
    end if;
    return receipt.version_id;
  end if;
  select id into new_version_id from public.work_plan_versions
    where work_plan_id = plan_row.id and state in ('draft', 'review')
    order by version_number desc limit 1;
  if new_version_id is not null then
    insert into public.work_plan_clone_requests values (
      public.current_org(), public.current_facility(), (payload->>'request_id')::uuid,
      plan_row.id, new_version_id, auth.uid());
    return new_version_id;
  end if;
  select version.* into source_version from public.work_plan_versions version
  where version.work_plan_id=(payload->>'work_plan_id')::uuid and version.organization_id=public.current_org()
    and version.facility_id=public.current_facility() and version.state='released'
  order by version.version_number desc limit 1 for update;
  if source_version.id is null then raise exception 'Release a Work Plan version before creating a new draft'; end if;
  select max(version_number) + 1 into next_version_number
    from public.work_plan_versions where work_plan_id = plan_row.id;
  insert into public.work_plan_versions(organization_id,facility_id,work_plan_id,version_number,name)
  values(source_version.organization_id,source_version.facility_id,source_version.work_plan_id,next_version_number,source_version.name)
  returning id into new_version_id;
  insert into public.work_plan_steps(organization_id,facility_id,work_plan_version_id,step_key,title,materialization_policy,task_template,sort_order)
  select organization_id,facility_id,new_version_id,step_key,title,materialization_policy,task_template,sort_order from public.work_plan_steps where work_plan_version_id=source_version.id;
  insert into public.work_plan_step_dependencies(organization_id,facility_id,work_plan_version_id,predecessor_step_id,successor_step_id)
  select source_version.organization_id,source_version.facility_id,new_version_id,new_predecessor.id,new_successor.id
  from public.work_plan_step_dependencies dependency
  join public.work_plan_steps old_predecessor on old_predecessor.id=dependency.predecessor_step_id
  join public.work_plan_steps old_successor on old_successor.id=dependency.successor_step_id
  join public.work_plan_steps new_predecessor on new_predecessor.work_plan_version_id=new_version_id and new_predecessor.step_key=old_predecessor.step_key
  join public.work_plan_steps new_successor on new_successor.work_plan_version_id=new_version_id and new_successor.step_key=old_successor.step_key
  where dependency.work_plan_version_id=source_version.id;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, after_data
  ) values (
    source_version.organization_id, auth.uid(), 'work_plan_versions', new_version_id,
    'WORK_PLAN_VERSION_CREATED', jsonb_build_object(
      'work_plan_id', plan_row.id, 'version_number', next_version_number,
      'state', 'draft', 'source_version_id', source_version.id
    )
  );
  insert into public.work_plan_clone_requests values (
    public.current_org(), public.current_facility(), (payload->>'request_id')::uuid,
    plan_row.id, new_version_id, auth.uid());
  return new_version_id;
end $$;

create function public.transition_work_plan_version(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare version_row public.work_plan_versions%rowtype;
declare target_state text;
begin
  if not public.has_permission('settings.manage') or not public.has_permission('operations.work_plans.manage') then
    raise exception 'Work Plan management permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or payload - array['version_id','revision','state'] <> '{}'::jsonb
    or coalesce(payload->>'version_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'revision','') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(payload->'revision') is distinct from 'number'
    or coalesce(payload->>'state','') not in ('draft','review','retired') then
    raise exception 'Choose a current Work Plan version';
  end if;
  select * into version_row from public.work_plan_versions
    where id = (payload->>'version_id')::uuid and organization_id = public.current_org()
      and facility_id = public.current_facility() for update;
  if version_row.id is null then raise exception 'Work Plan version unavailable'; end if;
  if version_row.revision <> (payload->>'revision')::integer then
    raise exception 'Work Plan version changed; reload and try again';
  end if;
  target_state := payload->>'state';
  if not ((version_row.state = 'draft' and target_state = 'review')
    or (version_row.state = 'review' and target_state = 'draft')
    or (version_row.state = 'released' and target_state = 'retired')) then
    raise exception 'Invalid Work Plan lifecycle transition';
  end if;
  update public.work_plan_versions set state = target_state, revision = revision + 1
    where id = version_row.id;
  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data)
    values(version_row.organization_id,auth.uid(),'work_plan_versions',version_row.id,'WORK_PLAN_LIFECYCLE_CHANGED',
      jsonb_build_object('state',version_row.state,'revision',version_row.revision),
      jsonb_build_object('state',target_state,'revision',version_row.revision+1));
  return version_row.id;
end $$;
revoke all on function public.transition_work_plan_version(jsonb) from public, anon, authenticated;
grant execute on function public.transition_work_plan_version(jsonb) to authenticated;

revoke all on function public.guard_work_plan_version_mutation(), public.guard_work_plan_content_mutation(), public.release_work_plan_version(jsonb), public.create_work_plan(jsonb), public.list_work_plan_versions(), public.save_work_plan_draft(jsonb), public.create_work_plan_draft_version(jsonb)
  from public, anon, authenticated;
grant execute on function public.release_work_plan_version(jsonb), public.create_work_plan(jsonb), public.list_work_plan_versions(), public.save_work_plan_draft(jsonb), public.create_work_plan_draft_version(jsonb) to authenticated;

commit;
