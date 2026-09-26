-- Restore a deactivated profile without replacing its Supabase Auth identity
-- or historical records.
create function public.reactivate_user_access(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid;
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select organization_id into actor_organization_id
  from public.profiles
  where id = (select auth.uid());

  if actor_organization_id is null then
    raise exception 'Access management permission required';
  end if;

  perform 1 from public.organizations where id = actor_organization_id for update;

  select * into actor_profile
  from public.profiles
  where id = (select auth.uid())
    and organization_id = actor_organization_id
    and active
  for update;

  if actor_profile.id is null then
    raise exception 'Access management permission required';
  end if;
  perform 1
  from public.access_profile_permissions app
  where app.organization_id = actor_profile.organization_id
    and app.access_profile_id = actor_profile.access_profile_id
    and app.permission_code = 'access.manage'
  for share;
  if not found then
    raise exception 'Access management permission required';
  end if;

  select * into target_profile from public.profiles where id = target_user_id for update;
  if target_profile.id is null
    or target_profile.organization_id <> actor_profile.organization_id then
    raise exception 'User must belong to your organization';
  end if;
  if target_profile.active then
    raise exception 'User access is already active';
  end if;

  update public.profiles
  set active = true,
      deactivated_at = null,
      deactivated_by = null,
      deactivation_reason = null
  where id = target_profile.id;

  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, before_data, after_data
  ) values (
    actor_profile.organization_id,
    actor_profile.id,
    'profiles',
    target_profile.id,
    'USER_ACCESS_REACTIVATED',
    jsonb_build_object('active', false, 'deactivated_at', target_profile.deactivated_at),
    jsonb_build_object('active', true)
  );
end
$$;

revoke all on function public.reactivate_user_access(uuid) from public, anon;
grant execute on function public.reactivate_user_access(uuid) to authenticated;
