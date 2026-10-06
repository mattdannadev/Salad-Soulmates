-- Instants are authoritative; local dates remain a derived, exclusive day envelope.
begin;
alter table public.workforce_schedule_events
  add column start_at timestamptz, add column end_at timestamptz,
  add column all_day boolean not null default true, add column timezone text,
  add column required_worker_count integer not null default 1
    check (required_worker_count between 1 and 100);
alter table public.workforce_published_events
  add column start_at timestamptz, add column end_at timestamptz,
  add column all_day boolean not null default true, add column timezone text,
  add column required_worker_count integer not null default 1
    check (required_worker_count between 1 and 100);
update public.workforce_schedule_events e set
  start_at=e.start_on::timestamp at time zone f.timezone,
  end_at=e.end_on::timestamp at time zone f.timezone, timezone=f.timezone
from public.facilities f where f.id=e.facility_id and f.organization_id=e.organization_id;
update public.workforce_published_events e set
  start_at=e.start_on::timestamp at time zone f.timezone,
  end_at=e.end_on::timestamp at time zone f.timezone, timezone=f.timezone
from public.facilities f where f.id=e.facility_id and f.organization_id=e.organization_id;
alter table public.workforce_schedule_events
  alter column start_at set not null, alter column end_at set not null,
  alter column timezone set not null,
  add constraint workforce_schedule_time_range check (
    isfinite(start_at) and isfinite(end_at) and end_at>start_at
    and start_on=(start_at at time zone timezone)::date
    and end_on=((end_at-interval '1 microsecond') at time zone timezone)::date+1
    and (not all_day or (start_at=start_on::timestamp at time zone timezone
      and end_at=end_on::timestamp at time zone timezone)));
alter table public.workforce_published_events
  alter column start_at set not null, alter column end_at set not null,
  alter column timezone set not null,
  add constraint workforce_published_time_range check (
    isfinite(start_at) and isfinite(end_at) and end_at>start_at
    and start_on=(start_at at time zone timezone)::date
    and end_on=((end_at-interval '1 microsecond') at time zone timezone)::date+1
    and (not all_day or (start_at=start_on::timestamp at time zone timezone
      and end_at=end_on::timestamp at time zone timezone)));
create index workforce_schedule_events_time_range on public.workforce_schedule_events(facility_id,start_at,end_at);

-- PTO repeats its local minute interval on every covered local day.
create function public.workforce_pto_intervals(
  first_day date, last_day date, first_minute integer, last_minute integer, zone text
) returns table(start_at timestamptz,end_at timestamptz)
language sql immutable set search_path='' as $$
  select ((first_day+day)::timestamp + first_minute*interval '1 minute') at time zone zone,
    ((first_day+day)::timestamp + last_minute*interval '1 minute') at time zone zone
  from generate_series(0,last_day-first_day-1) day
$$;
revoke all on function public.workforce_pto_intervals(date,date,integer,integer,text) from public,anon,authenticated;

