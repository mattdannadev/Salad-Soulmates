-- Allow access managers to safely change a user's assigned access profile.
create function public.change_user_access_profile(
  target_user_id uuid,
  assigned_access_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  assigned_profile public.access_profiles%rowtype;
  actor_organization_id uuid;
  remaining_access_managers integer;
begin
  select organization_id into actor_organization_id from public.profiles
  where id = (select auth.uid());
  if actor_organization_id is null then
    raise exception 'Access management permission required';
  end if;

  perform 1 from public.organizations where id = actor_organization_id for update;
  select * into actor_profile from public.profiles
  where id = (select auth.uid()) and organization_id = actor_organization_id and active for update;
  if actor_profile.id is null then raise exception 'Access management permission required'; end if;
  perform 1 from public.access_profile_permissions
  where organization_id = actor_profile.organization_id
    and access_profile_id = actor_profile.access_profile_id
    and permission_code = 'access.manage'
  for share;
  if not found then raise exception 'Access management permission required'; end if;
  select * into target_profile from public.profiles where id = target_user_id for update;
  if target_profile.id is null or target_profile.organization_id <> actor_profile.organization_id then
    raise exception 'User must belong to your organization';
  end if;

  select * into assigned_profile from public.access_profiles
  where id = assigned_access_profile_id
    and organization_id = actor_profile.organization_id
    and active;
  if assigned_profile.id is null then raise exception 'Invalid access profile'; end if;

  if target_profile.active
    and exists (select 1 from public.access_profile_permissions where organization_id = actor_profile.organization_id and access_profile_id = target_profile.access_profile_id and permission_code = 'access.manage')
    and not exists (select 1 from public.access_profile_permissions where organization_id = actor_profile.organization_id and access_profile_id = assigned_profile.id and permission_code = 'access.manage') then
    select count(*) into remaining_access_managers
    from public.profiles p join public.access_profile_permissions app
      on app.organization_id = p.organization_id and app.access_profile_id = p.access_profile_id and app.permission_code = 'access.manage'
    where p.organization_id = actor_profile.organization_id and p.active and p.id <> target_profile.id;
    if remaining_access_managers = 0 then
      raise exception 'The last active access manager cannot be reassigned';
    end if;
  end if;

  update public.profiles
  set access_profile_id = assigned_profile.id, role = assigned_profile.base_role
  where id = target_profile.id;
  insert into public.audit_events(organization_id, actor_user_id, entity_type, entity_id, event_type, before_data, after_data)
  values (
    actor_profile.organization_id, actor_profile.id, 'profiles', target_profile.id,
    'USER_ACCESS_PROFILE_CHANGED',
    jsonb_build_object('access_profile_id', target_profile.access_profile_id, 'role', target_profile.role),
    jsonb_build_object('access_profile_id', assigned_profile.id, 'role', assigned_profile.base_role)
  );
end
$$;

revoke all on function public.change_user_access_profile(uuid, uuid) from public, anon;
grant execute on function public.change_user_access_profile(uuid, uuid) to authenticated;

-- Serialize permission edits with user access changes and re-check authorization under the lock.
create or replace function public.save_access_profile(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  result uuid;
  permission text;
  existing public.access_profiles%rowtype;
  actor_organization_id uuid;
begin
  select organization_id into actor_organization_id from public.profiles
  where id = (select auth.uid()) and active;
  if actor_organization_id is null then raise exception 'Settings permission required'; end if;
  perform 1 from public.organizations where id = actor_organization_id for update;
  if not public.has_permission('settings.manage') then raise exception 'Settings permission required'; end if;
  result := coalesce(nullif(payload->>'id', '')::uuid, gen_random_uuid());
  select * into existing from public.access_profiles where id = result for update;
  if existing.id is not null and existing.organization_id <> actor_organization_id then
    raise exception 'Invalid access profile';
  end if;
  if existing.id is null then
    insert into public.access_profiles(id, organization_id, name, description, base_role, is_system, active)
    values (result, actor_organization_id, trim(payload->>'name'), trim(coalesce(payload->>'description', '')), payload->>'base_role', false, coalesce((payload->>'active')::boolean, true));
  elsif not existing.is_system then
    update public.access_profiles set name = trim(payload->>'name'), description = trim(coalesce(payload->>'description', '')), base_role = payload->>'base_role', active = coalesce((payload->>'active')::boolean, true) where id = result;
  end if;
  delete from public.access_profile_permissions where access_profile_id = result;
  for permission in select jsonb_array_elements_text(coalesce(payload->'permission_codes', '[]'::jsonb)) loop
    insert into public.access_profile_permissions(organization_id, access_profile_id, permission_code)
    values (actor_organization_id, result, permission);
  end loop;
  return result;
end
$$;
