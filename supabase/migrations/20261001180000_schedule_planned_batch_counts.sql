begin;

-- A work block can represent a planned portion of an order independently of
-- its executable queue quota. This lets the plan show packaging and the exact
-- daily customer commitment without inventing extra execution records.
alter table public.workforce_work_queue_items
  add column if not exists planned_batch_count numeric(10,2)
    check (planned_batch_count is null or planned_batch_count > 0);
alter table public.workforce_schedule_events
  add column if not exists planned_batch_count numeric(10,2)
    check (planned_batch_count is null or planned_batch_count > 0);

alter function public.get_workforce_schedule(jsonb)
  rename to get_workforce_schedule_base;

create function public.get_workforce_schedule(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare base_schedule jsonb;
begin
  base_schedule := public.get_workforce_schedule_base(payload);
  return jsonb_set(
    base_schedule,
    '{events}',
    coalesce((select jsonb_agg(event || jsonb_build_object(
      'planned_batch_count', schedule_event.planned_batch_count
    ) order by event->>'start_on', event->>'id')
      from jsonb_array_elements(base_schedule->'events') event
      join public.workforce_schedule_events schedule_event
        on schedule_event.id = (event->>'id')::uuid), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_workforce_schedule(jsonb) from public, anon, authenticated;
grant execute on function public.get_workforce_schedule(jsonb) to authenticated;

commit;
