begin;

-- Preserve supplier evidence separately from the reliable internal fallback.
alter table public.inventory_receipt_lines
  add column assigned_source_lot text,
  add column source_lot_origin text,
  add constraint receipt_line_source_lot_origin_check check (
    (source_lot_origin = 'supplier_provided' and supplier_lot <> '' and assigned_source_lot is null)
    or (source_lot_origin = 'salad_soulmates_assigned' and supplier_lot = '' and coalesce(assigned_source_lot, '') <> '')
    or (source_lot_origin is null and supplier_lot = '' and assigned_source_lot is null)
  ),
  add constraint receipt_line_assigned_source_lot_length check (assigned_source_lot is null or length(assigned_source_lot) <= 120);

-- The stored value is the next number to issue. The compound identity makes a
-- fallback unique only in its intended facility-local daily scope.
create table public.source_lot_daily_sequences (
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  received_on date not null,
  next_sequence integer not null check(next_sequence between 1 and 10000),
  primary key(organization_id, facility_id, received_on),
  foreign key(organization_id, facility_id) references public.facilities(organization_id, id)
);
alter table public.source_lot_daily_sequences enable row level security;
revoke all on public.source_lot_daily_sequences from anon, authenticated;
grant select, insert, update on public.source_lot_daily_sequences to authenticated;
create policy source_lot_sequence_read on public.source_lot_daily_sequences for select to authenticated
  using(organization_id=public.current_org() and facility_id=public.current_facility() and public.has_permission('inventory.receive'));
create policy source_lot_sequence_add on public.source_lot_daily_sequences for insert to authenticated
  with check(organization_id=public.current_org() and facility_id=public.current_facility() and public.has_permission('inventory.receive'));
create policy source_lot_sequence_advance on public.source_lot_daily_sequences for update to authenticated
  using(organization_id=public.current_org() and facility_id=public.current_facility() and public.has_permission('inventory.receive'))
  with check(organization_id=public.current_org() and facility_id=public.current_facility() and public.has_permission('inventory.receive'));
-- The audit-event schema requires one UUID entity ID, while this allocator is
-- identified by organization, facility, and date. Receipt-line audit events
-- retain the issued source-lot evidence without fabricating an entity identity.

-- Do not invent a source lot for historical blanks. A recorded supplier lot is
-- the only legacy evidence that can be safely classified.
update public.inventory_receipt_lines set source_lot_origin = 'supplier_provided' where supplier_lot <> '';

