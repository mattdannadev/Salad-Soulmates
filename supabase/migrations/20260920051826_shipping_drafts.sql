begin;

-- Immutable preparation snapshots only. No lots, inventory postings or confirmation state.
create table public.shipping_drafts (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  order_id uuid not null,
  planned_on date not null check(planned_on between date '0001-01-01' and date '9999-12-31'),
  method text not null check(method in ('Shipment','Pickup')),
  note text not null default '' check(length(note)<=1000),
  lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 100),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  foreign key(organization_id,facility_id,order_id)
    references public.customer_orders(organization_id,facility_id,id)
);
create index shipping_drafts_order on public.shipping_drafts(organization_id,facility_id,order_id);
alter table public.shipping_drafts enable row level security;
revoke all on public.shipping_drafts from public,anon,authenticated;
grant select,insert on public.shipping_drafts to authenticated;
create policy shipping_draft_read on public.shipping_drafts for select to authenticated using (
  organization_id=(select public.current_org()) and facility_id=(select public.current_facility())
  and (select public.has_permission('orders.read')) and (select public.has_permission('planning.read'))
);
create policy shipping_draft_insert on public.shipping_drafts for insert to authenticated with check (
  organization_id=(select public.current_org()) and facility_id=(select public.current_facility())
  and (select public.has_permission('orders.read')) and (select public.has_permission('planning.read'))
  and (select public.has_permission('orders.write')) and (select public.has_permission('planning.write')) and created_by=(select auth.uid())
);

create function public.guard_shipping_draft() returns trigger
language plpgsql security invoker set search_path='' as $$
declare customer_order public.customer_orders%rowtype; material_status text;
  line jsonb; item jsonb; amount numeric;
begin
  if not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write') then raise exception 'Order preparation permission required'; end if;
  -- The shared order lock serializes draft creation with order cancellation.
  select status into material_status from public.material_plans where id=new.order_id for update;
  select * into customer_order from public.customer_orders where id=new.order_id;
  if not found or material_status is distinct from 'Active' then raise exception 'Choose an active customer order'; end if;
  if (new.organization_id,new.facility_id) is distinct from
    (customer_order.organization_id,customer_order.facility_id)
    or new.created_by is distinct from auth.uid() then raise exception 'Invalid shipping scope'; end if;
  if jsonb_typeof(new.lines) is distinct from 'array' or jsonb_array_length(new.lines) not between 1 and 100 then
    raise exception 'Choose products from this customer order'; end if;
  if (select count(distinct (entry->>'product_id')::uuid) from jsonb_array_elements(new.lines) entry)
    <>jsonb_array_length(new.lines) then raise exception 'Include each product only once'; end if;
  for line in select * from jsonb_array_elements(new.lines) loop
    if jsonb_typeof(line) is distinct from 'object' or jsonb_typeof(line->'quantity') is distinct from 'number'
      or (line - 'product_id' - 'quantity') <> '{}'::jsonb then raise exception 'Invalid shipping draft line'; end if;
    select value into item from jsonb_array_elements(customer_order.items)
      where (value->>'product_id')::uuid=(line->>'product_id')::uuid;
    if not found then raise exception 'Choose products from this customer order'; end if;
    amount := (line->>'quantity')::numeric;
    if amount<=0 or amount<>trunc(amount) or amount>1000000000 then raise exception 'Enter a positive whole-unit quantity'; end if;
    if amount>(item->>'unit_count')::numeric then raise exception 'Draft quantity exceeds ordered quantity'; end if;
  end loop;
  new.note := trim(new.note);
  new.created_at := now();
  return new;
end $$;
create trigger validate_shipping_draft before insert on public.shipping_drafts
  for each row execute function public.guard_shipping_draft();
create trigger audit_shipping_draft after insert on public.shipping_drafts
  for each row execute function public.audit_change();

create function public.save_shipping_draft(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare draft_id uuid := (payload->>'id')::uuid; previous public.shipping_drafts%rowtype;
begin
  if not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write') then raise exception 'Order preparation permission required'; end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or (payload - 'id' - 'order_id' - 'planned_on' - 'method' - 'note' - 'lines') <> '{}'::jsonb then
    raise exception 'Invalid shipping draft'; end if;
  -- Transaction-level key lock makes concurrent retries idempotent without permitting updates.
  perform pg_advisory_xact_lock(hashtextextended(draft_id::text,0));
  select * into previous from public.shipping_drafts where id=draft_id;
  if found then
    if (previous.order_id,previous.planned_on,previous.method,previous.note,previous.lines)
      is distinct from ((payload->>'order_id')::uuid,(payload->>'planned_on')::date,
        payload->>'method',trim(payload->>'note'),payload->'lines') then
      raise exception 'This draft ID was already used with different details'; end if;
    return draft_id;
  end if;
  insert into public.shipping_drafts(id,order_id,planned_on,method,note,lines)
    values(draft_id,(payload->>'order_id')::uuid,(payload->>'planned_on')::date,
      payload->>'method',trim(payload->>'note'),payload->'lines');
  return draft_id;
end $$;
revoke all on function public.guard_shipping_draft() from public,anon,authenticated;
revoke all on function public.save_shipping_draft(jsonb) from public,anon,authenticated;
grant execute on function public.save_shipping_draft(jsonb) to authenticated;
commit;
