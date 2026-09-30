-- Customer records are explicit commercial records, not inferred from tenants.
create table public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id)
    on update restrict on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  email text,
  phone text,
  created_at timestamptz not null default now()
);
create index customer_contacts_account_id_idx
  on public.customer_contacts(account_id);

-- Only an explicitly approved production association is considered a link.
-- Archived rows remain as history; partial indexes govern current links.
create table public.tenant_account_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id)
    on update restrict on delete restrict,
  organization_id uuid not null references public.organizations(id)
    on update restrict on delete restrict,
  environment text not null default 'production'
    check (environment = 'production'),
  approved_by uuid not null references auth.users(id)
    on update restrict on delete restrict,
  approved_at timestamptz not null default now(),
  approval_reason text not null check (length(btrim(approval_reason)) > 0),
  archived_at timestamptz,
  constraint tenant_account_links_archive_order
    check (archived_at is null or archived_at >= approved_at)
);
create unique index tenant_account_links_current_organization_idx
  on public.tenant_account_links(organization_id)
  where environment = 'production' and archived_at is null;
create unique index tenant_account_links_current_account_idx
  on public.tenant_account_links(account_id)
  where environment = 'production' and archived_at is null;
create index tenant_account_links_account_history_idx
  on public.tenant_account_links(account_id, approved_at desc);

alter table public.customer_accounts enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.tenant_account_links enable row level security;
revoke all on table public.customer_accounts, public.customer_contacts,
  public.tenant_account_links from public, anon, authenticated, service_role;

update public.provider_roles
set permissions = array_append(permissions, 'customers.read')
where code in ('provider_owner', 'provider_operations', 'provider_support_readonly');

alter table public.provider_audit_events
  add column target_account_id uuid
    references public.customer_accounts(id) on update restrict on delete restrict;

create function public.list_provider_customer_accounts(actor uuid)
returns table (
  id uuid, name text, status text, created_at timestamptz,
  active_tenant_count bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_provider_permission(actor, 'customers.read') then
    raise exception 'Provider permission required' using errcode = '42501';
  end if;

  return query
    select a.id, a.name, a.status, a.created_at,
      (select count(*) from public.tenant_account_links l
       where l.account_id = a.id and l.environment = 'production'
         and l.archived_at is null)
    from public.customer_accounts a
    order by lower(a.name), a.id;

  insert into public.provider_audit_events
    (actor_user_id, event_type, effective_permission, details)
  values
    (actor, 'PROVIDER_CUSTOMER_DIRECTORY_READ', 'customers.read',
     '{"surface":"provider_console","outcome":"success"}'::jsonb);
end
$$;
revoke all on function public.list_provider_customer_accounts(uuid)
  from public, anon, authenticated;
grant execute on function public.list_provider_customer_accounts(uuid) to service_role;

create function public.get_provider_customer_account(
  actor uuid, target_account_id uuid
)
returns table (
  id uuid, name text, status text, created_at timestamptz,
  active_tenant_count bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_provider_permission(actor, 'customers.read') then
    raise exception 'Provider permission required' using errcode = '42501';
  end if;

  return query
    select a.id, a.name, a.status, a.created_at,
      (select count(*) from public.tenant_account_links l
       where l.account_id = a.id and l.environment = 'production'
         and l.archived_at is null)
    from public.customer_accounts a
    where a.id = target_account_id;

  if not found then
    raise exception 'Provider customer not found' using errcode = 'P0002';
  end if;

  insert into public.provider_audit_events
    (actor_user_id, target_account_id, event_type, effective_permission, details)
  values
    (actor, target_account_id, 'PROVIDER_CUSTOMER_DETAIL_READ', 'customers.read',
     '{"surface":"provider_console","outcome":"success"}'::jsonb);
end
$$;
revoke all on function public.get_provider_customer_account(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_provider_customer_account(uuid, uuid)
  to service_role;

create function public.list_provider_customer_account_tenants(
  actor uuid, target_account_id uuid
)
returns table (
  id uuid, name text, slug text, status text, created_at timestamptz,
  enabled_user_count bigint, facility_count bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_provider_permission(actor, 'customers.read')
     or not public.has_provider_permission(actor, 'tenants.read') then
    raise exception 'Provider permission required' using errcode = '42501';
  end if;

  if not exists(select 1 from public.customer_accounts a
                where a.id = target_account_id) then
    raise exception 'Provider customer not found' using errcode = 'P0002';
  end if;

  return query
    select o.id, o.name, o.slug, o.status, o.created_at,
      (select count(*) from public.profiles p
       where p.organization_id = o.id and p.active),
      (select count(*) from public.facilities f
       where f.organization_id = o.id)
    from public.tenant_account_links l
    join public.organizations o on o.id = l.organization_id
    where l.account_id = target_account_id
      and l.environment = 'production' and l.archived_at is null
    order by lower(o.name), o.id;

  insert into public.provider_audit_events
    (actor_user_id, target_account_id, event_type, effective_permission, details)
  values
    (actor, target_account_id, 'PROVIDER_CUSTOMER_TENANTS_READ',
     'customers.read+tenants.read',
     '{"surface":"provider_console","outcome":"success"}'::jsonb);
end
$$;
revoke all on function public.list_provider_customer_account_tenants(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_provider_customer_account_tenants(uuid, uuid)
  to service_role;

drop function public.get_provider_tenant_detail(uuid, uuid);
create function public.get_provider_tenant_detail(
  actor uuid, target_organization_id uuid
)
returns table (
  id uuid, name text, slug text, status text, created_at timestamptz,
  enabled_user_count bigint, facility_count bigint,
  linked_account_id uuid, linked_account_name text, linked_account_status text
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
       where f.organization_id = o.id),
      case when public.has_provider_permission(actor, 'customers.read')
        then a.id else null::uuid end,
      case when public.has_provider_permission(actor, 'customers.read')
        then a.name else null::text end,
      case when public.has_provider_permission(actor, 'customers.read')
        then a.status else null::text end
    from public.organizations o
    left join public.tenant_account_links l
      on l.organization_id = o.id and l.environment = 'production'
      and l.archived_at is null
    left join public.customer_accounts a on a.id = l.account_id
    where o.id = target_organization_id;

  if not found then
    raise exception 'Provider tenant not found' using errcode = 'P0002';
  end if;

  insert into public.provider_audit_events
    (actor_user_id, target_organization_id, event_type,
     effective_permission, details)
  values
    (actor, target_organization_id, 'PROVIDER_TENANT_DETAIL_READ',
     'tenants.read', '{"surface":"provider_console","outcome":"success"}'::jsonb);
end
$$;
revoke all on function public.get_provider_tenant_detail(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_provider_tenant_detail(uuid, uuid)
  to service_role;
