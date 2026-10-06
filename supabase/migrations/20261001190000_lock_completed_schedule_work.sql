begin;

-- The legacy schedule projection shares IDs with canonical work orders. Keep
-- the UI contract small while making completion the authoritative lock state.
create or replace function public.get_workforce_schedule(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare base_schedule jsonb;
begin
  base_schedule := public.get_workforce_schedule_base(payload);
  return jsonb_set(
    base_schedule,
    '{events}',
    coalesce((select jsonb_agg(event || jsonb_build_object(
      'planned_batch_count', schedule_event.planned_batch_count,
      'completed', coalesce(work_order.status = 'completed', false)
    ) order by event->>'start_on', event->>'id')
      from jsonb_array_elements(base_schedule->'events') event
      join public.workforce_schedule_events schedule_event
        on schedule_event.id = (event->>'id')::uuid
      left join public.workforce_work_queue_items work_order
        on work_order.id = schedule_event.id), '[]'::jsonb)
  );
end $$;

create function public.prevent_completed_schedule_move() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.workforce_work_queue_items work_order
    where work_order.id = old.id and work_order.organization_id = public.current_org()
      and work_order.status = 'completed'
  ) then
    raise exception 'Completed work cannot be moved';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger workforce_schedule_completed_move_lock
  before update of start_on, end_on, start_at, end_at, all_day, timezone
    or delete on public.workforce_schedule_events
  for each row execute function public.prevent_completed_schedule_move();

revoke all on function public.get_workforce_schedule(jsonb) from public, anon, authenticated;
grant execute on function public.get_workforce_schedule(jsonb) to authenticated;

commit;
