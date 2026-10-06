begin;

-- Editable current-state master data used only when future work is generated.
-- Generated work orders snapshot their own operational facts and are never
-- updated or deleted by these configuration tables or RPCs.
create table public.work_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,79}$'),
  name text not null check (length(trim(name)) between 2 and 120),
  description text not null default '' check (length(description) <= 1000),
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, code),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id)
);

create table public.work_order_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  work_type_id uuid not null,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,79}$'),
  name text not null check (length(trim(name)) between 2 and 120),
  queue_kind text not null check (queue_kind in (
    'pre_op', 'post_op', 'ingredient_prep', 'mixing', 'shipment_loading',
    'receiving', 'packaging', 'maintenance', 'cleaning', 'other'
  )),
  sequence integer not null check (sequence > 0),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, work_type_id, code),
  foreign key (organization_id, facility_id, work_type_id)
    references public.work_types(organization_id, facility_id, id) on delete restrict
);
create unique index work_order_types_active_sequence
  on public.work_order_types(organization_id, facility_id, work_type_id, sequence)
  where active;

create table public.process_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  recipe_id uuid not null,
  work_type_id uuid not null,
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, recipe_id),
  foreign key (organization_id, facility_id)
    references public.facilities(organization_id, id),
  foreign key (organization_id, recipe_id)
    references public.recipes(organization_id, id) on delete restrict,
  foreign key (organization_id, facility_id, work_type_id)
    references public.work_types(organization_id, facility_id, id) on delete restrict
);

create function public.guard_process_profile_assignment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.active and not exists (
    select 1 from public.work_types work_type
    where work_type.organization_id = new.organization_id
      and work_type.facility_id = new.facility_id
      and work_type.id = new.work_type_id
      and work_type.active
  ) then
    raise exception 'An active Process Profile requires an active Work Type';
  end if;
  return new;
end $$;

create function public.guard_active_work_type_assignment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.active and not new.active and exists (
    select 1 from public.process_profiles profile
    where profile.organization_id = old.organization_id
      and profile.facility_id = old.facility_id
      and profile.work_type_id = old.id
      and profile.active
  ) then
    raise exception 'Deactivate assigned Process Profiles before this Work Type';
  end if;
  return new;
end $$;

create trigger process_profile_assignment_guard
  before insert or update of active, work_type_id on public.process_profiles
  for each row execute function public.guard_process_profile_assignment();
create trigger active_work_type_assignment_guard
  before update of active on public.work_types
  for each row execute function public.guard_active_work_type_assignment();

create trigger work_types_audit after insert or update on public.work_types
  for each row execute function public.audit_change();
create trigger work_order_types_audit after insert or update on public.work_order_types
  for each row execute function public.audit_change();
create trigger process_profiles_audit after insert or update on public.process_profiles
  for each row execute function public.audit_change();

alter table public.work_types enable row level security;
alter table public.work_order_types enable row level security;
alter table public.process_profiles enable row level security;
revoke all on public.work_types, public.work_order_types, public.process_profiles
  from public, anon, authenticated;

