begin;

-- One immutable package allocation per receipt line. Existing receipts are not
-- assigned guessed physical package counts; they remain visibly unallocated.
create table public.receipt_serializations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  receipt_line_id uuid not null unique,
  supplier_item_id uuid,
  supplier_item_snapshot jsonb,
  packages jsonb not null,
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
  foreign key(organization_id,receipt_line_id) references public.inventory_receipt_lines(organization_id,id),
  foreign key(organization_id,supplier_item_id) references public.supplier_items(organization_id,id)
);
create table public.serialized_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  serialization_id uuid not null,
  ordinal integer not null check(ordinal between 1 and 200),
  initial_quantity numeric(14,4) not null check(initial_quantity > 0 and initial_quantity <= 1000000),
  internal_code text generated always as ('SSU-' || upper(id::text)) stored,
  supplier_barcode text,
  created_at timestamptz not null default now(),
  unique(organization_id,id), unique(serialization_id,ordinal),
  unique(organization_id,internal_code), unique(organization_id,supplier_barcode),
  foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
  foreign key(organization_id,serialization_id) references public.receipt_serializations(organization_id,id)
);
create table public.serialized_unit_events (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  unit_id uuid not null,
  expected_revision integer not null check(expected_revision >= 0),
  remaining_quantity numeric(14,4) not null check(remaining_quantity >= 0 and remaining_quantity <= 1000000),
  status text not null check(status in ('Available','Hold','Quarantined')),
  reason text not null check(length(trim(reason)) between 3 and 1000),
  quantity_delta numeric(14,4) not null default 0,
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique(unit_id,expected_revision),
  foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
  foreign key(organization_id,unit_id) references public.serialized_units(organization_id,id)
);
alter table public.inventory_events add column serialized_unit_event_id uuid unique
  references public.serialized_unit_events(id);

