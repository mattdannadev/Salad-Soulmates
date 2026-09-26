-- Preserve at least one active access manager when a profile's grants are replaced.
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

  -- A profile save replaces its complete grant set. Reject a removal that would
  -- leave active users without any profile granting access.manage.
  if existing.id is not null
    and exists (
      select 1 from public.access_profile_permissions
      where organization_id = actor_organization_id
        and access_profile_id = existing.id
        and permission_code = 'access.manage'
    )
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(payload->'permission_codes', '[]'::jsonb))
      where value = 'access.manage'
    )
    and exists (
      select 1 from public.profiles
      where organization_id = actor_organization_id
        and active
        and access_profile_id = existing.id
    )
    and not exists (
      select 1
      from public.profiles profile
      join public.access_profile_permissions profile_permission
        on profile_permission.organization_id = profile.organization_id
        and profile_permission.access_profile_id = profile.access_profile_id
        and profile_permission.permission_code = 'access.manage'
      where profile.organization_id = actor_organization_id
        and profile.active
        and profile.access_profile_id <> existing.id
    ) then
    raise exception 'The last active access manager cannot lose access management permission';
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