create function public.validate_work_type_definition(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare work_order_type jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array[
      'id', 'expected_revision', 'code', 'name', 'description', 'active', 'work_order_types'
    ]
    or payload - array[
      'id', 'expected_revision', 'code', 'name', 'description', 'active', 'work_order_types'
    ] <> '{}'::jsonb
    or jsonb_typeof(payload->'id') is distinct from 'string'
    or coalesce(payload->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(payload->'expected_revision') is distinct from 'number'
    or coalesce(payload->>'expected_revision', '') !~ '^(0|[1-9][0-9]*)$'
    or jsonb_typeof(payload->'code') is distinct from 'string'
    or coalesce(payload->>'code', '') !~ '^[a-z][a-z0-9_]{1,79}$'
    or jsonb_typeof(payload->'name') is distinct from 'string'
    or length(trim(coalesce(payload->>'name', ''))) not between 2 and 120
    or jsonb_typeof(payload->'description') is distinct from 'string'
    or length(coalesce(payload->>'description', '')) > 1000
    or jsonb_typeof(payload->'active') is distinct from 'boolean'
    or jsonb_typeof(payload->'work_order_types') is distinct from 'array'
    or jsonb_array_length(payload->'work_order_types') not between 1 and 20 then
    raise exception 'Enter a valid Work Type definition';
  end if;

  for work_order_type in select value from jsonb_array_elements(payload->'work_order_types') loop
    if jsonb_typeof(work_order_type) is distinct from 'object'
      or not work_order_type ?& array['code', 'name', 'queue_kind']
      or work_order_type - array['code', 'name', 'queue_kind'] <> '{}'::jsonb
      or jsonb_typeof(work_order_type->'code') is distinct from 'string'
      or coalesce(work_order_type->>'code', '') !~ '^[a-z][a-z0-9_]{1,79}$'
      or jsonb_typeof(work_order_type->'name') is distinct from 'string'
      or length(trim(coalesce(work_order_type->>'name', ''))) not between 2 and 120
      or jsonb_typeof(work_order_type->'queue_kind') is distinct from 'string'
      or coalesce(work_order_type->>'queue_kind', '') not in (
        'pre_op', 'post_op', 'ingredient_prep', 'mixing', 'shipment_loading',
        'receiving', 'packaging', 'maintenance', 'cleaning', 'other'
      ) then
      raise exception 'Enter valid ordered Work Order Types';
    end if;
  end loop;

  if (
    select count(*) <> count(distinct value->>'code')
    from jsonb_array_elements(payload->'work_order_types')
  ) then
    raise exception 'Work Order Type codes must be unique within a Work Type';
  end if;
end $$;
revoke all on function public.validate_work_type_definition(jsonb)
  from public, anon, authenticated;

create function public.save_work_type(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid;
declare requested_revision integer;
declare prior public.work_types%rowtype;
begin
  if not public.has_permission('products.read')
    or not public.has_permission('products.write') then
    raise exception 'Product and recipe management permission required';
  end if;
  perform public.validate_work_type_definition(payload);
  requested_id := (payload->>'id')::uuid;
  requested_revision := (payload->>'expected_revision')::integer;

  if requested_revision = 0 then
    insert into public.work_types(
      id, code, name, description, active, created_by, updated_by
    ) values (
      requested_id, payload->>'code', trim(payload->>'name'), payload->>'description',
      (payload->>'active')::boolean, auth.uid(), auth.uid()
    );
  else
    select * into prior from public.work_types
    where id = requested_id
      and organization_id = public.current_org()
      and facility_id = public.current_facility()
    for update;
    if prior.id is null then raise exception 'Work Type unavailable'; end if;
    if prior.revision <> requested_revision then
      raise exception 'Work Type changed; reload and try again';
    end if;
    update public.work_types set
      code = payload->>'code',
      name = trim(payload->>'name'),
      description = payload->>'description',
      active = (payload->>'active')::boolean,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
    where id = prior.id;
  end if;

  update public.work_order_types set
    active = false,
    updated_by = auth.uid(),
    updated_at = now()
  where organization_id = public.current_org()
    and facility_id = public.current_facility()
    and work_type_id = requested_id
    and active;

  insert into public.work_order_types(
    organization_id, facility_id, work_type_id, code, name, queue_kind,
    sequence, active, created_by, updated_by
  ) select public.current_org(), public.current_facility(), requested_id,
    item.value->>'code', trim(item.value->>'name'), item.value->>'queue_kind',
    item.position::integer, true, auth.uid(), auth.uid()
  from jsonb_array_elements(payload->'work_order_types')
    with ordinality as item(value, position)
  on conflict (organization_id, facility_id, work_type_id, code) do update set
    name = excluded.name,
    queue_kind = excluded.queue_kind,
    sequence = excluded.sequence,
    active = true,
    updated_by = excluded.updated_by,
    updated_at = now();

  return requested_id;
end $$;

create function public.save_process_profile(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid;
declare requested_recipe_id uuid;
declare requested_work_type_id uuid;
declare requested_revision integer;
declare prior public.process_profiles%rowtype;
begin
  if not public.has_permission('products.read')
    or not public.has_permission('products.write') then
    raise exception 'Product and recipe management permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['id', 'expected_revision', 'recipe_id', 'work_type_id', 'active']
    or payload - array['id', 'expected_revision', 'recipe_id', 'work_type_id', 'active'] <> '{}'::jsonb
    or jsonb_typeof(payload->'id') is distinct from 'string'
    or jsonb_typeof(payload->'recipe_id') is distinct from 'string'
    or jsonb_typeof(payload->'work_type_id') is distinct from 'string'
    or coalesce(payload->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'recipe_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'work_type_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(payload->'expected_revision') is distinct from 'number'
    or coalesce(payload->>'expected_revision', '') !~ '^(0|[1-9][0-9]*)$'
    or jsonb_typeof(payload->'active') is distinct from 'boolean' then
    raise exception 'Enter a valid Process Profile';
  end if;
  requested_id := (payload->>'id')::uuid;
  requested_recipe_id := (payload->>'recipe_id')::uuid;
  requested_work_type_id := (payload->>'work_type_id')::uuid;
  requested_revision := (payload->>'expected_revision')::integer;

  if not exists (
    select 1 from public.recipes recipe
    where recipe.organization_id = public.current_org()
      and recipe.id = requested_recipe_id
  ) then raise exception 'Recipe unavailable'; end if;
  if not exists (
    select 1 from public.work_types work_type
    where work_type.organization_id = public.current_org()
      and work_type.facility_id = public.current_facility()
      and work_type.id = requested_work_type_id
  ) then raise exception 'Work Type unavailable'; end if;

  if requested_revision = 0 then
    insert into public.process_profiles(
      id, recipe_id, work_type_id, active, created_by, updated_by
    ) values (
      requested_id, requested_recipe_id, requested_work_type_id,
      (payload->>'active')::boolean, auth.uid(), auth.uid()
    );
  else
    select * into prior from public.process_profiles
    where id = requested_id
      and organization_id = public.current_org()
      and facility_id = public.current_facility()
    for update;
    if prior.id is null then raise exception 'Process Profile unavailable'; end if;
    if prior.recipe_id <> requested_recipe_id then
      raise exception 'A Process Profile recipe cannot be changed';
    end if;
    if prior.revision <> requested_revision then
      raise exception 'Process Profile changed; reload and try again';
    end if;
    update public.process_profiles set
      work_type_id = requested_work_type_id,
      active = (payload->>'active')::boolean,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
    where id = prior.id;
  end if;
  return requested_id;
end $$;

create function public.list_recipe_process_configuration() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when public.has_permission('products.read') then jsonb_build_object(
      'work_types', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', work_type.id,
          'code', work_type.code,
          'name', work_type.name,
          'description', work_type.description,
          'active', work_type.active,
          'revision', work_type.revision,
          'work_order_types', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', work_order_type.id,
              'code', work_order_type.code,
              'name', work_order_type.name,
              'queue_kind', work_order_type.queue_kind,
              'sequence', work_order_type.sequence
            ) order by work_order_type.sequence)
            from public.work_order_types work_order_type
            where work_order_type.organization_id = work_type.organization_id
              and work_order_type.facility_id = work_type.facility_id
              and work_order_type.work_type_id = work_type.id
              and work_order_type.active
          ), '[]'::jsonb)
        ) order by lower(work_type.name), work_type.code)
        from public.work_types work_type
        where work_type.organization_id = public.current_org()
          and work_type.facility_id = public.current_facility()
      ), '[]'::jsonb),
      'process_profiles', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', profile.id,
          'recipe_id', profile.recipe_id,
          'work_type_id', profile.work_type_id,
          'active', profile.active,
          'revision', profile.revision
        ) order by profile.recipe_id)
        from public.process_profiles profile
        where profile.organization_id = public.current_org()
          and profile.facility_id = public.current_facility()
      ), '[]'::jsonb)
    )
    else jsonb_build_object('work_types', '[]'::jsonb, 'process_profiles', '[]'::jsonb)
  end
$$;

revoke all on function public.save_work_type(jsonb),
  public.save_process_profile(jsonb), public.list_recipe_process_configuration()
  from public, anon;
grant execute on function public.save_work_type(jsonb),
  public.save_process_profile(jsonb), public.list_recipe_process_configuration()
  to authenticated;
revoke execute on function public.guard_process_profile_assignment(),
  public.guard_active_work_type_assignment()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
