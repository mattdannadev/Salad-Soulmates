-- Operations Copilot plan access is a platform billing entitlement. Tenant
-- roles can read their own effective state, but only the server-side platform
-- control plane can change the organization ceiling.
drop function public.list_platform_organizations(uuid);

create function public.list_platform_organizations(actor_user_id uuid)
returns table (
  id uuid, name text, slug text, status text, signup_enabled boolean,
  operations_copilot_plan_enabled boolean,
  enabled_user_count bigint, created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if actor_user_id is null or not exists (
    select 1 from public.platform_admins pa where pa.user_id = actor_user_id
  ) then
    raise exception 'Platform administrator required';
  end if;
  return query
    select o.id, o.name, o.slug, o.status, o.signup_enabled,
      o.operations_copilot_plan_enabled,
      count(p.id) filter (where p.active), o.created_at
    from public.organizations o
    left join public.profiles p on p.organization_id = o.id
    group by o.id
    order by lower(o.name), o.id;
end
$$;

create function public.set_platform_operations_copilot_plan(
  actor_user_id uuid,
  target_organization_id uuid,
  plan_enabled boolean,
  reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.organizations%rowtype;
begin
  if actor_user_id is null then
    raise exception 'Platform administrator required';
  end if;
  if target_organization_id is null or plan_enabled is null
    or length(trim(coalesce(reason, ''))) not between 3 and 500 then
    raise exception 'Invalid Operations Copilot plan change';
  end if;

  -- Hold membership stable through the write so concurrent revocation and plan
  -- changes have a deterministic transaction order.
  perform 1 from public.platform_admins
  where user_id = actor_user_id
  for share;
  if not found then raise exception 'Platform administrator required'; end if;

  select * into target
  from public.organizations
  where id = target_organization_id
  for update;
  if target.id is null then raise exception 'Organization not found'; end if;
  if target.operations_copilot_plan_enabled = plan_enabled then return; end if;

  update public.organizations
  set operations_copilot_plan_enabled = plan_enabled
  where id = target_organization_id;

  insert into public.audit_events(
    organization_id, actor_user_id, entity_type, entity_id,
    event_type, before_data, after_data
  ) values (
    target_organization_id, actor_user_id, 'organizations', target_organization_id,
    'OPERATIONS_COPILOT_PLAN_CHANGED',
    jsonb_build_object('enabled', target.operations_copilot_plan_enabled),
    jsonb_build_object('enabled', plan_enabled, 'reason', trim(reason))
  );
end
$$;

revoke update on table public.organizations from anon, authenticated;
revoke all on function public.list_platform_organizations(uuid)
  from public, anon, authenticated;
revoke all on function public.set_platform_operations_copilot_plan(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.list_platform_organizations(uuid) to service_role;
grant execute on function public.set_platform_operations_copilot_plan(uuid, uuid, boolean, text)
  to service_role;
