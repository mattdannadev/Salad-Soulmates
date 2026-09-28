-- Facility-local, all-day worker assignments. Dates use an exclusive end boundary.
begin;

-- A disabled access profile must revoke its permissions immediately, including
-- when a still-active user retains a reference to that profile.
create or replace function public.has_permission(requested text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id
    join public.access_profiles ap on ap.id = p.access_profile_id
      and ap.organization_id = p.organization_id
    join public.access_profile_permissions app on app.access_profile_id = ap.id
      and app.organization_id = ap.organization_id
    where p.id = (select auth.uid()) and p.active and o.status = 'active'
      and ap.active and app.permission_code = requested
  )
$$;

alter table public.facilities
  add column weekly_capacity_hours numeric(5,2) not null default 40
    check (weekly_capacity_hours > 0 and weekly_capacity_hours <= 168
      and weekly_capacity_hours * 4 = trunc(weekly_capacity_hours * 4)),
  add column schedule_granularity text not null default 'day'
    check (schedule_granularity in ('day', 'hour'));
alter table public.profiles add unique(organization_id,facility_id,id);

-- These profiles deliberately use the restricted reviewer base role. Workforce
-- permissions grant their scheduling capability, while legacy role-based policies
-- cannot accidentally make a Scheduler an administrator.
insert into public.access_profiles(organization_id,name,description,base_role,is_system)
select id,'Scheduler','Facility workforce scheduling','reviewer',true
from public.organizations
on conflict (organization_id,name) do nothing;
insert into public.access_profiles(organization_id,name,description,base_role,is_system)
select id,'Operations Manager','Production and workforce operations','reviewer',true
from public.organizations
on conflict (organization_id,name) do nothing;
insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
select p.organization_id,p.id,x.permission_code
from public.access_profiles p
cross join (values ('workforce.read'),('workforce.manage')) x(permission_code)
where p.name = 'Scheduler' and p.is_system
on conflict do nothing;
insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
select p.organization_id,p.id,x.permission_code
from public.access_profiles p
cross join (values ('dashboard.read'),('orders.read'),('planning.read'),('planning.write'),('workforce.read'),('workforce.manage')) x(permission_code)
where p.name = 'Operations Manager' and p.is_system
on conflict do nothing;

-- The platform provisioning function creates organizations after this migration.
create function public.seed_new_organization_scheduler_profiles() returns trigger
language plpgsql security definer set search_path = '' as $$
declare scheduler_id uuid; manager_id uuid;
begin
  insert into public.access_profiles(organization_id,name,description,base_role,is_system)
  values(new.id,'Scheduler','Facility workforce scheduling','reviewer',true)
  returning id into scheduler_id;
  insert into public.access_profiles(organization_id,name,description,base_role,is_system)
  values(new.id,'Operations Manager','Production and workforce operations','reviewer',true)
  returning id into manager_id;
  insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
  values (new.id,scheduler_id,'workforce.read'),(new.id,scheduler_id,'workforce.manage');
  insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
  values (new.id,manager_id,'dashboard.read'),(new.id,manager_id,'orders.read'),
    (new.id,manager_id,'planning.read'),(new.id,manager_id,'planning.write'),
    (new.id,manager_id,'workforce.read'),(new.id,manager_id,'workforce.manage');
  return new;
end $$;
create trigger seed_new_organization_scheduler_profiles
after insert on public.organizations for each row
execute function public.seed_new_organization_scheduler_profiles();
revoke all on function public.seed_new_organization_scheduler_profiles() from public,anon,authenticated;

create table public.workforce_schedule_events (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  start_on date not null,
  end_on date not null check (end_on > start_on),
  kind text not null check (kind in ('mixing','spices','making_product','cleaning','off','other')),
  title text not null default '' check (length(trim(title)) <= 120),
  production_plan_id uuid,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id,facility_id,id),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id),
  foreign key (organization_id,facility_id,production_plan_id)
    references public.order_production_plans(organization_id,facility_id,id)
);
create index workforce_schedule_events_range
  on public.workforce_schedule_events(facility_id,start_on,end_on);

create table public.workforce_schedule_assignments (
  organization_id uuid not null,
  facility_id uuid not null,
  event_id uuid not null,
  employee_id uuid not null,
  primary key(event_id,employee_id),
  foreign key (organization_id,facility_id,event_id)
    references public.workforce_schedule_events(organization_id,facility_id,id) on delete cascade,
  foreign key (organization_id,facility_id,employee_id)
    references public.profiles(organization_id,facility_id,id)
);
create index workforce_schedule_assignments_employee
  on public.workforce_schedule_assignments(facility_id,employee_id,event_id);

create table public.workforce_schedule_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  event_id uuid not null,
  action text not null check (action in ('created','updated','deleted')),
  actor_user_id uuid not null references auth.users(id),
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id)
);
create index workforce_schedule_history_event
  on public.workforce_schedule_history(organization_id,facility_id,event_id,occurred_at desc);

