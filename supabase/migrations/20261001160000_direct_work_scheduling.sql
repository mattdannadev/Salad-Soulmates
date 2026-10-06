begin;

-- Work is the only scheduled operational record.  Calendar events are no
-- longer a separate lifecycle; PTO remains a separate availability overlay.
alter table public.workforce_work_queue_items
  add column start_at timestamptz,
  add column end_at timestamptz,
  add column all_day boolean not null default false,
  add column timezone text,
  add column product_id uuid,
  add column customer_id uuid,
  add column location_label text,
  add column availability_override_reason text,
  add constraint workforce_work_queue_items_schedule_range check (
    (start_at is null and end_at is null and timezone is null)
    or (start_at is not null and end_at is not null and timezone is not null and end_at > start_at)
  ),
  add constraint workforce_work_queue_items_location_label check (
    location_label is null or length(trim(location_label)) between 1 and 120
  ),
  add constraint workforce_work_queue_items_override_reason check (
    availability_override_reason is null or length(trim(availability_override_reason)) between 1 and 300
  ),
  add foreign key (organization_id, product_id) references public.products(organization_id, id),
  add foreign key (organization_id, customer_id) references public.customers(organization_id, id);

create index workforce_work_queue_items_calendar
  on public.workforce_work_queue_items(facility_id, start_at, end_at)
  where start_at is not null and publication_state <> 'cancelled';

-- Canonical calendar read. Claim rows are the assignment rows; scheduled work
-- does not manufacture an additional event/assignment identity.
create function public.get_scheduled_work_orders(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare requested_facility uuid := (payload->>'facility_id')::uuid;
declare requested_start timestamptz := (payload->>'start_at')::timestamptz;
declare requested_end timestamptz := (payload->>'end_at')::timestamptz;
begin
  if not public.has_permission('workforce.read') then raise exception 'Workforce access required'; end if;
  if requested_facility is distinct from public.current_facility()
    or requested_start is null or requested_end is null or requested_end <= requested_start then
    raise exception 'Invalid scheduled work range';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', work.id, 'revision', work.revision, 'kind', work.kind, 'title', work.title,
    'instructions', work.instructions, 'start_at', work.start_at, 'end_at', work.end_at,
    'all_day', work.all_day, 'timezone', work.timezone, 'required_worker_count', work.required_worker_count,
    'worker_ids', coalesce((select jsonb_agg(claim.worker_id order by claim.worker_id)
      from public.workforce_work_queue_claims claim where claim.queue_item_id = work.id), '[]'::jsonb),
    'publication_state', work.publication_state, 'status', work.status,
    'batch_quota', work.batch_quota, 'product_id', work.product_id, 'customer_id', work.customer_id,
    'location_label', work.location_label, 'linked_task_type', work.linked_task_type,
    'linked_task_id', work.linked_task_id,
    'batches_started', (select count(*)::integer from public.production_batches batch
      where batch.work_order_id = work.id and batch.state <> 'not_started'),
    'batches_total', work.batch_quota
  ) order by work.start_at, work.id)
  from public.workforce_work_queue_items work
  where work.organization_id = public.current_org() and work.facility_id = requested_facility
    and work.start_at < requested_end and work.end_at > requested_start
    and work.publication_state <> 'cancelled'), '[]'::jsonb);
end $$;

-- A deliberately narrow mutation for calendar move/resize. Rich creation and
-- editing continue through the established Work creation workflow until its UI
-- is switched; both paths write the same Work record.
create function public.move_scheduled_work_order(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
declare requested_revision integer := (payload->>'revision')::integer;
declare requested_start timestamptz := (payload->>'start_at')::timestamptz;
declare requested_end timestamptz := (payload->>'end_at')::timestamptz;
declare work public.workforce_work_queue_items%rowtype;
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  if requested_id is null or requested_revision is null or requested_revision <= 0
    or requested_start is null or requested_end is null or requested_end <= requested_start then
    raise exception 'Choose a valid work time and current revision';
  end if;
  select * into work from public.workforce_work_queue_items
    where organization_id = public.current_org() and facility_id = public.current_facility()
      and id = requested_id for update;
  if work.id is null or work.start_at is null or work.publication_state = 'cancelled' then
    raise exception 'Scheduled work unavailable';
  end if;
  if work.revision <> requested_revision then raise exception 'Scheduled work changed; reload and try again'; end if;
  update public.workforce_work_queue_items set start_at = requested_start, end_at = requested_end,
    work_on = (requested_start at time zone work.timezone)::date,
    updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where id = work.id;
  return work.id;
end $$;

revoke all on function public.get_scheduled_work_orders(jsonb),
  public.move_scheduled_work_order(jsonb) from public, anon, authenticated;
grant execute on function public.get_scheduled_work_orders(jsonb),
  public.move_scheduled_work_order(jsonb) to authenticated;

comment on column public.workforce_work_queue_items.start_at is
  'Canonical scheduled start for this Work record; no separate schedule event is required.';
commit;
