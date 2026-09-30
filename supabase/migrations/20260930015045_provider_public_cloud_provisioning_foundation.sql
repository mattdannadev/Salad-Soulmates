-- Durable public-cloud onboarding state. Only reviewed future server workflows
-- may write jobs; this migration intentionally exposes read-only provider RPCs.
create table public.provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id)
    on update restrict on delete restrict,
  idempotency_key uuid not null unique,
  correlation_id uuid not null default gen_random_uuid(),
  requested_by uuid not null references auth.users(id)
    on update restrict on delete restrict,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'provisioning', 'active', 'failed')),
  readiness_state text not null default 'not_ready'
    check (readiness_state in ('not_ready', 'ready', 'attention_required')),
  offering_type text not null default 'public_cloud'
    check (offering_type = 'public_cloud'),
  requested_organization_name text not null
    check (length(btrim(requested_organization_name)) > 0),
  requested_organization_slug text not null
    check (requested_organization_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  organization_id uuid references public.organizations(id)
    on update restrict on delete restrict,
  approved_link_id uuid,
  initial_admin_invitation_reference uuid unique,
  initial_admin_auth_user_id uuid references auth.users(id)
    on update restrict on delete restrict,
  initial_admin_invitation_state text not null default 'not_started'
    check (initial_admin_invitation_state in
      ('not_started', 'pending', 'delivered', 'expired', 'failed')),
  initial_admin_invitation_expires_at timestamptz,
  invitation_delivered_at timestamptz,
  safe_invitation_failure_code text
    check (safe_invitation_failure_code ~ '^[A-Z][A-Z0-9_]+$'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  safe_failure_code text check (safe_failure_code ~ '^[A-Z][A-Z0-9_]+$'),
  constraint provisioning_jobs_timestamps check (
    updated_at >= requested_at
    and (started_at is null or started_at >= requested_at)
    and (finished_at is null or (started_at is not null and finished_at >= started_at))
    and (invitation_delivered_at is null or started_at is not null)
  ),
  constraint provisioning_jobs_invitation_evidence check (
    (initial_admin_invitation_state = 'not_started'
      and initial_admin_invitation_reference is null
      and initial_admin_auth_user_id is null
      and initial_admin_invitation_expires_at is null
      and invitation_delivered_at is null
      and safe_invitation_failure_code is null)
    or (initial_admin_invitation_state = 'pending'
      and initial_admin_invitation_reference is not null
      and invitation_delivered_at is null
      and safe_invitation_failure_code is null)
    or (initial_admin_invitation_state = 'delivered'
      and initial_admin_invitation_reference is not null
      and initial_admin_auth_user_id is not null
      and invitation_delivered_at is not null
      and safe_invitation_failure_code is null)
    or (initial_admin_invitation_state = 'expired'
      and initial_admin_invitation_reference is not null
      and initial_admin_invitation_expires_at is not null
      and invitation_delivered_at is null)
    or (initial_admin_invitation_state = 'failed'
      and initial_admin_invitation_reference is not null
      and invitation_delivered_at is null
      and safe_invitation_failure_code is not null)
  ),
  constraint provisioning_jobs_approval_target check (
    approved_link_id is null or organization_id is not null
  ),
  constraint provisioning_jobs_completion check (
    (status = 'active' and readiness_state = 'ready'
      and organization_id is not null and approved_link_id is not null
      and initial_admin_invitation_state = 'delivered'
      and invitation_delivered_at is not null and finished_at is not null
      and safe_failure_code is null)
    or (status = 'failed' and readiness_state = 'attention_required'
      and safe_failure_code is not null and finished_at is not null)
    or (status in ('draft', 'provisioning') and readiness_state = 'not_ready'
      and finished_at is null and safe_failure_code is null)
  )
);

-- The approved link must bind this exact account to this exact organization.
alter table public.tenant_account_links
  add constraint tenant_account_links_job_target_key
  unique (id, account_id, organization_id);
alter table public.provisioning_jobs
  add constraint provisioning_jobs_approved_target_fkey
  foreign key (approved_link_id, account_id, organization_id)
  references public.tenant_account_links(id, account_id, organization_id)
  on update restrict on delete restrict;

-- Historical links remain valid references, but activation requires the link
-- to still be current when the job enters its completed state.
create function public.verify_provisioning_job_approval()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'active' and not exists (
    select 1 from public.tenant_account_links link
    where link.id = new.approved_link_id
      and link.account_id = new.account_id
      and link.organization_id = new.organization_id
      and link.environment = 'production'
      and link.archived_at is null
  ) then
    raise exception 'Current approved customer link required'
      using errcode = '23514';
  end if;
  if new.status = 'active' and not exists (
    select 1 from public.organizations organization
    where organization.id = new.organization_id
      and organization.status = 'active'
  ) then
    raise exception 'Active organization required for provisioning readiness'
      using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function public.verify_provisioning_job_approval()
  from public, anon, authenticated, service_role;
create trigger provisioning_jobs_approval_guard
  before insert or update on public.provisioning_jobs
  for each row execute function public.verify_provisioning_job_approval();

create function public.touch_provisioning_job_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;
revoke all on function public.touch_provisioning_job_updated_at()
  from public, anon, authenticated, service_role;
create trigger provisioning_jobs_updated_at
  before update on public.provisioning_jobs
  for each row execute function public.touch_provisioning_job_updated_at();

create index provisioning_jobs_account_requested_idx
  on public.provisioning_jobs(account_id, requested_at desc, id desc);
create unique index provisioning_jobs_unfinished_account_idx
  on public.provisioning_jobs(account_id)
  where status in ('draft', 'provisioning');
create unique index provisioning_jobs_unfinished_slug_idx
  on public.provisioning_jobs(requested_organization_slug)
  where status in ('draft', 'provisioning');

comment on table public.provisioning_jobs is
  'A ready public-cloud job requires an active organization, current approved account/organization link, and delivered initial-administrator invitation tied to a durable Auth user reference. Invitation acceptance is a separate tenant-identity state. The internal attempt reference is assigned before dispatch, not a claim of an Auth API call. No mutation RPC is exposed until recent-auth, permission, audit, and recovery guards are implemented.';

alter table public.provisioning_jobs enable row level security;
revoke all on table public.provisioning_jobs from public, anon, authenticated, service_role;

alter table public.provider_audit_events
  add column target_provisioning_job_id uuid
    references public.provisioning_jobs(id) on update restrict on delete restrict;

create function public.list_provider_provisioning_jobs(actor uuid)
returns table (
  id uuid, account_id uuid, account_name text,
  organization_id uuid, organization_name text,
  status text, readiness_state text, offering_type text,
  requested_organization_name text, requested_organization_slug text,
  requested_at timestamptz, updated_at timestamptz,
  initial_admin_invitation_state text, invitation_delivered_at timestamptz,
  initial_admin_invitation_expires_at timestamptz,
  attempt_count integer, safe_invitation_failure_code text,
  safe_failure_code text
)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.provider_role_assignments assignment
    where assignment.user_id = actor and assignment.role_code = 'provider_owner'
  ) then
    raise exception 'Provider Owner permission required' using errcode = '42501';
  end if;

  return query
    select job.id, job.account_id, account.name,
      job.organization_id, organization.name,
      job.status, job.readiness_state, job.offering_type,
      job.requested_organization_name, job.requested_organization_slug,
      job.requested_at, job.updated_at,
      job.initial_admin_invitation_state, job.invitation_delivered_at,
      job.initial_admin_invitation_expires_at,
      job.attempt_count, job.safe_invitation_failure_code,
      job.safe_failure_code
    from public.provisioning_jobs job
    join public.customer_accounts account on account.id = job.account_id
    left join public.organizations organization on organization.id = job.organization_id
    order by job.requested_at desc, job.id desc;

  insert into public.provider_audit_events
    (actor_user_id, event_type, effective_permission, details)
  values
    (actor, 'PROVIDER_PROVISIONING_DIRECTORY_READ', 'provider_owner',
     '{"surface":"provider_console","outcome":"success"}'::jsonb);