alter table public.workforce_schedule_events enable row level security;
alter table public.workforce_schedule_assignments enable row level security;
alter table public.workforce_schedule_history enable row level security;
create policy workforce_schedule_events_read on public.workforce_schedule_events for select to authenticated
  using (organization_id=public.current_org() and facility_id=public.current_facility()
    and public.has_permission('workforce.read'));
create policy workforce_schedule_assignments_read on public.workforce_schedule_assignments for select to authenticated
  using (organization_id=public.current_org() and facility_id=public.current_facility()
    and public.has_permission('workforce.read'));
create policy workforce_schedule_history_read on public.workforce_schedule_history for select to authenticated
  using (organization_id=public.current_org() and facility_id=public.current_facility()
    and public.has_permission('audit.read'));
revoke all on public.workforce_schedule_events,public.workforce_schedule_assignments,
  public.workforce_schedule_history from public,anon,authenticated;
grant select on public.workforce_schedule_events,public.workforce_schedule_assignments,
  public.workforce_schedule_history to authenticated;

create function public.get_workforce_schedule(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  result jsonb;
begin
  if not public.has_permission('workforce.read') then raise exception 'Workforce read permission required'; end if;
  if requested_facility is distinct from public.current_facility() then raise exception 'Invalid facility scope'; end if;
  if requested_end <= requested_start or requested_end > requested_start + 366 then
    raise exception 'Invalid schedule range';
  end if;
  select jsonb_build_object(
    'facility',jsonb_build_object('id',f.id,'name',f.name,'timezone',f.timezone,
      'weekly_capacity_hours',f.weekly_capacity_hours,'schedule_granularity',f.schedule_granularity),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,
      'first_name',p.first_name,'last_name',p.last_name) order by p.last_name,p.first_name,p.id)
      from public.profiles p where p.organization_id=f.organization_id and p.facility_id=f.id and p.active),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'facility_id',e.facility_id,
      'revision',e.revision,'start_on',e.start_on,'end_on',e.end_on,'kind',e.kind,'title',e.title,
      'production_plan_id',e.production_plan_id,'employee_ids',
        (select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
         from public.workforce_schedule_assignments a where a.event_id=e.id),
      'created_at',e.created_at,'updated_at',e.updated_at) order by e.start_on,e.id)
      from public.workforce_schedule_events e where e.organization_id=f.organization_id
      and e.facility_id=f.id and e.start_on<requested_end and e.end_on>requested_start),'[]'::jsonb),
    'production_plans',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'start_on',pp.start_on,
      'finish_on',pp.finish_on,'status',pp.status) order by pp.start_on,pp.id)
      from public.order_production_plans pp where pp.organization_id=f.organization_id
      and pp.facility_id=f.id and pp.status<>'Cancelled' and pp.start_on<requested_end
      and pp.finish_on>=requested_start),'[]'::jsonb)
  ) into result from public.facilities f
  where f.organization_id=public.current_org() and f.id=requested_facility and f.active;
  if result is null then raise exception 'Facility unavailable'; end if;
  return result;
end $$;