create function public.check_workforce_conflict(
  requested_facility uuid, requested_event_id uuid, requested_start timestamptz,
  requested_end timestamptz, requested_employees uuid[], override_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare conflicting_employee text; unavailable_employee text; zone text;
begin
  select f.timezone into zone from public.facilities f where f.id=requested_facility
    and f.organization_id=public.current_org();
  select p.display_name into conflicting_employee
  from public.workforce_schedule_events e
  join public.workforce_schedule_assignments a on a.event_id=e.id
  join public.profiles p on p.id=a.employee_id
  where e.organization_id=public.current_org() and e.facility_id=requested_facility
    and e.id<>requested_event_id and e.start_at<requested_end and e.end_at>requested_start
    and a.employee_id=any(requested_employees) limit 1;
  if conflicting_employee is not null then
    raise exception 'Assignment conflicts with %',conflicting_employee; end if;
  select p.display_name into conflicting_employee
  from public.workforce_pto_blocks b join public.profiles p on p.id=b.employee_id
  cross join lateral public.workforce_pto_intervals(b.start_on,b.end_on,b.start_minute,b.end_minute,zone) t
  where b.organization_id=public.current_org() and b.facility_id=requested_facility
    and b.status='approved' and b.employee_id=any(requested_employees)
    and t.start_at<requested_end and t.end_at>requested_start limit 1;
  if conflicting_employee is not null then
    raise exception 'Approved PTO conflicts with %',conflicting_employee; end if;
  select p.display_name into unavailable_employee
  from unnest(requested_employees) selected(employee_id)
  join public.profiles p on p.id=selected.employee_id
  left join public.workforce_availability a on a.employee_id=p.id
  cross join lateral generate_series(
    (requested_start at time zone zone)::date,
    ((requested_end-interval '1 microsecond') at time zone zone)::date,
    interval '1 day') day(value)
  where not (extract(dow from day.value)::integer=any(coalesce(a.available_days,array[1,2,3,4,5])))
  limit 1;
  if unavailable_employee is not null and nullif(trim(coalesce(override_reason,'')),'') is null then
    raise exception 'Availability override reason required for %',unavailable_employee; end if;
end $$;
revoke all on function public.check_workforce_conflict(uuid,uuid,timestamptz,timestamptz,uuid[],text)
  from public,anon,authenticated;

create or replace function public.save_workforce_schedule_event(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_event_id uuid := (payload->>'id')::uuid;
  facility uuid := (payload->>'facility_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  requested_start date;
  requested_end date;
  starts timestamptz := (payload->>'start_at')::timestamptz;
  ends timestamptz := (payload->>'end_at')::timestamptz;
  all_day_value boolean := coalesce((payload->>'all_day')::boolean,false);
  timezone_value text;
  kind_value text := payload->>'kind';
  required_workers integer := (payload->>'required_worker_count')::integer;
  title_value text := trim(coalesce(payload->>'title',''));
  plan_id uuid := nullif(payload->>'production_plan_id','')::uuid;
  link_type text := nullif(payload->>'linked_task_type','');
  link_id uuid := nullif(payload->>'linked_task_id','')::uuid;
  product_id_value uuid := nullif(payload->>'product_id','')::uuid;
  customer_id_value uuid := nullif(payload->>'customer_id','')::uuid;
  location_value text := nullif(trim(payload->>'location_label'),'');
  override_reason text := nullif(trim(payload->>'availability_override_reason'),'');
  selected_employees uuid[];
  prior public.workforce_schedule_events%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  perform public.lock_workforce_facility(facility);
  select f.timezone into timezone_value from public.facilities f where f.id=facility;
  if requested_event_id is null or starts is null or ends is null or not isfinite(starts) or not isfinite(ends)
    or ends<=starts or ends>starts+interval '366 days'
    or coalesce(payload->>'start_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
    or coalesce(payload->>'end_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'Invalid schedule time range'; end if;
  requested_start := (starts at time zone timezone_value)::date;
  requested_end := ((ends-interval '1 microsecond') at time zone timezone_value)::date+1;
  if (payload ? 'timezone' and payload->>'timezone' is distinct from timezone_value)
    or (payload ? 'start_on' and (payload->>'start_on')::date is distinct from requested_start)
    or (payload ? 'end_on' and (payload->>'end_on')::date is distinct from requested_end)
    or (all_day_value and (starts is distinct from (requested_start::timestamp at time zone timezone_value)
      or ends is distinct from (requested_end::timestamp at time zone timezone_value))) then
    raise exception 'Invalid facility-local schedule range'; end if;
  if requested_end<=requested_start or requested_end>requested_start+366 then raise exception 'Invalid schedule range'; end if;
  if kind_value is null or kind_value not in ('pre_op','post_op','ingredient_prep','mixing','receiving','shipment_loading','packaging','cleaning','off','other')
    or required_workers is null or required_workers not between 1 and 100
    or length(title_value)>120 or length(override_reason)>300 then raise exception 'Invalid schedule event'; end if;
  if jsonb_typeof(payload->'employee_ids') is distinct from 'array'
    or jsonb_array_length(payload->'employee_ids')>100 then raise exception 'Invalid employee selection'; end if;
  select coalesce(array_agg(value::uuid),array[]::uuid[]) into selected_employees
    from jsonb_array_elements_text(payload->'employee_ids') item(value);
  if cardinality(selected_employees) <> (select count(distinct id) from unnest(selected_employees) id)
    or exists(select 1 from unnest(selected_employees) selected(id) where not exists(
      select 1 from public.profiles p where p.id=selected.id and p.organization_id=public.current_org()
        and p.facility_id=facility and p.active)) then raise exception 'Invalid employee selection'; end if;
  if plan_id is not null and not exists(select 1 from public.order_production_plans p
    where p.id=plan_id and p.organization_id=public.current_org() and p.facility_id=facility
      and p.status<>'Cancelled') then raise exception 'Invalid production plan'; end if;
  if (link_type is null) <> (link_id is null) then raise exception 'Invalid linked task'; end if;
  if length(location_value)>120 then raise exception 'Invalid location'; end if;
  if product_id_value is not null and not exists(select 1 from public.products p
    where p.id=product_id_value and p.organization_id=public.current_org() and p.active) then
    raise exception 'Invalid product'; end if;
  if customer_id_value is not null and not exists(select 1 from public.customers c
    where c.id=customer_id_value and c.organization_id=public.current_org()) then
    raise exception 'Invalid customer'; end if;
  if link_type='production_plan' and (link_id is distinct from plan_id) then
    raise exception 'Invalid linked task';
  elsif link_type='order' and not exists(select 1 from public.customer_orders o
      where o.id=link_id and o.organization_id=public.current_org() and o.facility_id=facility)
    then raise exception 'Invalid linked task';
  elsif link_type='planned_mixer_batch' and not exists(
    select 1 from public.planned_mixer_batches b where b.id=link_id
      and b.organization_id=public.current_org() and b.facility_id=facility
      and b.order_id=plan_id) then raise exception 'Invalid linked task';
  elsif link_type='planned_spice_preparation' and not exists(
    select 1 from public.planned_spice_preparations s
    join public.planned_mixer_batches b on b.id=s.planned_mixer_batch_id
    where s.id=link_id and s.organization_id=public.current_org()
      and s.facility_id=facility and b.order_id=plan_id) then
    raise exception 'Invalid linked task';
  elsif link_type='production_lot' and not exists(
    select 1 from public.production_lots l where l.id=link_id
      and l.organization_id=public.current_org() and l.facility_id=facility
      and l.order_id=plan_id and l.status='Assigned') then
    raise exception 'Invalid linked task';
  elsif link_type is not null and link_type not in ('production_plan','order',
    'planned_mixer_batch','planned_spice_preparation','production_lot') then
    raise exception 'Invalid linked task'; end if;
  perform public.check_workforce_conflict(facility,requested_event_id,starts,
    ends,selected_employees,override_reason);
  select * into prior from public.workforce_schedule_events where id=requested_event_id for update;
  if prior.id is null then
    if requested_revision is distinct from 0 then raise exception 'Schedule changed; reload and try again'; end if;
    insert into public.workforce_schedule_events(id,organization_id,facility_id,start_on,end_on,start_at,end_at,all_day,timezone,
      kind,required_worker_count,title,production_plan_id,linked_task_type,linked_task_id,
      product_id,customer_id,location_label,availability_override_reason,
      created_by,updated_by)
    values(requested_event_id,public.current_org(),facility,requested_start,requested_end,starts,ends,all_day_value,timezone_value,
      kind_value,required_workers,title_value,plan_id,link_type,link_id,
      product_id_value,customer_id_value,location_value,override_reason,auth.uid(),auth.uid());
  else
    if prior.organization_id<>public.current_org() or prior.facility_id<>facility then
      raise exception 'Invalid facility scope'; end if;
    if prior.revision is distinct from requested_revision then raise exception 'Schedule changed; reload and try again'; end if;
    before_snapshot:=to_jsonb(prior)||jsonb_build_object('employee_ids',
      (select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
       from public.workforce_schedule_assignments a where a.event_id=requested_event_id));
    update public.workforce_schedule_events set start_on=requested_start,end_on=requested_end,
      start_at=starts,end_at=ends,all_day=all_day_value,timezone=timezone_value,
      kind=kind_value,required_worker_count=required_workers,title=title_value,production_plan_id=plan_id,linked_task_type=link_type,
      linked_task_id=link_id,product_id=product_id_value,customer_id=customer_id_value,
      location_label=location_value,availability_override_reason=override_reason,
      revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=requested_event_id;
    delete from public.workforce_schedule_assignments where event_id=requested_event_id;
  end if;
  insert into public.workforce_schedule_assignments(organization_id,facility_id,event_id,employee_id)
    select public.current_org(),facility,requested_event_id,id from unnest(selected_employees) id;
  select to_jsonb(e)||jsonb_build_object('employee_ids',
    (select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
     from public.workforce_schedule_assignments a where a.event_id=e.id)) into after_snapshot
    from public.workforce_schedule_events e where e.id=requested_event_id;
  insert into public.workforce_schedule_history(organization_id,facility_id,event_id,action,
    actor_user_id,before_data,after_data)
  values(public.current_org(),facility,requested_event_id,
    case when prior.id is null then 'created' else 'updated' end,auth.uid(),before_snapshot,after_snapshot);
  return requested_event_id;
end $$;

create or replace function public.publish_workforce_schedule(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare facility uuid := (payload->>'facility_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  current_revision integer;
  next_revision integer;
  draft record;
  assigned uuid[];
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  perform public.lock_workforce_facility(facility);
  select coalesce(max(revision),0) into current_revision from public.workforce_publications
    where organization_id=public.current_org() and facility_id=facility;
  if requested_revision is distinct from current_revision then
    raise exception 'Schedule changed; reload and try again'; end if;
  for draft in select * from public.workforce_schedule_events e
    where e.organization_id=public.current_org() and e.facility_id=facility loop
    select coalesce(array_agg(a.employee_id),array[]::uuid[]) into assigned
      from public.workforce_schedule_assignments a where a.event_id=draft.id;
    perform public.check_workforce_conflict(facility,draft.id,draft.start_at,draft.end_at,
      assigned,draft.availability_override_reason);
  end loop;
  next_revision:=current_revision+1;
  insert into public.workforce_publications(organization_id,facility_id,revision,published_by)
    values(public.current_org(),facility,next_revision,auth.uid());
  insert into public.workforce_published_events(organization_id,facility_id,publication_revision,
    event_id,start_on,end_on,start_at,end_at,all_day,timezone,kind,required_worker_count,title,production_plan_id,linked_task_type,linked_task_id,
    product_id,customer_id,location_label,employee_ids)
  select e.organization_id,e.facility_id,next_revision,e.id,e.start_on,e.end_on,e.start_at,e.end_at,e.all_day,e.timezone,e.kind,e.required_worker_count,e.title,
    e.production_plan_id,e.linked_task_type,e.linked_task_id,
    e.product_id,e.customer_id,e.location_label,
    (select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
     from public.workforce_schedule_assignments a where a.event_id=e.id)
  from public.workforce_schedule_events e where e.organization_id=public.current_org()
    and e.facility_id=facility;
  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,
    event_type,before_data,after_data)
  values(public.current_org(),auth.uid(),'facilities',facility,'WORKFORCE_SCHEDULE_PUBLISHED',
    jsonb_build_object('revision',current_revision),jsonb_build_object('revision',next_revision));
  return facility;
end $$;

create or replace function public.save_workforce_pto(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
  facility uuid := (payload->>'facility_id')::uuid;
  employee uuid := (payload->>'employee_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  first_minute integer := (payload->>'start_minute')::integer;
  last_minute integer := (payload->>'end_minute')::integer;
  note_value text := coalesce(payload->>'private_note','');
  type_id uuid := (payload->>'pto_type_id')::uuid;
  zone text;
  prior public.workforce_pto_blocks%rowtype;
  conflicting_title text;
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  perform public.lock_workforce_facility(facility);
  if requested_id is null or requested_start is null or requested_end is null
    or first_minute is null or last_minute is null
    or requested_end<=requested_start or requested_end>requested_start+366
    or first_minute not between 0 and 1439 or last_minute not between 1 and 1440
    or last_minute<=first_minute or length(note_value)>500 then raise exception 'Invalid PTO range'; end if;
  if not exists(select 1 from public.profiles p where p.id=employee
    and p.organization_id=public.current_org() and p.facility_id=facility and p.active) then
    raise exception 'Invalid employee selection'; end if;
  select f.timezone into zone from public.facilities f where f.id=facility;
  if type_id is null or not exists(select 1 from public.workforce_pto_types t
    where t.id=type_id and t.organization_id=public.current_org() and t.active) then
    raise exception 'Invalid PTO type'; end if;
  select e.title into conflicting_title from public.workforce_schedule_events e
    join public.workforce_schedule_assignments a on a.event_id=e.id
    where e.organization_id=public.current_org() and e.facility_id=facility
      and a.employee_id=employee and exists(select 1 from public.workforce_pto_intervals(requested_start,requested_end,first_minute,last_minute,zone) t
        where e.start_at<t.end_at and e.end_at>t.start_at) limit 1;
  if found then raise exception 'PTO conflicts with scheduled work: %',conflicting_title; end if;
  select e.title into conflicting_title from public.workforce_published_events e
    where e.organization_id=public.current_org() and e.facility_id=facility
      and e.publication_revision=(select max(p.revision) from public.workforce_publications p
        where p.facility_id=facility)
      and e.employee_ids @> jsonb_build_array(employee)
      and exists(select 1 from public.workforce_pto_intervals(requested_start,requested_end,first_minute,last_minute,zone) t
        where e.start_at<t.end_at and e.end_at>t.start_at) limit 1;
  if found then raise exception 'PTO conflicts with published work: %',conflicting_title; end if;
  select * into prior from public.workforce_pto_blocks where id=requested_id for update;
  if prior.id is null then
    if requested_revision is distinct from 0 then raise exception 'PTO changed; reload and try again'; end if;
    insert into public.workforce_pto_blocks(id,organization_id,facility_id,employee_id,
      start_on,end_on,start_minute,end_minute,private_note,pto_type_id,updated_by)
    values(requested_id,public.current_org(),facility,employee,requested_start,
      requested_end,first_minute,last_minute,note_value,type_id,auth.uid());
  else
    if prior.organization_id<>public.current_org() or prior.facility_id<>facility
      or prior.revision is distinct from requested_revision then raise exception 'PTO changed; reload and try again'; end if;
    update public.workforce_pto_blocks set employee_id=employee,start_on=requested_start,
      end_on=requested_end,start_minute=first_minute,end_minute=last_minute,
      private_note=note_value,pto_type_id=type_id,status='approved',revision=revision+1,
      updated_by=auth.uid(),updated_at=now() where id=requested_id;
  end if;
  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,
    before_data,after_data)
  values(public.current_org(),auth.uid(),'workforce_pto_blocks',requested_id,'PTO_SAVED',
    case when prior.id is null then null else to_jsonb(prior) end,
    (select to_jsonb(b) from public.workforce_pto_blocks b where b.id=requested_id));
  return requested_id;
end $$;

create or replace function public.get_workforce_schedule(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  result jsonb;
begin
  if not public.has_permission('workforce.read') then raise exception 'Workforce read permission required'; end if;
  if requested_facility is distinct from public.current_facility() then raise exception 'Invalid facility scope'; end if;
  if requested_end<=requested_start or requested_end>requested_start+366 then raise exception 'Invalid schedule range'; end if;
  select jsonb_build_object(
    'facility',jsonb_build_object('id',f.id,'name',f.name,'timezone',f.timezone,
      'weekly_capacity_hours',f.weekly_capacity_hours,'schedule_granularity',f.schedule_granularity),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,
      'first_name',p.first_name,'last_name',p.last_name,'available_days',
      coalesce(a.available_days,array[1,2,3,4,5])) order by p.last_name,p.first_name,p.id)
      from public.profiles p left join public.workforce_availability a on a.employee_id=p.id
      where p.organization_id=f.organization_id and p.facility_id=f.id and p.active),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'facility_id',e.facility_id,
      'revision',e.revision,'start_on',e.start_on,'end_on',e.end_on,'start_at',e.start_at,'end_at',e.end_at,'all_day',e.all_day,'timezone',e.timezone,'kind',e.kind,
      'required_worker_count',e.required_worker_count,'title',e.title,
      'production_plan_id',e.production_plan_id,'linked_task_type',e.linked_task_type,
      'linked_task_id',e.linked_task_id,'product_id',e.product_id,
      'customer_id',e.customer_id,'location_label',e.location_label,
      'availability_override_reason',e.availability_override_reason,
      'employee_ids',(select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
        from public.workforce_schedule_assignments a where a.event_id=e.id),
      'created_at',e.created_at,'updated_at',e.updated_at) order by e.start_on,e.id)
      from public.workforce_schedule_events e where e.organization_id=f.organization_id
      and e.facility_id=f.id and e.start_on<requested_end and e.end_on>requested_start),'[]'::jsonb),
    'published_events',coalesce((select jsonb_agg(jsonb_build_object('id',e.event_id,
      'start_on',e.start_on,'end_on',e.end_on,'start_at',e.start_at,'end_at',e.end_at,
      'all_day',e.all_day,'timezone',e.timezone,'kind',e.kind,
      'required_worker_count',e.required_worker_count,'title',e.title,
      'production_plan_id',e.production_plan_id,'linked_task_type',e.linked_task_type,
      'linked_task_id',e.linked_task_id,'product_id',e.product_id,
      'customer_id',e.customer_id,'location_label',e.location_label,
      'employee_ids',e.employee_ids)
      order by e.start_on,e.event_id)
      from public.workforce_published_events e where e.facility_id=f.id
      and e.publication_revision=(select max(p.revision) from public.workforce_publications p
        where p.facility_id=f.id) and e.start_on<requested_end and e.end_on>requested_start),'[]'::jsonb),
    'publication_revision',coalesce((select max(p.revision) from public.workforce_publications p
      where p.facility_id=f.id),0),
    'pto_types',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'sort_order',t.sort_order,'active',t.active) order by t.sort_order,t.name) from public.workforce_pto_types t where t.organization_id=f.organization_id),'[]'::jsonb),
    'pto',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'facility_id',b.facility_id,'employee_id',b.employee_id,
      'start_on',b.start_on,'end_on',b.end_on,'start_minute',b.start_minute,
      'end_minute',b.end_minute,'pto_type_id',b.pto_type_id,'revision',b.revision)
      order by b.start_on,b.id) from public.workforce_pto_blocks b
      where b.organization_id=f.organization_id and b.facility_id=f.id and b.status='approved'
      and b.start_on<requested_end and b.end_on>requested_start),'[]'::jsonb),
    'linked_tasks',coalesce((select jsonb_agg(jsonb_build_object('type',task.type,
      'id',task.id,'production_plan_id',task.plan_id,'label',task.label)
      order by task.label,task.id) from (
      select 'production_plan'::text type,p.id,p.id plan_id,
        'Production plan '||left(p.id::text,8) label from public.order_production_plans p
        where p.organization_id=f.organization_id and p.facility_id=f.id and p.status<>'Cancelled'
      union all
      select 'planned_mixer_batch',b.id,b.order_id,
        'Mixer batch '||b.sequence||' · '||left(b.id::text,8)
        from public.planned_mixer_batches b where b.organization_id=f.organization_id
          and b.facility_id=f.id
      union all
      select 'planned_spice_preparation',s.id,b.order_id,
        'Spice prep for mixer '||b.sequence||' · '||left(s.id::text,8)
        from public.planned_spice_preparations s
        join public.planned_mixer_batches b on b.id=s.planned_mixer_batch_id
        where s.organization_id=f.organization_id and s.facility_id=f.id
      union all
      select 'production_lot',l.id,l.order_id,
        'Lot '||l.production_lot_code||' · '||left(l.id::text,8)
        from public.production_lots l where l.organization_id=f.organization_id
          and l.facility_id=f.id and l.status='Assigned'
    ) task),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)
      order by p.name) from public.products p where p.organization_id=f.organization_id
      and p.active),'[]'::jsonb),
    'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)
      order by c.name) from public.customers c where c.organization_id=f.organization_id),'[]'::jsonb),
    'production_plans',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'start_on',pp.start_on,
      'finish_on',pp.finish_on,'status',pp.status) order by pp.start_on,pp.id)
      from public.order_production_plans pp where pp.organization_id=f.organization_id
      and pp.facility_id=f.id and pp.status<>'Cancelled' and pp.start_on<requested_end
      and pp.finish_on>=requested_start),'[]'::jsonb)
  ) into result from public.facilities f where f.organization_id=public.current_org()
    and f.id=requested_facility and f.active;
  if result is null then raise exception 'Facility unavailable'; end if;
  return result;
