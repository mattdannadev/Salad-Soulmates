begin;

create or replace function public.set_mobile_work_order_task(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  task_id uuid := (payload->>'task_id')::uuid;
  work_id uuid := (payload->>'work_order_id')::uuid;
  requested boolean := (payload->>'completed')::boolean;
  work public.workforce_work_queue_items%rowtype;
  task public.work_order_tasks%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object' or payload ?& array['work_order_id','task_id','completed'] is false or task_id is null or work_id is null or requested is null then
    raise exception 'Choose a valid task update';
  end if;

  select * into work from public.workforce_work_queue_items item
    where item.organization_id = public.current_org() and item.facility_id = public.current_facility() and item.id = work_id
    for update;
  if work.id is null or work.status <> 'claimed' or work.publication_state <> 'published' then raise exception 'Work order unavailable'; end if;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid() and profile.organization_id = work.organization_id and profile.facility_id = work.facility_id and profile.active)
    or not exists (select 1 from public.facilities facility where facility.organization_id = work.organization_id and facility.id = work.facility_id and facility.active) then
    raise exception 'Active plant worker profile required';
  end if;
  if not exists (select 1 from public.workforce_work_queue_claims claim where claim.organization_id = work.organization_id and claim.facility_id = work.facility_id and claim.queue_item_id = work.id and claim.worker_id = auth.uid()) then
    raise exception 'Assigned work order required';
  end if;

  update public.work_order_tasks set
    completed_by = case when requested then auth.uid() else null end,
    completed_at = case when requested then now() else null end
    where organization_id = work.organization_id and facility_id = work.facility_id and id = task_id and work_order_id = work.id
    returning * into task;
  if task.id is null then raise exception 'Task unavailable'; end if;
  return jsonb_build_object('id', task.id, 'title', task.title, 'required', task.required, 'sequence', task.sequence, 'completed_at', task.completed_at, 'completed_by', task.completed_by);
end $$;

create or replace function public.complete_mobile_work_order(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  work_id uuid := (payload->>'work_order_id')::uuid;
  work public.workforce_work_queue_items%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' or payload - 'work_order_id' <> '{}'::jsonb or work_id is null then
    raise exception 'Choose a valid work order';
  end if;

  select * into work from public.workforce_work_queue_items item
    where item.organization_id = public.current_org() and item.facility_id = public.current_facility() and item.id = work_id
    for update;
  if work.id is null or work.status <> 'claimed' or work.publication_state <> 'published' then raise exception 'Work order unavailable'; end if;
  if not exists (select 1 from public.profiles profile where profile.id = auth.uid() and profile.organization_id = work.organization_id and profile.facility_id = work.facility_id and profile.active)
    or not exists (select 1 from public.facilities facility where facility.organization_id = work.organization_id and facility.id = work.facility_id and facility.active) then
    raise exception 'Active plant worker profile required';
  end if;
  if work.kind in ('ingredient_prep', 'mixing') then
    raise exception 'Use the dedicated production completion workflow';
  end if;
  if not exists (select 1 from public.workforce_work_queue_claims claim where claim.organization_id = work.organization_id and claim.facility_id = work.facility_id and claim.queue_item_id = work.id and claim.worker_id = auth.uid()) then
    raise exception 'Assigned work order required';
  end if;
  if exists (select 1 from public.work_order_tasks task where task.organization_id = work.organization_id and task.facility_id = work.facility_id and task.work_order_id = work.id and task.required and task.completed_at is null) then
    raise exception 'Complete all required tasks before closing work';
  end if;

  before_snapshot := to_jsonb(work);
  update public.workforce_work_queue_items as queue set status = 'completed', completed_by = auth.uid(), completed_at = now(), updated_by = auth.uid(), updated_at = now(), revision = revision + 1
    where queue.id = work.id
    returning queue.id, to_jsonb(queue) into work_id, after_snapshot;
  insert into public.workforce_work_queue_history(
    organization_id, facility_id, queue_item_id, action, actor_user_id, before_data, after_data
  ) values (
    work.organization_id, work.facility_id, work.id, 'completed', auth.uid(), before_snapshot, after_snapshot
  );
  return work_id;
end $$;

notify pgrst, 'reload schema';
commit;
