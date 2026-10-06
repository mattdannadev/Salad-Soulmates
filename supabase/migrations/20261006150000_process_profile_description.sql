begin;

alter table public.process_profiles
  add column description text not null default ''
  check (length(description) <= 1000);

create or replace function public.save_process_profile(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid;
declare requested_recipe_id uuid;
declare requested_work_type_id uuid;
declare requested_revision integer;
declare requested_description text;
declare requested_active boolean;
declare prior public.process_profiles%rowtype;
begin
  if not public.has_permission('products.read')
    or not public.has_permission('products.write') then
    raise exception 'Product and recipe management permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array[
      'id', 'expected_revision', 'recipe_id', 'work_type_id', 'description', 'active'
    ]
    or payload - array[
      'id', 'expected_revision', 'recipe_id', 'work_type_id', 'description', 'active'
    ] <> '{}'::jsonb
    or jsonb_typeof(payload->'id') is distinct from 'string'
    or jsonb_typeof(payload->'recipe_id') is distinct from 'string'
    or jsonb_typeof(payload->'work_type_id') is distinct from 'string'
    or jsonb_typeof(payload->'description') is distinct from 'string'
    or jsonb_typeof(payload->'active') is distinct from 'boolean'
    or coalesce(payload->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'recipe_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload->>'work_type_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(payload->'expected_revision') is distinct from 'number'
    or coalesce(payload->>'expected_revision', '') !~ '^(0|[1-9][0-9]*)$'
    or length(payload->>'description') > 1000 then
    raise exception 'Enter a valid Process Profile';
  end if;
  requested_id := (payload->>'id')::uuid;
  requested_recipe_id := (payload->>'recipe_id')::uuid;
  requested_work_type_id := (payload->>'work_type_id')::uuid;
  requested_revision := (payload->>'expected_revision')::integer;
  requested_description := payload->>'description';
  requested_active := (payload->>'active')::boolean;

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
      id, recipe_id, work_type_id, description, active, created_by, updated_by
    ) values (
      requested_id, requested_recipe_id, requested_work_type_id,
      requested_description, requested_active, auth.uid(), auth.uid()
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
      description = requested_description,
      active = requested_active,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
    where id = prior.id;
  end if;
  return requested_id;
end $$;

create or replace function public.list_recipe_process_configuration() returns jsonb
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
          'description', profile.description,
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

revoke all on function public.save_process_profile(jsonb),
  public.list_recipe_process_configuration()
  from public, anon;
grant execute on function public.save_process_profile(jsonb),
  public.list_recipe_process_configuration()
  to authenticated;

notify pgrst, 'reload schema';

commit;