-- All functions remain invoker functions; triggers enforce invariants even when
-- authenticated clients call the Data API directly instead of the application.
do $$ declare table_name text; begin
  foreach table_name in array array['receipt_serializations','serialized_units','serialized_unit_events'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from anon,authenticated',table_name);
    execute format('grant select,insert on public.%I to authenticated',table_name);
    execute format('create policy serial_read on public.%I for select to authenticated using
      (organization_id=public.current_org() and facility_id=public.current_facility()
        and public.has_permission(''inventory.read''))',table_name);
    execute format('create trigger serial_audit after insert on public.%I
      for each row execute function public.audit_change()',table_name);
  end loop;
end $$;
create policy serialization_add on public.receipt_serializations for insert to authenticated
  with check(organization_id=public.current_org() and facility_id=public.current_facility()
    and created_by=auth.uid() and public.has_permission('inventory.receive'));
create policy unit_add on public.serialized_units for insert to authenticated
  with check(organization_id=public.current_org() and facility_id=public.current_facility()
    and public.has_permission('inventory.receive'));
create policy unit_event_add on public.serialized_unit_events for insert to authenticated
  with check(organization_id=public.current_org() and facility_id=public.current_facility()
    and created_by=auth.uid() and public.has_permission('inventory.adjust'));
-- SELECT FOR UPDATE locks immutable package identities during concurrent events.
-- WITH CHECK false prevents actual row updates, including through the Data API.
grant update on public.serialized_units to authenticated;
create policy unit_lock on public.serialized_units for update to authenticated
  using(organization_id=public.current_org() and facility_id=public.current_facility()
    and public.has_permission('inventory.adjust')) with check(false);

create function public.guard_receipt_serialization() returns trigger
language plpgsql security invoker set search_path='' as $$
declare line public.inventory_receipt_lines%rowtype; receipt public.inventory_receipts%rowtype;
  item public.supplier_items%rowtype; package jsonb; total numeric := 0; amount numeric; barcode text;
begin
  if not public.has_permission('inventory.receive') or new.created_by is distinct from auth.uid()
     or new.organization_id is distinct from public.current_org() or new.facility_id is distinct from public.current_facility() then
    raise exception 'Receiving permission required';
  end if;
  select * into line from public.inventory_receipt_lines where id=new.receipt_line_id;
  select * into receipt from public.inventory_receipts where id=line.receipt_id;
  if receipt.id is null or not exists(select 1 from public.inventory_events where receipt_line_id=line.id and event_type='Receipt') then
    raise exception 'Choose a posted receipt in this facility';
  end if;
  if line.supplier_lot='' and exists(select 1 from public.ingredients where id=line.ingredient_id and traceability_mode='future_required') then
    raise exception 'Supplier lot is required before serialization';
  end if;
  if jsonb_typeof(new.packages) is distinct from 'array' then raise exception 'Enter 1 to 200 packages'; end if;
  if jsonb_array_length(new.packages) not between 1 and 200 then raise exception 'Enter 1 to 200 packages'; end if;
  for package in select value from jsonb_array_elements(new.packages) loop
    amount := (package->>'quantity')::numeric;
    if amount is null or amount <= 0 or amount > 1000000 or amount <> round(amount,4) then
      raise exception 'Package quantity must be positive with at most four decimals';
    end if;
    barcode := nullif(package->>'supplier_barcode','');
    if barcode is not null and (barcode <> trim(barcode) or length(barcode)>120
        or barcode !~ '^[!-~]+$' or upper(barcode) like 'SSU-%') then
      raise exception 'Supplier barcode must be printable ASCII without spaces or the SSU- prefix';
    end if;
    total := total+amount;
  end loop;
  if total <> line.quantity then raise exception 'Package quantities must equal the received quantity'; end if;
  if new.supplier_item_id is not null then
    select * into item from public.supplier_items where id=new.supplier_item_id and active;
    if item.id is null or item.supplier_id<>receipt.supplier_id or item.ingredient_id<>line.ingredient_id
       or item.pack_quantity_uom<>line.uom then raise exception 'Choose a matching active supplier item in the base unit'; end if;
    new.supplier_item_snapshot := jsonb_build_object('supplier_sku',item.supplier_sku,
      'purchase_uom',item.purchase_uom,'pack_quantity',item.pack_quantity,'uom',item.pack_quantity_uom);
  else new.supplier_item_snapshot := null;
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger serialization_guard before insert on public.receipt_serializations
  for each row execute function public.guard_receipt_serialization();

create function public.guard_serialized_unit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare allocation public.receipt_serializations%rowtype; package jsonb;
begin
  select * into allocation from public.receipt_serializations where id=new.serialization_id;
  package := allocation.packages->(new.ordinal-1);
  if allocation.id is null or package is null or allocation.created_by is distinct from auth.uid()
    or new.organization_id is distinct from allocation.organization_id or new.facility_id is distinct from allocation.facility_id
    or new.initial_quantity is distinct from (package->>'quantity')::numeric
    or new.supplier_barcode is distinct from nullif(package->>'supplier_barcode','') then
    raise exception 'Package must match its immutable receipt allocation';
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger unit_guard before insert on public.serialized_units
  for each row execute function public.guard_serialized_unit();
create function public.create_receipt_units() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.serialized_units(serialization_id,ordinal,initial_quantity,supplier_barcode)
  select new.id,ordinality,(value->>'quantity')::numeric,nullif(value->>'supplier_barcode','')
    from jsonb_array_elements(new.packages) with ordinality;
  return new;
end $$;
create trigger serialization_units after insert on public.receipt_serializations
  for each row execute function public.create_receipt_units();

create function public.serialize_receipt_line(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior public.receipt_serializations%rowtype; allocation_id uuid; line_id uuid := (payload->>'receipt_line_id')::uuid;
begin
  if not public.has_permission('inventory.receive') then raise exception 'Receiving permission required'; end if;
  if line_id is null then raise exception 'Choose a posted receipt in this facility'; end if;
  perform pg_advisory_xact_lock(hashtextextended(line_id::text,1));
  select * into prior from public.receipt_serializations where receipt_line_id=line_id;
  if found then
    if prior.packages=payload->'packages' and prior.created_by=auth.uid()
      and prior.supplier_item_id is not distinct from nullif(payload->>'supplier_item_id','')::uuid then return prior.id; end if;
    raise exception 'Receipt already serialized with different values';
  end if;
  insert into public.receipt_serializations(receipt_line_id,supplier_item_id,packages)
    values(line_id,nullif(payload->>'supplier_item_id','')::uuid,payload->'packages') returning id into allocation_id;
  return allocation_id;
end $$;

-- A single transaction: receipt, ledger and all physical units succeed together.
create function public.receive_serialized_delivery(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare posted_receipt_id uuid; line_id uuid;
begin
  posted_receipt_id := public.post_inventory_receipt(payload);
  select id into line_id from public.inventory_receipt_lines where inventory_receipt_lines.receipt_id=posted_receipt_id;
  perform public.serialize_receipt_line(payload || jsonb_build_object('receipt_line_id',line_id));
  return posted_receipt_id;
end $$;

create view public.serialized_unit_balances with (security_invoker=true) as
select unit.*,allocation.receipt_line_id,allocation.supplier_item_snapshot,
  line.receipt_id,line.ingredient_id,line.uom,line.supplier_lot,line.expiration_date,
  receipt.supplier_id,receipt.received_on,receipt.supplier_reference,
  ingredient.name as ingredient_name,supplier.name as supplier_name,
  coalesce(event.remaining_quantity,unit.initial_quantity) as remaining_quantity,
  coalesce(event.status,'Available') as status,
  coalesce(event.expected_revision+1,0) as revision,
  case
    when line.expiration_date < (now() at time zone facility.timezone)::date then 'Expired'
    when coalesce(event.remaining_quantity,unit.initial_quantity)=0 then 'Exhausted'
    else coalesce(event.status,'Available') end as availability
from public.serialized_units unit
join public.receipt_serializations allocation on allocation.id=unit.serialization_id
join public.inventory_receipt_lines line on line.id=allocation.receipt_line_id
join public.inventory_receipts receipt on receipt.id=line.receipt_id
join public.ingredients ingredient on ingredient.id=line.ingredient_id
join public.suppliers supplier on supplier.id=receipt.supplier_id
join public.facilities facility on facility.id=unit.facility_id
left join lateral(select * from public.serialized_unit_events e where e.unit_id=unit.id
  order by e.expected_revision desc limit 1) event on true;
revoke all on public.serialized_unit_balances from anon,authenticated;
grant select on public.serialized_unit_balances to authenticated;

create function public.guard_serialized_unit_event() returns trigger
language plpgsql security invoker set search_path='' as $$
declare unit public.serialized_units%rowtype; current_balance public.serialized_unit_balances%rowtype;
begin
  if not public.has_permission('inventory.adjust') or new.created_by is distinct from auth.uid()
    or new.organization_id is distinct from public.current_org() or new.facility_id is distinct from public.current_facility() then
    raise exception 'Inventory adjustment permission required';
  end if;
  select * into unit from public.serialized_units where id=new.unit_id for update;
  if not found then raise exception 'Package not found in this facility'; end if;
  select * into current_balance from public.serialized_unit_balances where id=unit.id;
  if new.expected_revision<>current_balance.revision then raise exception 'Package changed; reload before trying again'; end if;
  if new.remaining_quantity>unit.initial_quantity then raise exception 'Remaining quantity cannot exceed the original package quantity'; end if;
  if new.remaining_quantity=current_balance.remaining_quantity and new.status=current_balance.status then raise exception 'No package change was entered'; end if;
  new.created_at := now();
  new.quantity_delta := new.remaining_quantity-current_balance.remaining_quantity;
  return new;
end $$;
create trigger unit_event_guard before insert on public.serialized_unit_events
  for each row execute function public.guard_serialized_unit_event();
create function public.post_serialized_unit_delta() returns trigger
language plpgsql security invoker set search_path='' as $$
declare unit public.serialized_unit_balances%rowtype;
begin
  if new.quantity_delta<>0 then
    select * into unit from public.serialized_unit_balances where id=new.unit_id;
    insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,serialized_unit_event_id)
      values(unit.ingredient_id,'Adjustment',new.quantity_delta,unit.uom,new.reason,new.id,new.id);
  end if;
  return new;
end $$;
create trigger unit_event_ledger after insert on public.serialized_unit_events
  for each row execute function public.post_serialized_unit_delta();

-- Prevent a client from attaching an arbitrary ledger quantity to a package event.
create function public.guard_serialized_ledger() returns trigger
language plpgsql security invoker set search_path='' as $$
declare event public.serialized_unit_events%rowtype; unit public.serialized_unit_balances%rowtype;
begin
  if new.serialized_unit_event_id is null then return new; end if;
  select * into event from public.serialized_unit_events where id=new.serialized_unit_event_id;
  select * into unit from public.serialized_unit_balances where id=event.unit_id;
  if event.id is null or event.created_by is distinct from auth.uid() or new.event_type<>'Adjustment'
    or new.receipt_line_id is not null or new.quantity_delta is distinct from event.quantity_delta
    or new.ingredient_id is distinct from unit.ingredient_id or new.uom is distinct from unit.uom
    or new.reason_note is distinct from event.reason
    or new.request_id is distinct from event.id then raise exception 'Ledger entry must match its package event'; end if;
  return new;
end $$;
create trigger serialized_ledger_guard before insert on public.inventory_events
  for each row execute function public.guard_serialized_ledger();

create function public.change_serialized_unit(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare request_id uuid := (payload->>'id')::uuid; prior public.serialized_unit_events%rowtype; remaining numeric := (payload->>'remaining_quantity')::numeric;
begin
  if not public.has_permission('inventory.adjust') then raise exception 'Inventory adjustment permission required'; end if;
  if request_id is null then raise exception 'Request ID is required'; end if;
  if remaining is null or remaining<0 or remaining>1000000 or remaining<>round(remaining,4) then raise exception 'Remaining quantity requires at most four decimals'; end if;
  perform pg_advisory_xact_lock(hashtextextended(request_id::text,2));
  select * into prior from public.serialized_unit_events where id=request_id;
  if found then
    if prior.unit_id=(payload->>'unit_id')::uuid and prior.expected_revision=(payload->>'expected_revision')::integer
      and prior.remaining_quantity=remaining and prior.status=payload->>'status'
      and prior.reason=trim(payload->>'reason') and prior.created_by=auth.uid() then return prior.id; end if;
    raise exception 'Request ID already used with different values';
  end if;
  insert into public.serialized_unit_events(id,unit_id,expected_revision,remaining_quantity,status,reason)
    values(request_id,(payload->>'unit_id')::uuid,(payload->>'expected_revision')::integer,remaining,payload->>'status',trim(payload->>'reason'));
  return request_id;
end $$;

-- Bounded server-side lookup accepts exact serials or supplier barcodes, and
-- substring lot/ingredient searches. Labels filter a receipt (at most 200 units).
create function public.find_serialized_units(search_text text default '', receipt_filter uuid default null, unit_filter uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) from (
   select * from public.serialized_unit_balances
   where (receipt_filter is null or receipt_id=receipt_filter)
     and (unit_filter is null or id=unit_filter)
     and (trim(search_text)='' or internal_code=upper(trim(search_text)) or supplier_barcode=trim(search_text)
       or (not exists(select 1 from public.serialized_units exact
             where exact.internal_code=upper(trim(search_text)) or exact.supplier_barcode=trim(search_text))
           and (position(lower(trim(search_text)) in lower(supplier_lot))>0
             or position(lower(trim(search_text)) in lower(ingredient_name))>0)))
   order by created_at desc,id limit 200
 ) result
$$;

create index serialization_scope on public.receipt_serializations(organization_id,facility_id);
create index serialized_unit_scope on public.serialized_units(organization_id,facility_id,created_at desc);
create index serialized_event_scope on public.serialized_unit_events(organization_id,facility_id,unit_id);

revoke all on function public.serialize_receipt_line(jsonb),public.receive_serialized_delivery(jsonb),
  public.change_serialized_unit(jsonb),public.find_serialized_units(text,uuid,uuid) from public,anon;
grant execute on function public.serialize_receipt_line(jsonb),public.receive_serialized_delivery(jsonb),
  public.change_serialized_unit(jsonb),public.find_serialized_units(text,uuid,uuid) to authenticated;
revoke execute on function public.guard_receipt_serialization(),public.guard_serialized_unit(),
  public.create_receipt_units(),public.guard_serialized_unit_event(),public.post_serialized_unit_delta(),
  public.guard_serialized_ledger() from public,anon,authenticated;

-- Package adjustments are counted once; held and expired stock is unavailable.
create or replace function public.material_requirements(plan_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(r.value || jsonb_build_object(
    'on_hand',stock.quantity,'other_commitments',commitments.quantity,
    'confirmed_inbound',inbound.quantity,
    'projected',stock.quantity+inbound.quantity-commitments.quantity-(r.value->>'required')::numeric,
    'shortage',greatest(0,(r.value->>'required')::numeric+commitments.quantity-stock.quantity-inbound.quantity))), '[]'::jsonb)
  from public.material_plans plan cross join lateral jsonb_array_elements(plan.requirements) r
  cross join lateral (select
    coalesce((select sum(e.quantity_delta) from public.inventory_events e
      where e.ingredient_id=(r.value->>'ingredient_id')::uuid and e.uom=r.value->>'uom'
        and e.serialized_unit_event_id is null
        and (e.receipt_line_id is null or exists(select 1 from public.inventory_receipt_lines receipt
          where receipt.id=e.receipt_line_id
            and not exists(select 1 from public.receipt_serializations s where s.receipt_line_id=receipt.id)
            and (receipt.expiration_date is null or receipt.expiration_date>=plan.needed_on)))),0)
    + coalesce((select sum(unit.remaining_quantity) from public.serialized_unit_balances unit
      where unit.ingredient_id=(r.value->>'ingredient_id')::uuid and unit.uom=r.value->>'uom'
        and unit.availability='Available'
        and (unit.expiration_date is null or unit.expiration_date>=plan.needed_on)),0) quantity) stock
  cross join lateral (select coalesce(sum((c.value->>'required')::numeric),0) quantity
    from public.material_plans other cross join lateral jsonb_array_elements(other.requirements) c
    where other.status='Active' and other.id<>plan.id
      and c.value->>'ingredient_id'=r.value->>'ingredient_id') commitments
  cross join lateral (select coalesce(sum(greatest(0,l.quantity-coalesce((select sum(received.quantity)
    from public.inventory_receipt_lines received where received.purchase_draft_line_id=l.id),0))),0) quantity
    from public.purchase_draft_lines l join public.purchase_drafts d on d.id=l.purchase_draft_id
    where d.status='Confirmed' and d.expected_on<=plan.needed_on
      and l.ingredient_id=(r.value->>'ingredient_id')::uuid and l.uom=r.value->>'uom') inbound
  where plan.id=plan_id and plan.status='Active'
    and public.has_permission('planning.read') and public.has_permission('inventory.read')
$$;


commit;
