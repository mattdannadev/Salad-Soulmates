-- Append-only, tenant-scoped operational failures. Application callers provide
-- only deliberately safe diagnostic fields; raw payloads and exception text do
-- not belong in this table.
create table public.application_error_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org()
    references public.organizations(id),
  reported_by uuid default auth.uid() references auth.users(id),
  operation text not null
    check (operation ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$'),
  error_code text not null
    check (error_code ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$'),
  error_name text not null
    check (error_name ~ '^[A-Za-z][A-Za-z0-9_.-]{0,79}$'),
  severity text not null default 'error'
    check (severity in ('warning', 'error', 'critical')),
  safe_message text not null check (length(trim(safe_message)) between 1 and 500),
  route text check (
    route is null
    or (
      length(route) between 1 and 500
      and route ~ '^/[A-Za-z0-9_./-]*$'
    )
  ),
  request_id text check (
    request_id is null
    or request_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$'
  ),
  release_id text check (
    release_id is null
    or release_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$'
  ),
  occurred_at timestamptz not null default now(),
  unique (organization_id, id)
);

alter table public.application_error_logs enable row level security;

create policy application_error_log_read
  on public.application_error_logs
  for select
  to authenticated
  using (
    organization_id = (select public.current_org())
    and (select public.has_permission('audit.read'))
  );

create policy application_error_log_add
  on public.application_error_logs
  for insert
  to authenticated
  with check (
    organization_id = (select public.current_org())
    and reported_by = (select auth.uid())
  );

revoke all on table public.application_error_logs from public, anon, authenticated;
grant select on table public.application_error_logs to authenticated;
grant insert(
  id,
  operation,
  error_code,
  error_name,
  severity,
  safe_message,
  route,
  request_id,
  release_id
) on table public.application_error_logs to authenticated;

create index application_error_logs_org_occurred_at
  on public.application_error_logs(organization_id, occurred_at desc, id);
