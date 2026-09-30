begin;

-- A supplier's quoted PO total is captured at confirmation. Historical orders
-- remain unknown rather than being mistaken for free orders.
alter table public.purchase_drafts
  add column total_cost numeric(12,2)
  check (total_cost >= 0 and total_cost <= 1000000000);
alter table public.purchase_drafts add column placed_on date;

create or replace function public.guard_purchase_draft() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  if tg_op='INSERT' then
    if new.status<>'Draft' or new.created_by is distinct from auth.uid() or new.revision<>1
       or new.total_cost is not null or new.placed_on is not null then
      raise exception 'Create a draft before confirming inbound'; end if;
    if new.material_plan_id is not null then
      perform 1 from public.material_plans where id=new.material_plan_id and status='Active' for share;
      if not found then raise exception 'Choose an active customer order'; end if;
    end if;
    if not exists(select 1 from public.suppliers where id=new.supplier_id and active) then
      raise exception 'Choose an active supplier'; end if;
  else
    if (to_jsonb(new)-array['status','reference','note','revision','total_cost','placed_on'])
       is distinct from (to_jsonb(old)-array['status','reference','note','revision','total_cost','placed_on']) then
      raise exception 'Purchase identity, dates and snapshots are immutable'; end if;
    if new.revision<>old.revision+1 then raise exception 'Purchase changed; reload before trying again'; end if;
    if old.status='Cancelled' or new.status=old.status or (old.status='Confirmed' and new.status<>'Cancelled') or new.status='Draft' then
      raise exception 'Invalid purchase status transition'; end if;
    if new.status='Confirmed' then
      if length(trim(new.reference))<1 or not exists(select 1 from public.purchase_draft_lines where purchase_draft_id=new.id) then
        raise exception 'Enter the external order reference before confirming inbound'; end if;
      if new.total_cost is null then raise exception 'Enter the supplier quoted total cost before confirming'; end if;
      if new.placed_on is null then raise exception 'Enter the date the purchase order was placed'; end if;
    elsif new.total_cost is distinct from old.total_cost or new.placed_on is distinct from old.placed_on then
      raise exception 'Confirmed purchase details cannot be changed';
    end if;
    if new.status='Cancelled' and length(trim(new.note))<3 then raise exception 'Enter a cancellation reason'; end if;
    if new.status='Cancelled' and exists(select 1 from public.inventory_receipt_lines r join public.purchase_draft_lines l on l.id=r.purchase_draft_line_id where l.purchase_draft_id=new.id) then
      raise exception 'Received purchases cannot be cancelled'; end if;
  end if;
  return new;
end $$;

create or replace function public.change_purchase_status(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior public.purchase_drafts%rowtype;
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  select * into prior from public.purchase_drafts where id=(payload->>'id')::uuid for update;
  if not found then raise exception 'Purchase not found'; end if;
  if prior.status=payload->>'status' and prior.reference=trim(coalesce(payload->>'reference',''))
     and prior.note=trim(coalesce(payload->>'note',''))
     and prior.total_cost is not distinct from nullif(payload->>'total_cost','')::numeric
     and prior.placed_on is not distinct from nullif(payload->>'placed_on','')::date
     and prior.revision=(payload->>'revision')::integer+1 then return prior.id; end if;
  if prior.revision is distinct from (payload->>'revision')::integer then raise exception 'Purchase changed; reload before trying again'; end if;
  update public.purchase_drafts set status=payload->>'status',reference=trim(coalesce(payload->>'reference','')),
    note=trim(coalesce(payload->>'note','')),
    total_cost=nullif(payload->>'total_cost','')::numeric,
    placed_on=nullif(payload->>'placed_on','')::date,
    revision=revision+1 where id=prior.id;
  return prior.id;
end $$;

commit;