create or replace function public.post_inventory_receipt(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare receipt_id uuid := gen_random_uuid(); line_id uuid := gen_random_uuid(); ingredient_unit text; supplier_name text;
  prior_event public.inventory_events%rowtype; prior_receipt public.inventory_receipts%rowtype; prior_line public.inventory_receipt_lines%rowtype;
  request_token uuid := (payload->>'request_id')::uuid; supplied_lot text := coalesce(payload->>'supplier_lot',''); source_origin text; assigned_lot text; issued_sequence integer;
begin
 if not public.has_permission('inventory.receive') then raise exception 'Receiving permission required'; end if;
 if request_token is null then raise exception 'Request ID is required'; end if;
 if (payload->>'quantity')::numeric <= 0 or (payload->>'quantity')::numeric > 1000000 or (payload->>'quantity')::numeric <> round((payload->>'quantity')::numeric,4) then raise exception 'Quantity must be positive with at most four decimal places'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_token::text,0));
 select * into prior_event from public.inventory_events where request_id=request_token;
 if found then
   select * into prior_line from public.inventory_receipt_lines where id=prior_event.receipt_line_id; select * into prior_receipt from public.inventory_receipts where id=prior_line.receipt_id;
   if prior_event.event_type='Receipt' and prior_event.created_by=auth.uid() and prior_event.ingredient_id=(payload->>'ingredient_id')::uuid and prior_event.quantity_delta=(payload->>'quantity')::numeric and prior_event.uom=payload->>'uom' and prior_receipt.supplier_id=(payload->>'supplier_id')::uuid and prior_receipt.received_on=(payload->>'received_on')::date and prior_receipt.supplier_reference=trim(coalesce(payload->>'supplier_reference','')) and prior_receipt.note=trim(coalesce(payload->>'note','')) and prior_line.supplier_lot=supplied_lot and prior_line.expiration_date is not distinct from nullif(payload->>'expiration_date','')::date and prior_line.purchase_draft_line_id is not distinct from nullif(payload->>'purchase_draft_line_id','')::uuid then return prior_receipt.id; end if;
   raise exception 'Request ID already used with different values';
 end if;
 select default_uom into ingredient_unit from public.ingredients where id=(payload->>'ingredient_id')::uuid and active;
 if ingredient_unit is null or ingredient_unit is distinct from payload->>'uom' then raise exception 'Receipt unit must match ingredient base unit'; end if;
 select name into supplier_name from public.suppliers where id=(payload->>'supplier_id')::uuid and active;
 if supplier_name is null then raise exception 'Choose an active supplier'; end if;
 if supplied_lot <> '' then
   source_origin := 'supplier_provided';
 else
   source_origin := 'salad_soulmates_assigned';
   insert into public.source_lot_daily_sequences(organization_id,facility_id,received_on,next_sequence)
     values(public.current_org(),public.current_facility(),(payload->>'received_on')::date,2)
   on conflict(organization_id,facility_id,received_on) do update
     set next_sequence=public.source_lot_daily_sequences.next_sequence+1
     where public.source_lot_daily_sequences.next_sequence<10000
   returning next_sequence-1 into issued_sequence;
   if issued_sequence is null then raise exception 'Source-lot sequence is exhausted for this facility date'; end if;
   assigned_lot := 'SL-' || to_char((payload->>'received_on')::date,'YYDDD') || '-' || lpad(issued_sequence::text,4,'0');
 end if;
 insert into public.inventory_receipts(id,supplier_id,received_on,supplier_reference,note) values(receipt_id,(payload->>'supplier_id')::uuid,(payload->>'received_on')::date,trim(coalesce(payload->>'supplier_reference','')),trim(coalesce(payload->>'note','')));
 insert into public.inventory_receipt_lines(id,receipt_id,ingredient_id,quantity,uom,supplier_lot,assigned_source_lot,source_lot_origin,expiration_date,purchase_draft_line_id)
 values(line_id,receipt_id,(payload->>'ingredient_id')::uuid,(payload->>'quantity')::numeric,payload->>'uom',supplied_lot,assigned_lot,source_origin,nullif(payload->>'expiration_date','')::date,nullif(payload->>'purchase_draft_line_id','')::uuid);
 insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,receipt_line_id)
 values((payload->>'ingredient_id')::uuid,'Receipt',(payload->>'quantity')::numeric,payload->>'uom','Received from ' || supplier_name || case when trim(coalesce(payload->>'supplier_reference',''))='' then '' else ' · ' || trim(payload->>'supplier_reference') end,coalesce(nullif(payload->>'request_id','')::uuid,gen_random_uuid()),line_id);
 return receipt_id;
end $$;

