-- The first Copilot release is limited to administrator recipe/order reads.
-- No client role can read or mutate request history directly.
create table public.operations_copilot_requests (
  id bigint generated always as identity primary key,
  correlation_id uuid not null,
  organization_id uuid not null references public.organizations(id),
  facility_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  intent text not null check (intent in ('recipes', 'orders')),
  outcome text not null check (outcome in ('accepted', 'denied', 'rate_limited', 'completed', 'failed')),
  occurred_at timestamptz not null default now(),
  legal_hold boolean not null default false,
  foreign key (organization_id, facility_id) references public.facilities(organization_id, id)
);
create index operations_copilot_requests_user_window
  on public.operations_copilot_requests(actor_user_id, occurred_at desc)
  where outcome = 'accepted';
create index operations_copilot_requests_org_window
  on public.operations_copilot_requests(organization_id, occurred_at desc)
  where outcome = 'accepted';
create index operations_copilot_requests_retention
  on public.operations_copilot_requests(occurred_at)
  where legal_hold = false;
create unique index operations_copilot_one_acceptance
  on public.operations_copilot_requests(correlation_id)
  where outcome = 'accepted';
create unique index operations_copilot_one_completion
  on public.operations_copilot_requests(correlation_id)
  where outcome in ('completed', 'failed');
alter table public.operations_copilot_requests enable row level security;
revoke all on public.operations_copilot_requests from public, anon, authenticated;
revoke all on sequence public.operations_copilot_requests_id_seq from public, anon, authenticated;

-- A transaction-scoped organization lock makes limits correct across app instances.
-- The database derives actor/scope/permission; client parameters cannot choose them.
create function public.begin_operations_copilot_request(
  requested_intent text,
  request_correlation_id uuid
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  required_permission text;
  result text := 'denied';
begin
  if (select auth.uid()) is null or requested_intent not in ('recipes', 'orders')
    or request_correlation_id is null then
    return 'denied';
  end if;
  select p.* into actor from public.profiles p
  join public.organizations o on o.id = p.organization_id
  join public.access_profiles ap on ap.id = p.access_profile_id
    and ap.organization_id = p.organization_id
  where p.id = (select auth.uid()) and p.active
    and o.status = 'active' and ap.active;
  if actor.id is null then return 'denied'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor.organization_id::text, 64721));
  required_permission := case requested_intent when 'recipes' then 'products.read' else 'orders.read' end;
  if actor.role = 'admin' and public.operations_copilot_enabled()
    and public.has_permission(required_permission) then
    if (select count(*) from public.operations_copilot_requests r
        where r.actor_user_id = actor.id and r.outcome = 'accepted'
          and r.occurred_at > now() - interval '1 hour') >= 20
      or (select count(*) from public.operations_copilot_requests r
        where r.organization_id = actor.organization_id and r.outcome = 'accepted'
          and r.occurred_at > now() - interval '1 hour') >= 100 then
      result := 'rate_limited';
    else
      result := 'accepted';
    end if;
  end if;
  insert into public.operations_copilot_requests (
    correlation_id, organization_id, facility_id, actor_user_id, intent, outcome
  ) values (
    request_correlation_id, actor.organization_id, actor.facility_id,
    actor.id, requested_intent, result
  );
  return result;
end $$;

create function public.finish_operations_copilot_request(
  request_correlation_id uuid,
  request_outcome text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  accepted public.operations_copilot_requests%rowtype;
begin
  if (select auth.uid()) is null or request_correlation_id is null
    or request_outcome not in ('completed', 'failed') then
    raise exception 'Invalid Copilot completion';
  end if;
  select r.* into accepted from public.operations_copilot_requests r
  where r.correlation_id = request_correlation_id
    and r.actor_user_id = (select auth.uid()) and r.outcome = 'accepted'
  limit 1;
  if accepted.id is null then raise exception 'Copilot request not found'; end if;
  if exists(select 1 from public.operations_copilot_requests r
    where r.correlation_id = request_correlation_id
      and r.outcome in ('completed', 'failed')) then
    raise exception 'Copilot request already completed';
  end if;
  insert into public.operations_copilot_requests (
    correlation_id, organization_id, facility_id, actor_user_id, intent, outcome
  ) values (
    request_correlation_id, accepted.organization_id, accepted.facility_id,
    accepted.actor_user_id, accepted.intent, request_outcome
  );
end $$;

-- Schedule this service-role-only maintenance after the release. Holds are
-- reviewed by the operator; request rows contain metadata only.
create function public.purge_operations_copilot_requests() returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  delete from public.operations_copilot_requests
  where occurred_at < now() - interval '90 days' and not legal_hold;
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.begin_operations_copilot_request(text, uuid) from public, anon;
revoke all on function public.finish_operations_copilot_request(uuid, text) from public, anon;
revoke all on function public.purge_operations_copilot_requests() from public, anon, authenticated;
grant execute on function public.begin_operations_copilot_request(text, uuid) to authenticated;
grant execute on function public.finish_operations_copilot_request(uuid, text) to authenticated;
grant execute on function public.purge_operations_copilot_requests() to service_role;
