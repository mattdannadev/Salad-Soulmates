-- Track only successful public signup submissions. Administrative access requests
-- remain available to existing customers without consuming the public-link limit.
alter table public.access_requests
  add constraint access_requests_id_organization_key
  unique(id, organization_id);

create table public.signup_request_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  access_request_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  constraint signup_request_events_access_request_tenant_fkey
    foreign key(access_request_id, organization_id)
    references public.access_requests(id, organization_id)
    on delete cascade
);

create index signup_request_events_organization_created
  on public.signup_request_events(organization_id, created_at desc);

alter table public.signup_request_events enable row level security;
revoke all on public.signup_request_events from public, anon, authenticated;
revoke all on sequence public.signup_request_events_id_seq
  from public, anon, authenticated;

-- Serialize submissions by resolved organization so concurrent requests cannot
-- both observe an available final slot. The organization UUID is always resolved
-- from the enabled tenant slug and is never accepted from the caller.
create or replace function public.submit_access_request(
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 19)
  );

  if (
    select count(*)
    from public.signup_request_events event
    where event.organization_id = target_organization_id
      and event.created_at >= pg_catalog.clock_timestamp() - interval '1 hour'
  ) >= 10 then
    raise exception using
      errcode = 'P0001',
      message = 'Signup request limit reached; try again later';
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

  insert into public.signup_request_events(
    organization_id,
    access_request_id
  )
  values(
    target_organization_id,
    submitted_request_id
  );

  return submitted_request_id;
end
$$;

revoke all on function public.submit_access_request(text, text, text, text, text, text)
  from public;
grant execute on function public.submit_access_request(text, text, text, text, text, text)
  to anon, authenticated;
