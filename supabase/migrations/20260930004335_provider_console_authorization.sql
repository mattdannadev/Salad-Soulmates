-- Provider roles are independent of tenant profiles and legacy platform_admins.
-- Assignments are deliberately managed out of band until a trustworthy recent
-- authentication proof is available to an audited mutation RPC.
create table public.provider_roles (
  code text primary key,
  name text not null,
  description text not null,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint provider_roles_code_format check (code ~ '^provider_[a-z_]+$'),
  constraint provider_roles_permissions_not_null check (array_position(permissions, null) is null)
);

insert into public.provider_roles(code, name, description, permissions) values
  ('provider_owner', 'Provider owner', 'Full provider authority', array['tenants.read']),
  ('provider_operations', 'Provider operations', 'Provider operations access', array['tenants.read']),
  ('provider_support_readonly', 'Provider support', 'Read-only provider support access', array['tenants.read']),
  ('provider_billing', 'Provider billing', 'Provider billing access', array[]::text[]);

create table public.provider_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  role_code text not null references public.provider_roles(code) on update restrict on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (user_id, role_code)
);
create index provider_role_assignments_role_code_idx
  on public.provider_role_assignments(role_code, user_id);

comment on table public.provider_role_assignments is
  'Future assignment mutation must verify provider_owner in current DB state and an authoritative authentication event no older than 15 minutes, then atomically audit the change. JWT iat, client timestamps, and user metadata are not sufficient freshness proofs. No client mutation is currently exposed.';

create table public.provider_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type ~ '^[A-Z][A-Z0-9_]+$'),
  details jsonb not null default '{}'::jsonb
);
create index provider_audit_events_occurred_at_idx
  on public.provider_audit_events(occurred_at desc, id desc);

alter table public.provider_roles enable row level security;
alter table public.provider_role_assignments enable row level security;
alter table public.provider_audit_events enable row level security;
revoke all on table public.provider_roles, public.provider_role_assignments,
  public.provider_audit_events from public, anon, authenticated, service_role;
grant select on table public.provider_roles, public.provider_role_assignments,
  public.provider_audit_events to service_role;

-- This is an exact, one-time assignment to the known production identity. If
-- that Auth user does not exist yet, deployment does not silently assign any
-- other account or install a future automatic promotion trigger.
with new_owner as (
  insert into public.provider_role_assignments(user_id, role_code)
  select u.id, 'provider_owner'
  from auth.users u
  where u.email = 'mattdanna@gmail.com'
  on conflict (user_id, role_code) do nothing
  returning user_id
)
insert into public.provider_audit_events(subject_user_id, event_type, details)
select user_id, 'PROVIDER_OWNER_BOOTSTRAPPED',
  jsonb_build_object('role_code', 'provider_owner', 'source', 'migration')
from new_owner;

-- Server-only permission lookup. Each check reads the current assignment
-- state; no user-editable JWT metadata participates in authorization.
create function public.has_provider_permission(actor uuid, permission_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select actor is not null and permission_code is not null and exists (
    select 1
    from public.provider_role_assignments a
    join public.provider_roles r on r.code = a.role_code
    where a.user_id = actor
      and (r.code = 'provider_owner' or permission_code = any(r.permissions))
  )
$$;
revoke all on function public.has_provider_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function public.has_provider_permission(uuid, text) to service_role;

create function public.list_provider_tenants(actor uuid)
returns table (
  id uuid, name text, slug text, status text, created_at timestamptz,
  enabled_user_count bigint, facility_count bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_provider_permission(actor, 'tenants.read') then
    raise exception 'Provider permission required' using errcode = '42501';
  end if;

  return query
    select o.id, o.name, o.slug, o.status, o.created_at,
      (select count(*) from public.profiles p
       where p.organization_id = o.id and p.active),
      (select count(*) from public.facilities f
       where f.organization_id = o.id)
    from public.organizations o
    order by lower(o.name), o.id;
end
$$;
revoke all on function public.list_provider_tenants(uuid)
  from public, anon, authenticated;
grant execute on function public.list_provider_tenants(uuid) to service_role;
