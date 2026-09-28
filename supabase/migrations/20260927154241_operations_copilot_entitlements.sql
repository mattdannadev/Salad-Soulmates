-- Operations Copilot is a paid module. Access defaults off for every access
-- profile, while a nullable user override supports inherit/enable/disable.
alter table public.organizations
  add column operations_copilot_plan_enabled boolean not null default false;

alter table public.access_profiles
  add column operations_copilot_enabled boolean not null default false;

alter table public.profiles
  add column operations_copilot_override boolean;

-- This check accepts no client-owned identifiers. The signed-in database actor,
-- active organization, and assigned access profile determine the result.
create function public.operations_copilot_enabled()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select coalesce(p.operations_copilot_override, ap.operations_copilot_enabled)
    from public.profiles p
    join public.organizations o
      on o.id = p.organization_id
    join public.access_profiles ap
      on ap.organization_id = p.organization_id
      and ap.id = p.access_profile_id
    where p.id = (select auth.uid())
      and p.active
      and o.status = 'active'
      and o.operations_copilot_plan_enabled
      and ap.active
      and p.organization_id = public.current_org()
  ), false)
$$;

create function public.set_operations_copilot_profile_default(
  target_access_profile_id uuid,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.access_profiles%rowtype;
begin
  if (select auth.uid()) is null or enabled is null then
    raise exception 'Invalid Operations Copilot profile setting';
  end if;

  select p.* into actor_profile
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = (select auth.uid()) and p.active and o.status = 'active';
  if actor_profile.id is null then
    raise exception 'Settings permission required';
  end if;

  perform 1 from public.organizations
  where id = actor_profile.organization_id and status = 'active'
  for update;
  if not found then raise exception 'Settings permission required'; end if;

  select p.* into actor_profile
  from public.profiles p
  where p.id = (select auth.uid())
    and p.organization_id = actor_profile.organization_id
    and p.active
  for update;
  perform 1 from public.access_profile_permissions app
  where app.organization_id = actor_profile.organization_id
    and app.access_profile_id = actor_profile.access_profile_id
    and app.permission_code = 'settings.manage'
  for share;
  if not found then raise exception 'Settings permission required'; end if;

  select * into target_profile
  from public.access_profiles
  where id = target_access_profile_id
  for update;
  if target_profile.id is null
    or target_profile.organization_id <> actor_profile.organization_id then
    raise exception 'Access profile must belong to your organization';
  end if;
  if target_profile.operations_copilot_enabled = enabled then return; end if;

  update public.access_profiles
  set operations_copilot_enabled = enabled
  where id = target_profile.id;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id,
    event_type, before_data, after_data
  ) values (
    actor_profile.organization_id, actor_profile.id, 'access_profiles', target_profile.id,
    'OPERATIONS_COPILOT_PROFILE_DEFAULT_CHANGED',
    jsonb_build_object('enabled', target_profile.operations_copilot_enabled),
    jsonb_build_object('enabled', enabled)
  );
end
$$;

create function public.set_operations_copilot_user_override(
  target_user_id uuid,
  enabled_override boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.* into actor_profile
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = (select auth.uid()) and p.active and o.status = 'active';
  if actor_profile.id is null then
    raise exception 'Access management permission required';
  end if;

  perform 1 from public.organizations
  where id = actor_profile.organization_id and status = 'active'
  for update;
  if not found then raise exception 'Access management permission required'; end if;

  select p.* into actor_profile
  from public.profiles p
  where p.id = (select auth.uid())
    and p.organization_id = actor_profile.organization_id
    and p.active
  for update;
  perform 1 from public.access_profile_permissions app
  where app.organization_id = actor_profile.organization_id
    and app.access_profile_id = actor_profile.access_profile_id
    and app.permission_code = 'access.manage'
  for share;
  if not found then raise exception 'Access management permission required'; end if;

  select * into target_profile
  from public.profiles
  where id = target_user_id
  for update;
  if target_profile.id is null
    or target_profile.organization_id <> actor_profile.organization_id then
    raise exception 'User must belong to your organization';
  end if;
  if target_profile.operations_copilot_override is not distinct from enabled_override then
    return;
  end if;

  update public.profiles
  set operations_copilot_override = enabled_override
  where id = target_profile.id;
  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id,
    event_type, before_data, after_data
  ) values (
    actor_profile.organization_id, actor_profile.id, 'profiles', target_profile.id,
    'OPERATIONS_COPILOT_USER_OVERRIDE_CHANGED',
    jsonb_build_object('enabled_override', target_profile.operations_copilot_override),
    jsonb_build_object('enabled_override', enabled_override)
  );
end
$$;

revoke all on function public.operations_copilot_enabled() from public, anon;
revoke all on function public.set_operations_copilot_profile_default(uuid, boolean)
  from public, anon;
revoke all on function public.set_operations_copilot_user_override(uuid, boolean)
  from public, anon;
grant execute on function public.operations_copilot_enabled() to authenticated;
grant execute on function public.set_operations_copilot_profile_default(uuid, boolean)
  to authenticated;
grant execute on function public.set_operations_copilot_user_override(uuid, boolean)
  to authenticated;

-- Existing custom-profile maintenance remains available, but the paid-module
-- default can only be changed through the locked, audited RPC above.
revoke insert on public.access_profiles from authenticated;
grant insert (id, organization_id, name, description, base_role, is_system, active)
  on public.access_profiles to authenticated;
revoke update on public.access_profiles from authenticated;
grant update (name, description, base_role, active) on public.access_profiles to authenticated;