create function public.save_workforce_schedule_event(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_event_id uuid := (payload->>'id')::uuid;
  facility uuid := (payload->>'facility_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  kind_value text := payload->>'kind';
  title_value text := trim(coalesce(payload->>'title',''));
  plan_id uuid := nullif(payload->>'production_plan_id','')::uuid;
  prior public.workforce_schedule_events%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
  employee uuid;
  employee_count integer;
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  if facility is distinct from public.current_facility() then raise exception 'Invalid facility scope'; end if;
  if not exists(select 1 from public.facilities f where f.organization_id=public.current_org()
    and f.id=facility and f.active) then raise exception 'Facility unavailable'; end if;
  if requested_end <= requested_start or requested_end > requested_start+366 then raise exception 'Invalid schedule range'; end if;
  if kind_value not in ('mixing','spices','making_product','cleaning','off','other')
    or length(title_value)>120 then raise exception 'Invalid schedule event'; end if;
  if jsonb_typeof(payload->'employee_ids') is distinct from 'array'
    or jsonb_array_length(payload->'employee_ids') not between 1 and 100 then
    raise exception 'Choose at least one employee';
  end if;
  select count(*) into employee_count from (
    select distinct value::uuid from jsonb_array_elements_text(payload->'employee_ids')
  ) unique_employees;
  if employee_count <> jsonb_array_length(payload->'employee_ids') then
    raise exception 'Duplicate employee assignment';
  end if;
  if exists (select 1 from jsonb_array_elements_text(payload->'employee_ids') ids(value)
    where not exists (select 1 from public.profiles p where p.id=ids.value::uuid
      and p.organization_id=public.current_org() and p.facility_id=facility and p.active)) then
    raise exception 'Invalid employee selection';
  end if;
  if plan_id is not null and not exists(select 1 from public.order_production_plans p
    where p.id=plan_id and p.organization_id=public.current_org() and p.facility_id=facility
      and p.status<>'Cancelled') then raise exception 'Invalid production plan'; end if;

  select * into prior from public.workforce_schedule_events where id=requested_event_id for update;
  if prior.id is null then
    if requested_revision is distinct from 0 then raise exception 'Schedule changed; reload and try again'; end if;
    insert into public.workforce_schedule_events(id,organization_id,facility_id,start_on,end_on,
      kind,title,production_plan_id,created_by,updated_by)
    values(requested_event_id,public.current_org(),facility,requested_start,requested_end,kind_value,title_value,
      plan_id,auth.uid(),auth.uid());
  else
    if prior.organization_id<>public.current_org() or prior.facility_id<>facility then
      raise exception 'Invalid facility scope';
    end if;
    if prior.revision is distinct from requested_revision then raise exception 'Schedule changed; reload and try again'; end if;
    before_snapshot:=to_jsonb(prior)||jsonb_build_object('employee_ids',
      (select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
       from public.workforce_schedule_assignments a where a.event_id=requested_event_id));
    update public.workforce_schedule_events set start_on=requested_start,end_on=requested_end,
      kind=kind_value,title=title_value,production_plan_id=plan_id,revision=revision+1,
      updated_by=auth.uid(),updated_at=now() where id=requested_event_id;
    delete from public.workforce_schedule_assignments where event_id=requested_event_id;
  end if;
  for employee in select value::uuid from jsonb_array_elements_text(payload->'employee_ids') loop
    insert into public.workforce_schedule_assignments(organization_id,facility_id,event_id,employee_id)
    values(public.current_org(),facility,requested_event_id,employee);
  end loop;
  select to_jsonb(e)||jsonb_build_object('employee_ids',
    (select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
     from public.workforce_schedule_assignments a where a.event_id=e.id)) into after_snapshot
    from public.workforce_schedule_events e where e.id=requested_event_id;
  insert into public.workforce_schedule_history(organization_id,facility_id,event_id,action,
    actor_user_id,before_data,after_data)
  values(public.current_org(),facility,requested_event_id,case when prior.id is null then 'created' else 'updated' end,
    auth.uid(),before_snapshot,after_snapshot);
  return requested_event_id;
end $$;

create function public.delete_workforce_schedule_event(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_event_id uuid := (payload->>'id')::uuid;
  facility uuid := (payload->>'facility_id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  prior public.workforce_schedule_events%rowtype;
  before_snapshot jsonb;
begin
  if not public.has_permission('workforce.manage') then raise exception 'Workforce management permission required'; end if;
  if facility is distinct from public.current_facility() then raise exception 'Invalid facility scope'; end if;
  select * into prior from public.workforce_schedule_events where id=requested_event_id for update;
  if prior.id is null or prior.organization_id<>public.current_org() or prior.facility_id<>facility then
    raise exception 'Schedule event unavailable';
  end if;
  if prior.revision is distinct from requested_revision then raise exception 'Schedule changed; reload and try again'; end if;
  before_snapshot:=to_jsonb(prior)||jsonb_build_object('employee_ids',
    (select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
     from public.workforce_schedule_assignments a where a.event_id=requested_event_id));
  delete from public.workforce_schedule_events where id=requested_event_id;
  insert into public.workforce_schedule_history(organization_id,facility_id,event_id,action,
    actor_user_id,before_data)
  values(public.current_org(),facility,requested_event_id,'deleted',auth.uid(),before_snapshot);
  return requested_event_id;
end $$;

create function public.save_facility_schedule_settings(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  facility uuid := (payload->>'facility_id')::uuid;
  capacity numeric := (payload->>'weekly_capacity_hours')::numeric;
  old_capacity numeric;
begin
  if not public.has_permission('settings.manage') then raise exception 'Settings permission required'; end if;
  if facility is distinct from public.current_facility() then raise exception 'Invalid facility scope'; end if;
  if capacity is null or capacity<=0 or capacity>168 or capacity*4<>trunc(capacity*4) then
    raise exception 'Invalid weekly capacity'; end if;
  select weekly_capacity_hours into old_capacity from public.facilities
    where organization_id=public.current_org() and id=facility and active for update;
  if old_capacity is null then raise exception 'Facility unavailable'; end if;
  update public.facilities set weekly_capacity_hours=capacity where id=facility;
  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data)
  values(public.current_org(),auth.uid(),'facilities',facility,'SCHEDULE_CAPACITY_CHANGED',
    jsonb_build_object('weekly_capacity_hours',old_capacity),
    jsonb_build_object('weekly_capacity_hours',capacity));
  return facility;
end $$;

revoke all on function public.get_workforce_schedule(jsonb),public.save_workforce_schedule_event(jsonb),
  public.delete_workforce_schedule_event(jsonb),public.save_facility_schedule_settings(jsonb)
  from public,anon,authenticated;
grant execute on function public.get_workforce_schedule(jsonb),public.save_workforce_schedule_event(jsonb),
  public.delete_workforce_schedule_event(jsonb),public.save_facility_schedule_settings(jsonb)
  to authenticated;
commit;
