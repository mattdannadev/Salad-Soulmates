begin;

-- Generated Work and its planner projection share an identity. Mutate both in
-- the RPC transaction, so a failed canonical validation rolls back the planner.
-- These wrappers intentionally do not run for the order hard-purge use case.
create function public.sync_generated_planner_work(event_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare event public.workforce_schedule_events%rowtype;
declare work public.workforce_work_queue_items%rowtype;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  for event in select e.* from public.workforce_schedule_events e
    where e.id = any(event_ids) and e.organization_id = public.current_org()
      and e.facility_id = public.current_facility() order by e.id
  loop
    select * into work from public.workforce_work_queue_items w
      where w.id=event.id and w.organization_id=event.organization_id
        and w.facility_id=event.facility_id for update;
    if work.id is null then continue; end if;
    if work.status='completed' or work.publication_state='cancelled' then
      raise exception 'Completed or cancelled work cannot be changed';
    end if;
    if work.kind is distinct from event.kind
      or work.linked_task_type is distinct from event.linked_task_type
      or work.linked_task_id is distinct from event.linked_task_id
      or work.product_id is distinct from event.product_id
      or work.customer_id is distinct from event.customer_id
      or (work.kind <> 'packaging' and work.batch_quota is distinct from event.planned_batch_count) then
      raise exception 'Generated work scope cannot be changed in the planner';
    end if;
    update public.workforce_work_queue_items set
      work_on=event.start_on,start_at=event.start_at,end_at=event.end_at,
      all_day=event.all_day,timezone=event.timezone,title=event.title,
      required_worker_count=event.required_worker_count,location_label=event.location_label,
      availability_override_reason=event.availability_override_reason,
      updated_by=auth.uid(),updated_at=now(),revision=revision+1
      where id=work.id;
  end loop;
end $$;

alter function public.save_workforce_schedule_event(jsonb) rename to save_workforce_schedule_event_before_work_sync;
create function public.save_workforce_schedule_event(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  -- Worker staffing for canonical Work is managed through its claim workflow.
  -- Do not silently assign only the projection and leave Work unassigned.
  if exists(select 1 from public.workforce_work_queue_items w
    where w.id=nullif(payload->>'id','')::uuid and w.organization_id=public.current_org()
      and w.facility_id=public.current_facility())
    and (select coalesce(jsonb_agg(a.employee_id order by a.employee_id),'[]'::jsonb)
      from public.workforce_schedule_assignments a where a.event_id=(payload->>'id')::uuid)
      is distinct from (select coalesce(jsonb_agg(value order by value),'[]'::jsonb)
        from jsonb_array_elements_text(payload->'employee_ids')) then
    raise exception 'Generated work staffing must be changed through Work';
  end if;
  saved_id:=public.save_workforce_schedule_event_before_work_sync(payload);
  perform public.sync_generated_planner_work(array[saved_id]);
  return saved_id;
end $$;

-- Successor-aware moves were added after some hosted installations. Wrap the
-- operation when available, but do not make proposal/deletion deployment
-- depend on an optional legacy planner capability.
do $$
begin
  if to_regprocedure('public.move_schedule_event_with_successors(jsonb)') is not null then
    execute 'alter function public.move_schedule_event_with_successors(jsonb) rename to move_schedule_event_before_work_sync';
    execute $move$
      create function public.move_schedule_event_with_successors(payload jsonb) returns uuid
      language plpgsql security definer set search_path = '' as $body$
      declare saved_id uuid;
      declare affected_ids uuid[];
      begin
        perform public.lock_workforce_facility(public.current_facility());
        saved_id:=public.move_schedule_event_before_work_sync(payload);
        with recursive downstream(id) as (
          select saved_id union
          select edge.successor_id from public.workforce_schedule_event_dependencies edge
            join downstream on downstream.id=edge.predecessor_id
            where edge.organization_id=public.current_org() and edge.facility_id=public.current_facility()
        ) select array_agg(id) into affected_ids from downstream;
        perform public.sync_generated_planner_work(affected_ids);
        return saved_id;
      end $body$
    $move$;
  end if;
end $$;

alter function public.delete_workforce_schedule_event(jsonb) rename to delete_workforce_schedule_event_before_work_sync;
create function public.delete_workforce_schedule_event(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare work public.workforce_work_queue_items%rowtype;
declare deleted_id uuid;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Workforce management permission required';
  end if;
  perform public.lock_workforce_facility((payload->>'facility_id')::uuid);
  select * into work from public.workforce_work_queue_items w
    where w.id=(payload->>'id')::uuid and w.organization_id=public.current_org()
      and w.facility_id=public.current_facility() for update;
  if work.id is not null then
    perform public.delete_work_order(jsonb_build_object('id',work.id,
      'facility_id',work.facility_id,'revision',work.revision));
  end if;
  deleted_id:=public.delete_workforce_schedule_event_before_work_sync(payload);
  return deleted_id;
end $$;

revoke all on function public.sync_generated_planner_work(uuid[]),
  public.save_workforce_schedule_event_before_work_sync(jsonb),
  public.delete_workforce_schedule_event_before_work_sync(jsonb),
  public.save_workforce_schedule_event(jsonb),
  public.delete_workforce_schedule_event(jsonb) from public,anon,authenticated;
grant execute on function public.save_workforce_schedule_event(jsonb),
  public.delete_workforce_schedule_event(jsonb) to authenticated;
do $$
begin
  if to_regprocedure('public.move_schedule_event_before_work_sync(jsonb)') is not null then
    revoke all on function public.move_schedule_event_before_work_sync(jsonb) from public,anon,authenticated;
  end if;
  if to_regprocedure('public.move_schedule_event_with_successors(jsonb)') is not null then
    revoke all on function public.move_schedule_event_with_successors(jsonb) from public,anon,authenticated;
    grant execute on function public.move_schedule_event_with_successors(jsonb) to authenticated;
  end if;
end $$;
commit;