end
$$;
revoke all on function public.list_provider_provisioning_jobs(uuid)
  from public, anon, authenticated;
grant execute on function public.list_provider_provisioning_jobs(uuid) to service_role;

create function public.get_provider_provisioning_job(actor uuid, target_job_id uuid)
returns table (
  id uuid, account_id uuid, account_name text,
  organization_id uuid, organization_name text,
  status text, readiness_state text, offering_type text,
  requested_organization_name text, requested_organization_slug text,
  requested_at timestamptz, updated_at timestamptz,
  initial_admin_invitation_state text, invitation_delivered_at timestamptz,
  initial_admin_invitation_expires_at timestamptz,
  attempt_count integer, safe_invitation_failure_code text,
  safe_failure_code text
)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.provider_role_assignments assignment
    where assignment.user_id = actor and assignment.role_code = 'provider_owner'
  ) then
    raise exception 'Provider Owner permission required' using errcode = '42501';
  end if;

  return query
    select job.id, job.account_id, account.name,
      job.organization_id, organization.name,
      job.status, job.readiness_state, job.offering_type,
      job.requested_organization_name, job.requested_organization_slug,
      job.requested_at, job.updated_at,
      job.initial_admin_invitation_state, job.invitation_delivered_at,
      job.initial_admin_invitation_expires_at,
      job.attempt_count, job.safe_invitation_failure_code,
      job.safe_failure_code
    from public.provisioning_jobs job
    join public.customer_accounts account on account.id = job.account_id
    left join public.organizations organization on organization.id = job.organization_id
    where job.id = target_job_id;

  if not found then
    raise exception 'Provider provisioning job not found' using errcode = 'P0002';
  end if;

  insert into public.provider_audit_events
    (actor_user_id, target_account_id, target_provisioning_job_id,
     event_type, effective_permission, details)
  select actor, job.account_id, job.id,
    'PROVIDER_PROVISIONING_DETAIL_READ', 'provider_owner',
    '{"surface":"provider_console","outcome":"success"}'::jsonb
  from public.provisioning_jobs job where job.id = target_job_id;
end
$$;
revoke all on function public.get_provider_provisioning_job(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_provider_provisioning_job(uuid, uuid)
  to service_role;
