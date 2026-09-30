-- Provider reads retain only the tenant identifier and effective permission in
-- the audit record. The returned directory/detail rows have no personal data.
alter table public.provider_audit_events
  add column target_organization_id uuid
    references public.organizations(id) on update restrict on delete restrict,
  add column effective_permission text;

create function public.prevent_provider_audit_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Provider audit events are immutable' using errcode = '42501';
end
$$;
revoke all on function public.prevent_provider_audit_change()
  from public, anon, authenticated, service_role;
create trigger provider_audit_events_immutable
  before update or delete on public.provider_audit_events
  for each row execute function public.prevent_provider_audit_change();

create or replace function public.list_provider_tenants(actor uuid)
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

  insert into public.provider_audit_events
    (actor_user_id, event_type, effective_permission, details)
  values
    (actor, 'PROVIDER_TENANT_DIRECTORY_READ', 'tenants.read',
     '{"surface":"provider_console","outcome":"success"}'::jsonb);
end
$$;
revoke all on function public.list_provider_tenants(uuid)
  from public, anon, authenticated;
grant execute on function public.list_provider_tenants(uuid) to service_role;

create function public.get_provider_tenant_detail(
  actor uuid, target_organization_id uuid
)
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
