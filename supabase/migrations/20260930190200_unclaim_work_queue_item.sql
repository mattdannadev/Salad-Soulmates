alter table public.workforce_work_queue_history
  drop constraint workforce_work_queue_history_action_check,
  add constraint workforce_work_queue_history_action_check
    check (action in ('created', 'published', 'claimed', 'unclaimed', 'cancelled', 'completed'));

create function public.unclaim_workforce_work_queue_item(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_item_id uuid := (payload->>'id')::uuid;
  requested_revision integer := (payload->>'revision')::integer;
  item public.workforce_work_queue_items%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  if not exists (select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.organization_id = public.current_org()
      and profile.facility_id = public.current_facility() and profile.active) then
    raise exception 'Active plant worker profile required';
  end if;
  select * into item from public.workforce_work_queue_items q
    where q.id = requested_item_id and q.organization_id = public.current_org()
      and q.facility_id = public.current_facility() for update;
  if item.id is null or item.publication_state <> 'published' or item.status not in ('available', 'claimed') then
    raise exception 'Work item unavailable';
  end if;
  if item.revision is distinct from requested_revision then raise exception 'Work queue changed; reload and try again'; end if;
  if not exists (select 1 from public.workforce_work_queue_claims claim
    where claim.queue_item_id = item.id and claim.worker_id = auth.uid() and claim.claim_source = 'worker_claimed') then
    raise exception 'You have not claimed this work item';
  end if;
  before_snapshot := jsonb_build_object('item', to_jsonb(item), 'claims', coalesce((
    select jsonb_agg(jsonb_build_object('worker_id', claim.worker_id, 'claim_source', claim.claim_source, 'claimed_at', claim.claimed_at) order by claim.claimed_at)
    from public.workforce_work_queue_claims claim where claim.queue_item_id = item.id
  ), '[]'::jsonb));
  delete from public.workforce_work_queue_claims claim
    where claim.queue_item_id = item.id and claim.worker_id = auth.uid() and claim.claim_source = 'worker_claimed';
  update public.workforce_work_queue_items queue_item set
    status = case when exists (select 1 from public.workforce_work_queue_claims claim where claim.queue_item_id = item.id) then 'claimed' else 'available' end,
    updated_by = auth.uid(), updated_at = now(), revision = queue_item.revision + 1
    where queue_item.id = item.id;
  select jsonb_build_object('item', to_jsonb(queue_item), 'claims', coalesce((
    select jsonb_agg(jsonb_build_object('worker_id', claim.worker_id, 'claim_source', claim.claim_source, 'claimed_at', claim.claimed_at) order by claim.claimed_at)
    from public.workforce_work_queue_claims claim where claim.queue_item_id = item.id
  ), '[]'::jsonb)) into after_snapshot from public.workforce_work_queue_items queue_item where queue_item.id = item.id;
  insert into public.workforce_work_queue_history(organization_id, facility_id, queue_item_id, action, actor_user_id, before_data, after_data)
    values (public.current_org(), public.current_facility(), item.id, 'unclaimed', auth.uid(), before_snapshot, after_snapshot);
  return item.id;
end $$;

revoke all on function public.unclaim_workforce_work_queue_item(jsonb) from public, anon;
grant execute on function public.unclaim_workforce_work_queue_item(jsonb) to authenticated;
