begin;

-- Keep the day-level customer commitment when a work-order date changes. The
-- original procedure owns schedule validation; this wrapper persists the
-- optional planning metadata after that validated mutation succeeds.
alter function public.save_workforce_schedule_event(jsonb)
  rename to save_workforce_schedule_event_base;

create function public.save_workforce_schedule_event(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
declare requested_batch_count numeric;
begin
  saved_id := public.save_workforce_schedule_event_base(payload);
  if payload ? 'planned_batch_count' then
    requested_batch_count := nullif(payload->>'planned_batch_count', '')::numeric;
    if requested_batch_count is not null and requested_batch_count <= 0 then
      raise exception 'Invalid planned batch count';
    end if;
    update public.workforce_schedule_events
      set planned_batch_count = requested_batch_count
      where id = saved_id and organization_id = public.current_org()
        and facility_id = public.current_facility();
  end if;
  return saved_id;
end $$;

revoke all on function public.save_workforce_schedule_event(jsonb) from public, anon, authenticated;
grant execute on function public.save_workforce_schedule_event(jsonb) to authenticated;

commit;
