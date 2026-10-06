alter table public.profiles add column regional_locale text;
alter table public.access_requests add column regional_locale text;

-- Existing accounts start in English (US). New users choose their language and locale
-- during provisioning, and can change either preference later.
update public.profiles
set preferred_locale = 'en', regional_locale = 'en-US';
update public.access_requests
set regional_locale = case preferred_locale when 'es' then 'es-MX' else 'en-US' end;

alter table public.profiles
  alter column regional_locale set default 'en-US',
  alter column regional_locale set not null,
  add constraint profiles_regional_locale_check
    check(regional_locale in ('en-US', 'es-MX'));
alter table public.access_requests
  alter column regional_locale set default 'en-US',
  alter column regional_locale set not null,
  add constraint access_requests_regional_locale_check
    check(regional_locale in ('en-US', 'es-MX'));

grant update(preferred_locale, regional_locale) on public.profiles to authenticated;

create or replace function public.submit_access_request(
  tenant_slug text,
  display_name text,
  contact_kind text,
  contact_value text,
  preferred_locale text,
  requested_role text,
  regional_locale text
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
  select organization.id into target_organization_id
  from public.organizations organization
  where organization.signup_enabled
    and lower(trim(organization.slug)) = lower(trim($1));

  if target_organization_id is null then
    raise exception using errcode = 'P0002', message = 'Signup link is invalid or unavailable';
  end if;

  normalized_contact_value := case normalized_contact_kind
    when 'email' then lower(trim($4))
    when 'phone' then regexp_replace(trim($4), '[[:space:]().-]', '', 'g')
    else null
  end;

  if normalized_contact_value is null or not (
    (normalized_contact_kind = 'email'
      and normalized_contact_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (normalized_contact_kind = 'phone'
      and normalized_contact_value ~ '^\+[1-9][0-9]{7,14}$')
  ) then
    raise exception using errcode = '22023', message = 'Contact information is invalid';
  end if;

  if $5 not in ('en', 'es') or $7 not in ('en-US', 'es-MX') then
    raise exception using errcode = '22023', message = 'Language or regional locale is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 19)
  );

  if (select count(*) from public.signup_request_events event
      where event.organization_id = target_organization_id
        and event.created_at >= pg_catalog.clock_timestamp() - interval '1 hour') >= 10 then
    raise exception using errcode = 'P0001', message = 'Signup request limit reached; try again later';
  end if;

  insert into public.access_requests(
    organization_id, display_name, contact_kind, contact_value,
    preferred_locale, requested_role, regional_locale
  ) values(
    target_organization_id, trim($2), normalized_contact_kind,
    normalized_contact_value, $5, $6, $7
  ) returning id into submitted_request_id;

  insert into public.signup_request_events(organization_id, access_request_id)
  values(target_organization_id, submitted_request_id);
  return submitted_request_id;
end
$$;

revoke all on function public.submit_access_request(text, text, text, text, text, text, text)
  from public;
grant execute on function public.submit_access_request(text, text, text, text, text, text, text)
  to anon, authenticated;

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
  select * into admin_profile from public.profiles where id = auth.uid() and active;
  if not public.has_permission('access.manage') then
    raise exception 'Access management permission required';
  end if;
  select * into assigned from public.access_profiles
  where id = assigned_access_profile_id
    and organization_id = admin_profile.organization_id and active;
  if assigned.id is null then raise exception 'Invalid access profile'; end if;
  if not exists(select 1 from public.facilities
    where id = assigned_facility_id
      and organization_id = admin_profile.organization_id and active) then
    raise exception 'Invalid facility';
  end if;
  select * into requester from public.access_requests
  where id = request_id and organization_id = admin_profile.organization_id for update;
  if requester.id is null or requester.contact_kind <> 'email'
    or requester.status not in ('New', 'Invited') then
    raise exception 'Request cannot be approved';
  end if;
  if requester.auth_user_id is not null and requester.auth_user_id <> invited_user_id then
    raise exception 'Invitation does not match request';
  end if;

  insert into public.profiles(
    id, organization_id, facility_id, display_name, work_email, role,
    preferred_locale, regional_locale, active, access_profile_id
  ) values(
    invited_user_id, admin_profile.organization_id, assigned_facility_id,
    requester.display_name, lower(trim(requester.contact_value)), assigned.base_role,
    requester.preferred_locale, requester.regional_locale, true, assigned.id
  ) on conflict(id) do nothing;

  update public.access_requests set status = 'Approved', auth_user_id = invited_user_id,
    reviewed_at = now(), reviewed_by = auth.uid(),
    review_note = 'Approved with profile ' || assigned.name
  where id = request_id and organization_id = admin_profile.organization_id;

  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id, event_type, after_data
  ) values(
    admin_profile.organization_id, auth.uid(), 'profiles', invited_user_id,
    'ACCESS_APPROVED', jsonb_build_object(
      'access_profile_id', assigned.id, 'facility_id', assigned_facility_id,
      'request_id', request_id, 'preferred_locale', requester.preferred_locale,
      'regional_locale', requester.regional_locale
    )
  );
  return invited_user_id;
end
$$;
