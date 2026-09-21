-- Organization-scoped identities, login history, and audited access deactivation.
alter table public.profiles
  add column first_name text,
  add column last_name text,
  add column work_email text,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references auth.users(id),
  add column deactivation_reason text;

update public.profiles
set first_name = left(
      coalesce(nullif(split_part(trim(display_name), ' ', 1), ''), 'Unknown'),
      100
    ),
    last_name = case
      when strpos(trim(display_name), ' ') = 0 then '-'
      else left(
        coalesce(
          nullif(ltrim(substr(trim(display_name), strpos(trim(display_name), ' ') + 1)), ''),
          '-'
        ),
        100
      )
    end;

alter table public.profiles
  alter column first_name set not null,
  alter column last_name set not null,
  add constraint profiles_first_name_check
    check (length(trim(first_name)) between 1 and 100),
  add constraint profiles_last_name_check
    check (length(trim(last_name)) between 1 and 100),
  add constraint profiles_work_email_check
    check (
      work_email is null
      or (
        work_email = lower(trim(work_email))
        and length(work_email) between 3 and 320
        and work_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  add constraint profiles_deactivation_state_check
    check (
      (active and deactivated_at is null and deactivated_by is null and deactivation_reason is null)
      or
      (not active and (
        (deactivated_at is null and deactivated_by is null and deactivation_reason is null)
        or
        (deactivated_at is not null and deactivated_by is not null
          and length(trim(deactivation_reason)) between 3 and 500)
      ))
    );

create function public.normalize_profile_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.first_name := coalesce(
    nullif(trim(new.first_name), ''),
    left(coalesce(nullif(split_part(trim(new.display_name), ' ', 1), ''), 'Unknown'), 100)
  );
  new.last_name := coalesce(
    nullif(trim(new.last_name), ''),
    case
      when strpos(trim(new.display_name), ' ') = 0 then '-'
      else left(
        coalesce(
          nullif(ltrim(substr(trim(new.display_name), strpos(trim(new.display_name), ' ') + 1)), ''),
          '-'
        ),
        100
      )
    end
  );
  new.work_email := nullif(lower(trim(new.work_email)), '');
  return new;
end
$$;

create trigger normalize_profile_identity
before insert or update of first_name, last_name, display_name, work_email
on public.profiles
for each row execute function public.normalize_profile_identity();

revoke all on function public.normalize_profile_identity() from public, anon, authenticated;

create unique index profiles_org_work_email_unique
  on public.profiles(organization_id, lower(work_email))
  where work_email is not null;
create index profiles_org_name_sort
  on public.profiles(organization_id, last_name, first_name, id);
create index profiles_org_name_search
  on public.profiles(
    organization_id,
    (lower(first_name || ' ' || last_name)) text_pattern_ops
  );

create table public.login_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org() references public.organizations(id),
  user_id uuid not null default auth.uid() references auth.users(id),
  event_type text not null check (event_type in ('signed_in', 'signed_out')),
  ip_address inet,
  user_agent text check (user_agent is null or length(user_agent) <= 1000),
  occurred_at timestamptz not null default now(),
  unique (organization_id, id)
);

alter table public.login_events enable row level security;

create policy login_event_read
  on public.login_events
  for select
  to authenticated
  using (
    organization_id = public.current_org()
    and public.has_permission('audit.read')
  );

create policy login_event_add
  on public.login_events
  for insert
  to authenticated
  with check (
    organization_id = public.current_org()
    and user_id = (select auth.uid())
  );

revoke all on table public.login_events from public, anon, authenticated;
grant select on table public.login_events to authenticated;
grant insert(event_type, ip_address, user_agent) on table public.login_events to authenticated;

create index login_events_org_occurred_at
  on public.login_events(organization_id, occurred_at desc, id);
create index login_events_user_occurred_at
  on public.login_events(user_id, occurred_at desc);

-- An inactive profile must not retain the legacy self-read path.
drop policy profile_read on public.profiles;
create policy profile_read
  on public.profiles
  for select
  to authenticated
  using (
    public.current_org() is not null
    and (
      id = (select auth.uid())
      or (
        organization_id = public.current_org()
        and (
          public.has_permission('access.manage')
          or public.has_permission('workforce.read')
          or public.has_permission('settings.manage')
        )
      )
    )
  );

create function public.deactivate_user_access(target_user_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid;
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  remaining_access_managers integer;
  action_at timestamptz := now();
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

  -- Lock first, then authoritatively re-read authorization so a concurrent
  -- deactivation cannot pass a stale active/permission check.
  perform 1
  from public.organizations
  where id = actor_organization_id
  for update;

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
  if target_user_id = actor_profile.id then
    raise exception 'You cannot deactivate your own access';
  end if;
  if length(trim(coalesce(reason, ''))) not between 3 and 500 then
    raise exception 'A deactivation reason between 3 and 500 characters is required';
  end if;

  select * into target_profile
  from public.profiles
  where id = target_user_id
  for update;

  if target_profile.id is null
    or target_profile.organization_id <> actor_profile.organization_id then
    raise exception 'User must belong to your organization';
  end if;
  if not target_profile.active then
    raise exception 'User access is already inactive';
  end if;

  if exists (
    select 1
    from public.access_profile_permissions app
    where app.access_profile_id = target_profile.access_profile_id
      and app.permission_code = 'access.manage'
  ) then
    select count(*) into remaining_access_managers
    from public.profiles p
    join public.access_profile_permissions app
      on app.organization_id = p.organization_id
      and app.access_profile_id = p.access_profile_id
      and app.permission_code = 'access.manage'
    where p.organization_id = actor_profile.organization_id
      and p.active
      and p.id <> target_profile.id;

    if remaining_access_managers = 0 then
      raise exception 'The last active access manager cannot be deactivated';
    end if;
  end if;

  update public.profiles
  set active = false,
      deactivated_at = action_at,
      deactivated_by = actor_profile.id,
      deactivation_reason = trim(reason)
  where id = target_profile.id;

  insert into public.audit_events(
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    event_type,
    before_data,
    after_data
  ) values (
    actor_profile.organization_id,
    actor_profile.id,
    'profiles',
    target_profile.id,
    'USER_ACCESS_DEACTIVATED',
    jsonb_build_object(
      'active', target_profile.active,
      'access_profile_id', target_profile.access_profile_id
    ),
    jsonb_build_object(
      'active', false,
      'deactivated_at', action_at,
      'deactivated_by', actor_profile.id,
      'reason', trim(reason)
    )
  );
end
$$;

revoke all on function public.deactivate_user_access(uuid, text) from public, anon;
grant execute on function public.deactivate_user_access(uuid, text) to authenticated;

-- Audit readers resolve only identities that appear in organization login history.
create function public.login_event_user_names()
returns table(user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := public.current_org();
begin
  if actor_organization_id is null or not public.has_permission('audit.read') then
    raise exception 'Audit permission required';
  end if;

  return query
  select distinct
    p.id,
    case
      when nullif(trim(p.display_name), '') is not null then p.display_name
      else p.first_name || case when p.last_name = '-' then '' else ' ' || p.last_name end
    end
  from public.profiles p
  where p.organization_id = actor_organization_id
    and exists (
      select 1
      from public.login_events event
      where event.organization_id = actor_organization_id
        and event.user_id = p.id
    )
  order by 2, 1;
end
$$;

revoke all on function public.login_event_user_names() from public, anon;
grant execute on function public.login_event_user_names() to authenticated;
