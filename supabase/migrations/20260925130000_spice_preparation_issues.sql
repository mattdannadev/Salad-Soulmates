begin;

-- An issue is a dated observation. Editing an allocation remains an append-only
-- usage correction followed by a replacement usage, while a completed worksheet
-- is locked because its material has already been posted to inventory.
create table public.spice_preparation_issues (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  execution_id uuid not null,
  worksheet_line_id uuid,
  serialized_unit_id uuid,
  category text not null check (category in ('Spice','Bucket')),
  note text not null check (length(trim(note)) between 3 and 1000),
  reported_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique (organization_id,facility_id,id),
  foreign key (organization_id,facility_id,execution_id)
    references public.batch_worksheet_executions(organization_id,facility_id,id),
  foreign key (organization_id,facility_id,worksheet_line_id)
    references public.batch_worksheet_lines(organization_id,facility_id,id),
  foreign key (organization_id,serialized_unit_id)
    references public.serialized_units(organization_id,id),
  check (category <> 'Bucket' or (worksheet_line_id is not null and serialized_unit_id is not null))
);
create index spice_preparation_issues_execution_time on public.spice_preparation_issues(execution_id,created_at);
alter table public.spice_preparation_issues enable row level security;
revoke all on public.spice_preparation_issues from public,anon,authenticated;
grant select on public.spice_preparation_issues to authenticated;
create policy spice_preparation_issue_read on public.spice_preparation_issues for select to authenticated
  using (organization_id=public.current_org() and facility_id=public.current_facility()
    and public.has_permission('production.mobile'));
create trigger spice_preparation_issue_audit after insert on public.spice_preparation_issues
  for each row execute function public.audit_change();

create function public.reject_spice_preparation_issue_edit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'Spice preparation problem reports are immutable';
end $$;
revoke all on function public.reject_spice_preparation_issue_edit() from public,anon,authenticated;
create trigger spice_preparation_issues_immutable before update or delete on public.spice_preparation_issues
  for each row execute function public.reject_spice_preparation_issue_edit();

create function public.report_spice_preparation_issue(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  request_id uuid := (payload->>'id')::uuid;
  target_execution_id uuid := (payload->>'execution_id')::uuid;
  target_line_id uuid := nullif(payload->>'worksheet_line_id','')::uuid;
  target_unit_id uuid := nullif(payload->>'serialized_unit_id','')::uuid;
  issue_category text := payload->>'category';
  issue_note text := trim(coalesce(payload->>'note',''));
  prior public.spice_preparation_issues%rowtype;
  execution public.batch_worksheet_executions%rowtype;
  line public.batch_worksheet_lines%rowtype;
begin
  if not public.has_permission('production.mobile') then
    raise exception 'Production worksheet permission required';
  end if;
  if request_id is null or target_execution_id is null or issue_category not in ('Spice','Bucket')
    or length(issue_note) not between 3 and 1000
    or (issue_category='Bucket' and (target_line_id is null or target_unit_id is null)) then
    raise exception 'Enter a spice or bucket problem and a short note';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,4));
  select * into prior from public.spice_preparation_issues
    where id=request_id and organization_id=public.current_org() and facility_id=public.current_facility();
  if prior.id is not null then
    if prior.execution_id=target_execution_id and prior.worksheet_line_id is not distinct from target_line_id
      and prior.serialized_unit_id is not distinct from target_unit_id
      and prior.category=issue_category and prior.note=issue_note and prior.reported_by=auth.uid() then
      return prior.id;
    end if;
    raise exception 'Issue request is already in use with different values';
  end if;
  select * into execution from public.batch_worksheet_executions where id=target_execution_id for update;
  if execution.id is null or execution.status<>'Open'
    or execution.organization_id<>public.current_org() or execution.facility_id<>public.current_facility() then
    raise exception 'Choose an open spice preparation';
  end if;
  if not exists (
    select 1 from public.planned_mixer_batches batch
    join public.order_production_plans plan on plan.id=batch.order_id
    where batch.id=execution.planned_mixer_batch_id and plan.status='Confirmed' for share of plan
  ) then raise exception 'Production preparation is cancelled'; end if;
  if target_line_id is not null then
    select * into line from public.batch_worksheet_lines where id=target_line_id;
    if line.id is null or line.execution_id<>execution.id then
      raise exception 'Ingredient does not belong to this spice preparation';
    end if;
  end if;
  if target_unit_id is not null then
    if line.id is null or not exists (
      select 1 from public.serialized_unit_balances unit
      where unit.id=target_unit_id and unit.ingredient_id=line.ingredient_id
        and unit.facility_id=execution.facility_id and unit.uom=line.uom
    ) then raise exception 'Bucket does not match this ingredient'; end if;
  end if;
  insert into public.spice_preparation_issues
    (id,organization_id,facility_id,execution_id,worksheet_line_id,serialized_unit_id,category,note)
    values(request_id,execution.organization_id,execution.facility_id,execution.id,
      target_line_id,target_unit_id,issue_category,issue_note);
  return request_id;
end $$;
revoke all on function public.report_spice_preparation_issue(jsonb) from public,anon;
grant execute on function public.report_spice_preparation_issue(jsonb) to authenticated;

-- Preserve the existing scoped worker read and append issue history to each task.
alter function public.worker_spice_preparations() rename to worker_spice_preparations_base;
revoke all on function public.worker_spice_preparations_base() from public,anon,authenticated;
create function public.worker_spice_preparations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_permission('production.mobile') then
    raise exception 'Production worksheet permission required';
  end if;
  select coalesce(jsonb_agg(task.value || jsonb_build_object('issues',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',issue.id,'worksheet_line_id',issue.worksheet_line_id,
      'serialized_unit_id',issue.serialized_unit_id,'category',issue.category,
      'note',issue.note,'created_at',issue.created_at) order by issue.created_at,issue.id)
    from public.spice_preparation_issues issue
    where issue.execution_id=(task.value->>'execution_id')::uuid
      and issue.organization_id=public.current_org() and issue.facility_id=public.current_facility()
  ),'[]'::jsonb)) order by task.ordinality),'[]'::jsonb) into result
  from jsonb_array_elements(public.worker_spice_preparations_base()) with ordinality as task(value,ordinality);
  return result;
end $$;
revoke all on function public.worker_spice_preparations() from public,anon;
grant execute on function public.worker_spice_preparations() to authenticated;

commit;