create or replace function public.guard_receipt_serialization() returns trigger language plpgsql security invoker set search_path='' as $$
declare line public.inventory_receipt_lines%rowtype; receipt public.inventory_receipts%rowtype; item public.supplier_items%rowtype; package jsonb; total numeric := 0; amount numeric; barcode text;
begin
  if not public.has_permission('inventory.receive') or new.created_by is distinct from auth.uid() or new.organization_id is distinct from public.current_org() or new.facility_id is distinct from public.current_facility() then raise exception 'Receiving permission required'; end if;
  select * into line from public.inventory_receipt_lines where id=new.receipt_line_id; select * into receipt from public.inventory_receipts where id=line.receipt_id;
  if receipt.id is null or not exists(select 1 from public.inventory_events where receipt_line_id=line.id and event_type='Receipt') then raise exception 'Choose a posted receipt in this facility'; end if;
  if exists(select 1 from public.ingredients where id=line.ingredient_id and traceability_mode='future_required') and not ((line.source_lot_origin='supplier_provided' and line.supplier_lot<>'') or (line.source_lot_origin='salad_soulmates_assigned' and coalesce(line.assigned_source_lot,'')<>'')) then raise exception 'Source lot is required before serialization'; end if;
  if jsonb_typeof(new.packages) is distinct from 'array' or jsonb_array_length(new.packages) not between 1 and 200 then raise exception 'Enter 1 to 200 packages'; end if;
  for package in select value from jsonb_array_elements(new.packages) loop
    amount := (package->>'quantity')::numeric; if amount is null or amount <= 0 or amount > 1000000 or amount <> round(amount,4) then raise exception 'Package quantity must be positive with at most four decimals'; end if;
    barcode := nullif(package->>'supplier_barcode',''); if barcode is not null and (barcode <> trim(barcode) or length(barcode)>120 or barcode !~ '^[!-~]+$' or upper(barcode) like 'SSU-%') then raise exception 'Supplier barcode must be printable ASCII without spaces or the SSU- prefix'; end if; total := total+amount;
  end loop;
  if total <> line.quantity then raise exception 'Package quantities must equal the received quantity'; end if;
  if new.supplier_item_id is not null then select * into item from public.supplier_items where id=new.supplier_item_id and active;
    if item.id is null or item.supplier_id<>receipt.supplier_id or item.ingredient_id<>line.ingredient_id or item.pack_quantity_uom<>line.uom then raise exception 'Choose a matching active supplier item in the base unit'; end if;
    new.supplier_item_snapshot := jsonb_build_object('supplier_sku',item.supplier_sku,'purchase_uom',item.purchase_uom,'pack_quantity',item.pack_quantity,'uom',item.pack_quantity_uom); else new.supplier_item_snapshot := null; end if;
  new.created_at := now(); return new;
end $$;

create or replace view public.serialized_unit_balances with (security_invoker=true) as
select unit.*,allocation.receipt_line_id,allocation.supplier_item_snapshot,line.receipt_id,line.ingredient_id,line.uom,line.supplier_lot,line.expiration_date,receipt.supplier_id,receipt.received_on,receipt.supplier_reference,ingredient.name as ingredient_name,supplier.name as supplier_name,coalesce(event.remaining_quantity,unit.initial_quantity) as remaining_quantity,coalesce(event.status,'Available') as status,coalesce(event.expected_revision+1,0) as revision,
  case when line.expiration_date < (now() at time zone facility.timezone)::date then 'Expired' when coalesce(event.remaining_quantity,unit.initial_quantity)=0 then 'Exhausted' else coalesce(event.status,'Available') end as availability,
  line.assigned_source_lot,line.source_lot_origin,case line.source_lot_origin when 'supplier_provided' then line.supplier_lot when 'salad_soulmates_assigned' then line.assigned_source_lot end as source_lot
from public.serialized_units unit join public.receipt_serializations allocation on allocation.id=unit.serialization_id join public.inventory_receipt_lines line on line.id=allocation.receipt_line_id join public.inventory_receipts receipt on receipt.id=line.receipt_id join public.ingredients ingredient on ingredient.id=line.ingredient_id join public.suppliers supplier on supplier.id=receipt.supplier_id join public.facilities facility on facility.id=unit.facility_id left join lateral(select * from public.serialized_unit_events e where e.unit_id=unit.id order by e.expected_revision desc limit 1) event on true;

create or replace function public.find_serialized_units(search_text text default '', receipt_filter uuid default null, unit_filter uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) from (select * from public.serialized_unit_balances where (receipt_filter is null or receipt_id=receipt_filter) and (unit_filter is null or id=unit_filter) and (trim(search_text)='' or internal_code=upper(trim(search_text)) or supplier_barcode=trim(search_text) or (not exists(select 1 from public.serialized_units exact where exact.internal_code=upper(trim(search_text)) or exact.supplier_barcode=trim(search_text)) and (position(lower(trim(search_text)) in lower(source_lot))>0 or position(lower(trim(search_text)) in lower(supplier_lot))>0 or position(lower(trim(search_text)) in lower(ingredient_name))>0))) order by created_at desc,id limit 200) result
$$;

commit;
