begin;

create function public.get_mobile_work_order_tasks(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare work_id uuid := (payload->>'work_order_id')::uuid; work public.workforce_work_queue_items%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object' or payload - 'work_order_id' <> '{}'::jsonb or work_id is null then raise exception 'Choose a valid work order'; end if;
  select * into work from public.workforce_work_queue_items item where item.organization_id=public.current_org() and item.facility_id=public.current_facility() and item.id=work_id;
  if work.id is null or not exists (select 1 from public.workforce_work_queue_claims claim where claim.organization_id=work.organization_id and claim.facility_id=work.facility_id and claim.queue_item_id=work.id and claim.worker_id=auth.uid()) then raise exception 'Assigned work order required'; end if;
  return jsonb_build_object('work_order',jsonb_build_object('id',work.id,'title',work.title,'kind',work.kind,'status',work.status),'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',task.id,'title',task.title,'required',task.required,'sequence',task.sequence,'completed_at',task.completed_at,'completed_by',task.completed_by) order by task.sequence,task.id) from public.work_order_tasks task where task.organization_id=work.organization_id and task.facility_id=work.facility_id and task.work_order_id=work.id),'[]'::jsonb));
end $$;

create function public.set_mobile_work_order_task(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare task_id uuid := (payload->>'task_id')::uuid; work_id uuid := (payload->>'work_order_id')::uuid; requested boolean := (payload->>'completed')::boolean; task public.work_order_tasks%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object' or payload ?& array['work_order_id','task_id','completed'] is false or task_id is null or work_id is null or requested is null then raise exception 'Choose a valid task update'; end if;
  if not exists (select 1 from public.workforce_work_queue_claims claim where claim.organization_id=public.current_org() and claim.facility_id=public.current_facility() and claim.queue_item_id=work_id and claim.worker_id=auth.uid()) then raise exception 'Assigned work order required'; end if;
  update public.work_order_tasks set completed_by=case when requested then auth.uid() else null end, completed_at=case when requested then now() else null end where organization_id=public.current_org() and facility_id=public.current_facility() and id=task_id and work_order_id=work_id returning * into task;
  if task.id is null then raise exception 'Task unavailable'; end if;
  return jsonb_build_object('id',task.id,'title',task.title,'required',task.required,'sequence',task.sequence,'completed_at',task.completed_at,'completed_by',task.completed_by);
end $$;

create function public.complete_mobile_work_order(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare work_id uuid := (payload->>'work_order_id')::uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' or payload - 'work_order_id' <> '{}'::jsonb or work_id is null then raise exception 'Choose a valid work order'; end if;
  if not exists (select 1 from public.workforce_work_queue_claims claim where claim.organization_id=public.current_org() and claim.facility_id=public.current_facility() and claim.queue_item_id=work_id and claim.worker_id=auth.uid()) then raise exception 'Assigned work order required'; end if;
  if exists (select 1 from public.work_order_tasks task where task.organization_id=public.current_org() and task.facility_id=public.current_facility() and task.work_order_id=work_id and task.required and task.completed_at is null) then raise exception 'Complete all required tasks before closing work'; end if;
  update public.workforce_work_queue_items set status='completed',completed_by=auth.uid(),completed_at=now(),revision=revision+1 where organization_id=public.current_org() and facility_id=public.current_facility() and id=work_id and status in ('available','claimed') returning id into work_id;
  if work_id is null then raise exception 'Work order unavailable'; end if; return work_id;
end $$;
revoke all on function public.get_mobile_work_order_tasks(jsonb),public.set_mobile_work_order_task(jsonb),public.complete_mobile_work_order(jsonb) from public,anon;
grant execute on function public.get_mobile_work_order_tasks(jsonb),public.set_mobile_work_order_task(jsonb),public.complete_mobile_work_order(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