end $$;

create or replace function public.get_my_workforce_schedule(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  actor public.profiles%rowtype;
begin
  select p.* into actor from public.profiles p join public.organizations o on o.id=p.organization_id
    join public.access_profiles ap on ap.id=p.access_profile_id
      and ap.organization_id=p.organization_id
    where p.id=auth.uid() and p.active and o.status='active' and ap.active;
  if actor.id is null or actor.facility_id is null then raise exception 'Active worker required'; end if;
  if requested_end<=requested_start or requested_end>requested_start+366 then raise exception 'Invalid schedule range'; end if;
  return jsonb_build_object(
    'timezone',(select f.timezone from public.facilities f where f.id=actor.facility_id),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.event_id,'start_on',e.start_on,
      'end_on',e.end_on,'start_at',e.start_at,'end_at',e.end_at,'all_day',e.all_day,'timezone',e.timezone,'kind',e.kind,
      'required_worker_count',e.required_worker_count,'title',e.title,'production_plan_id',e.production_plan_id,
      'linked_task_type',e.linked_task_type,'linked_task_id',e.linked_task_id,
      'location_label',e.location_label,
      'customer_name',(select c.name from public.customers c where c.id=e.customer_id),
      'product_name',case
        when e.product_id is not null then
          (select p.name from public.products p where p.id=e.product_id)
        when e.linked_task_type='planned_mixer_batch' then
          (select p.name from public.planned_mixer_batches b join public.products p on p.id=b.product_id
            where b.id=e.linked_task_id)
        when e.linked_task_type='planned_spice_preparation' then
          (select p.name from public.planned_spice_preparations s
            join public.planned_mixer_batches b on b.id=s.planned_mixer_batch_id
            join public.products p on p.id=b.product_id where s.id=e.linked_task_id)
        when e.linked_task_type='production_lot' then
          (select p.name from public.production_lots l join public.products p on p.id=l.product_id
            where l.id=e.linked_task_id) end,
      'lot_code',case
        when e.linked_task_type='production_lot' then
          (select l.production_lot_code from public.production_lots l where l.id=e.linked_task_id)
        when e.linked_task_type='planned_mixer_batch' then
          (select l.production_lot_code from public.planned_mixer_batches b
            join public.production_lots l on l.id=b.production_lot_id where b.id=e.linked_task_id)
        when e.linked_task_type='planned_spice_preparation' then
          (select l.production_lot_code from public.planned_spice_preparations s
            join public.planned_mixer_batches b on b.id=s.planned_mixer_batch_id
            join public.production_lots l on l.id=b.production_lot_id where s.id=e.linked_task_id) end,
      'batch_sequence',case
        when e.linked_task_type='planned_mixer_batch' then
          (select b.sequence from public.planned_mixer_batches b where b.id=e.linked_task_id)
        when e.linked_task_type='planned_spice_preparation' then
          (select b.sequence from public.planned_spice_preparations s
            join public.planned_mixer_batches b on b.id=s.planned_mixer_batch_id
            where s.id=e.linked_task_id) end)
      order by e.start_on,e.event_id) from public.workforce_published_events e
      where e.organization_id=actor.organization_id and e.facility_id=actor.facility_id
      and e.publication_revision=(select max(p.revision) from public.workforce_publications p
        where p.facility_id=actor.facility_id)
      and e.employee_ids @> jsonb_build_array(actor.id)
      and e.start_on<requested_end and e.end_on>requested_start),'[]'::jsonb),
    'pto',coalesce((select jsonb_agg(jsonb_build_object('start_on',b.start_on,
      'end_on',b.end_on,'start_minute',b.start_minute,'end_minute',b.end_minute)
      order by b.start_on) from public.workforce_pto_blocks b
      where b.employee_id=actor.id and b.organization_id=actor.organization_id
        and b.facility_id=actor.facility_id and b.status='approved'
        and b.start_on<requested_end and b.end_on>requested_start),'[]'::jsonb));
end $$;

-- Remove the retired date-only conflict routine after replacing every caller.
drop function public.check_workforce_conflict(uuid,uuid,date,date,uuid[],text);

-- Replacements retain their grants; explicitly repeat the API boundary for review.
revoke all on function public.save_workforce_schedule_event(jsonb),
  public.publish_workforce_schedule(jsonb),public.save_workforce_pto(jsonb),
  public.get_workforce_schedule(jsonb),public.get_my_workforce_schedule(jsonb) from public,anon,authenticated;
grant execute on function public.save_workforce_schedule_event(jsonb),
  public.publish_workforce_schedule(jsonb),public.save_workforce_pto(jsonb),
  public.get_workforce_schedule(jsonb),public.get_my_workforce_schedule(jsonb) to authenticated;
commit;
