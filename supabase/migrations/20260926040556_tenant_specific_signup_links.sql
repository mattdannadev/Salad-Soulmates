-- Scope public signup and access review to the organization named by the signup link.
do $$
begin
  if exists(
    select 1
    from public.organizations
    where char_length(lower(trim(slug))) not between 1 and 63
      or lower(trim(slug)) !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing organization slug is invalid after normalization';
  end if;

  if exists(
    select 1
    from public.organizations
    group by lower(trim(slug))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Organization slugs collide after normalization';
  end if;
end
$$;

update public.organizations
set slug = lower(trim(slug))
where slug is distinct from lower(trim(slug));

alter table public.organizations
  drop constraint organizations_slug_key,
  add constraint organizations_slug_canonical_check
    check (
      char_length(slug) between 1 and 63
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    );
create unique index organizations_normalized_slug_key
  on public.organizations(lower(trim(slug)));

alter table public.organizations
  add column signup_enabled boolean not null default true;

alter table public.access_requests
  add column organization_id uuid references public.organizations(id);

-- Existing deployments are single-tenant. Refuse to guess if legacy requests exist
-- after more than one organization has been provisioned.
do $$
declare
  legacy_organization_id uuid;
begin
  if exists(select 1 from public.access_requests where organization_id is null) then
    if (select count(*) from public.organizations) <> 1 then
      raise exception using
        errcode = '23514',
        message = 'Cannot safely assign legacy access requests to an organization';
    end if;

    select id
    into legacy_organization_id
    from public.organizations
    limit 1;

    update public.access_requests
    set organization_id = legacy_organization_id
    where organization_id is null;
  end if;
end
$$;

alter table public.access_requests
  alter column organization_id set not null,
  alter column organization_id set default public.current_org();

update public.access_requests
set contact_value = case contact_kind
  when 'email' then lower(trim(contact_value))
  when 'phone' then regexp_replace(trim(contact_value), '[[:space:]().-]', '', 'g')
end;

do $$
begin
  if exists(
    select 1
    from public.access_requests
    where not (
      (
        contact_kind = 'email'
        and contact_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
      or (
        contact_kind = 'phone'
        and contact_value ~ '^\+[1-9][0-9]{7,14}$'
      )
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing access requests contain invalid contact information';
  end if;
end
$$;

alter table public.access_requests
  add constraint access_requests_contact_format_check
  check (
    (
      contact_kind = 'email'
      and contact_value = lower(trim(contact_value))
      and contact_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
    or (
      contact_kind = 'phone'
      and contact_value ~ '^\+[1-9][0-9]{7,14}$'
    )
  );

drop index public.one_open_access_request_per_contact;
create unique index one_open_access_request_per_contact
  on public.access_requests(organization_id, lower(trim(contact_value)))
  where status in ('New', 'Contacted', 'Invited');
create index access_requests_organization_created
  on public.access_requests(organization_id, created_at desc);

drop policy access_request_submit on public.access_requests;
create policy access_request_admin_submit
  on public.access_requests
  for insert
  to authenticated
  with check (
    organization_id = public.current_org()
    and public.has_permission('access.manage')
    and status = 'New'
    and review_note = ''
    and reviewed_at is null
    and reviewed_by is null
    and auth_user_id is null
  );
drop policy access_request_admin_read on public.access_requests;
create policy access_request_admin_read
  on public.access_requests
  for select
  to authenticated
  using (
    organization_id = public.current_org()
    and public.has_permission('access.manage')
  );
drop policy access_request_admin_review on public.access_requests;
create policy access_request_admin_review
  on public.access_requests
  for update
  to authenticated
  using (
    organization_id = public.current_org()
    and public.has_permission('access.manage')
  )
  with check (
    organization_id = public.current_org()
    and public.has_permission('access.manage')
  );

-- The public resolver deliberately returns display-safe fields only. The UUID used
-- for authorization never crosses the anonymous API boundary.
create function public.resolve_signup_organization(tenant_slug text)
returns table(name text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select organization.name, organization.slug
  from public.organizations organization
  where organization.signup_enabled
    and lower(trim(organization.slug)) = lower(trim($1))
  limit 1
$$;

-- Resolve organization ownership from the verified link slug inside the database;
-- callers cannot choose or forge an organization UUID.
create function public.submit_access_request(
  tenant_slug text,
  display_name text,
  contact_kind text,
  contact_value text,
  preferred_locale text,
  requested_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  submitted_request_id uuid;
  normalized_contact_kind text := lower(trim($3));
  normalized_contact_value text;
begin
  select organization.id
  into target_organization_id
  from public.organizations organization
  where organization.signup_enabled
    and lower(trim(organization.slug)) = lower(trim($1));

  if target_organization_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Signup link is invalid or unavailable';
  end if;

  normalized_contact_value := case normalized_contact_kind
    when 'email' then lower(trim($4))
    when 'phone' then regexp_replace(trim($4), '[[:space:]().-]', '', 'g')
    else null
  end;

  if normalized_contact_value is null
    or not (
      (
        normalized_contact_kind = 'email'
        and normalized_contact_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
      or (
        normalized_contact_kind = 'phone'
        and normalized_contact_value ~ '^\+[1-9][0-9]{7,14}$'
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Contact information is invalid';
  end if;

  insert into public.access_requests(
    organization_id,
    display_name,
    contact_kind,
    contact_value,
    preferred_locale,
    requested_role
  )
  values(
    target_organization_id,
    trim($2),
    normalized_contact_kind,
    normalized_contact_value,
    $5,
    $6
  )
  returning id into submitted_request_id;

  return submitted_request_id;
end
$$;

revoke insert on public.access_requests from anon, authenticated;
grant insert on public.access_requests to authenticated;
revoke all on function public.resolve_signup_organization(text) from public;
revoke all on function public.submit_access_request(text, text, text, text, text, text)
  from public;
grant execute on function public.resolve_signup_organization(text) to anon, authenticated;
grant execute on function public.submit_access_request(text, text, text, text, text, text)
  to anon, authenticated;

-- Definer approval must still bind the request itself to the administrator's tenant.
create or replace function public.approve_access_request(
  request_id uuid,
  invited_user_id uuid,
  assigned_facility_id uuid,
  assigned_access_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester public.access_requests%rowtype;
  admin_profile public.profiles%rowtype;
  assigned public.access_profiles%rowtype;
begin
  select *
  into admin_profile
  from public.profiles
  where id = auth.uid() and active;

  if not public.has_permission('access.manage') then
    raise exception 'Access management permission required';
  end if;

  select *
  into assigned
  from public.access_profiles
  where id = assigned_access_profile_id
    and organization_id = admin_profile.organization_id
    and active;

  if assigned.id is null then
    raise exception 'Invalid access profile';
  end if;

  if not exists(
    select 1
    from public.facilities
    where id = assigned_facility_id
      and organization_id = admin_profile.organization_id
      and active
  ) then
    raise exception 'Invalid facility';
  end if;

  select *
  into requester
  from public.access_requests
  where id = request_id
    and organization_id = admin_profile.organization_id
  for update;

  if requester.id is null
    or requester.contact_kind <> 'email'
    or requester.status not in ('New', 'Invited') then
    raise exception 'Request cannot be approved';
  end if;

  if requester.auth_user_id is not null
    and requester.auth_user_id <> invited_user_id then
    raise exception 'Invitation does not match request';
  end if;

  insert into public.profiles(
    id,
    organization_id,
    facility_id,
    display_name,
    work_email,
    role,
    preferred_locale,
    active,
    access_profile_id
  )
  values(
    invited_user_id,
    admin_profile.organization_id,
    assigned_facility_id,
    requester.display_name,
    lower(trim(requester.contact_value)),
    assigned.base_role,
    requester.preferred_locale,
    true,
    assigned.id
  )
  on conflict(id) do nothing;

  update public.access_requests
  set status = 'Approved',
      auth_user_id = invited_user_id,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = 'Approved with profile ' || assigned.name
  where id = request_id
    and organization_id = admin_profile.organization_id;

  insert into public.audit_events(
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    event_type,
    after_data
  )
  values(
    admin_profile.organization_id,
    auth.uid(),
    'profiles',
    invited_user_id,
    'ACCESS_APPROVED',
    jsonb_build_object(
      'access_profile_id', assigned.id,
      'facility_id', assigned_facility_id,
      'request_id', request_id
    )
  );

  return invited_user_id;
end
$$;
