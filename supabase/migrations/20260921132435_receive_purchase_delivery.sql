begin;

alter table public.inventory_receipts
  add column delivery_request_id uuid,
  add column delivery_payload jsonb,
  add column delivery_line_count integer,
  add constraint inventory_receipts_delivery_request_check check (
    (delivery_request_id is null and delivery_payload is null and delivery_line_count is null)
    or (delivery_request_id is not null and delivery_payload is not null
      and jsonb_typeof(delivery_payload) is not distinct from 'object'
      and jsonb_typeof(delivery_payload->'lines') is not distinct from 'array'
      and jsonb_array_length(delivery_payload->'lines')=delivery_line_count
      and (delivery_payload->>'request_id') is not distinct from delivery_request_id::text
      and delivery_line_count between 1 and 100)
  );
create unique index inventory_receipts_delivery_request
  on public.inventory_receipts(organization_id, facility_id, delivery_request_id)
  where delivery_request_id is not null;

-- Receivers may take row locks needed by the invoker RPC, but the false write
-- check keeps purchase snapshots immutable through direct Data API writes.
grant update on public.purchase_draft_lines to authenticated;
create policy purchase_delivery_header_lock on public.purchase_drafts for update to authenticated
  using (organization_id=public.current_org() and facility_id=public.current_facility()
    and public.has_permission('inventory.receive'))
  with check (false);
create policy purchase_delivery_line_lock on public.purchase_draft_lines for update to authenticated
  using (organization_id=public.current_org() and facility_id=public.current_facility()
    and public.has_permission('inventory.receive'))
  with check (false);

-- A committed multi-line receipt accepts exactly the immutable line identities
-- captured on its header. The row lock also serializes attempted direct inserts.
create function public.guard_purchase_delivery_line() returns trigger
language plpgsql security definer set search_path='' as $$
declare receipt public.inventory_receipts%rowtype; requested jsonb; issued_sequence integer;
begin
  select * into receipt from public.inventory_receipts where id=new.receipt_id for update;
  if receipt.delivery_request_id is null then return new; end if;
  if receipt.organization_id is distinct from public.current_org()
     or receipt.facility_id is distinct from public.current_facility()
     or receipt.created_by is distinct from auth.uid()
     or not public.has_permission('inventory.receive') then
    raise exception 'Receiving permission required';
  end if;
  if (select count(*) from public.inventory_receipt_lines where receipt_id=receipt.id)
     >= receipt.delivery_line_count then
    raise exception 'Committed purchase delivery lines are immutable';
  end if;
  select value into requested from jsonb_array_elements(receipt.delivery_payload->'lines')
    where (value->>'id')::uuid=new.id;
  if requested is null
     or new.purchase_draft_line_id is distinct from (requested->>'purchase_draft_line_id')::uuid
     or new.quantity is distinct from (requested->>'quantity')::numeric
     or new.supplier_lot is distinct from coalesce(requested->>'supplier_lot','')
     or new.expiration_date is distinct from nullif(requested->>'expiration_date','')::date
     or length(new.supplier_lot)>120 then
    raise exception 'Purchase delivery line must match its immutable request';
  end if;
  if new.supplier_lot<>'' then
    new.source_lot_origin := 'supplier_provided';
    new.assigned_source_lot := null;
  else
    insert into public.source_lot_daily_sequences(
      organization_id,facility_id,received_on,next_sequence)
    values(receipt.organization_id,receipt.facility_id,receipt.received_on,1)
    on conflict(organization_id,facility_id,received_on) do nothing;
    update public.source_lot_daily_sequences set next_sequence=next_sequence+1
      where organization_id=receipt.organization_id and facility_id=receipt.facility_id
        and received_on=receipt.received_on and next_sequence<10000
      returning next_sequence-1 into issued_sequence;
    if issued_sequence is null then
      raise exception 'Source-lot sequence is exhausted for this facility date';
    end if;
    new.source_lot_origin := 'salad_soulmates_assigned';
    new.assigned_source_lot := 'SL-' || to_char(receipt.received_on,'YYDDD') || '-'
      || lpad(issued_sequence::text,4,'0');
  end if;
  return new;
end $$;
create trigger purchase_delivery_line_guard before insert on public.inventory_receipt_lines
  for each row execute function public.guard_purchase_delivery_line();

-- A receipt-linked ledger row must be the exact stock effect of its immutable
-- multi-line receipt. Existing single-line and non-receipt postings are unchanged.
create function public.guard_purchase_delivery_event() returns trigger
language plpgsql security invoker set search_path='' as $$
declare line public.inventory_receipt_lines%rowtype; receipt public.inventory_receipts%rowtype;
begin
  if new.receipt_line_id is null then return new; end if;
  select * into line from public.inventory_receipt_lines where id=new.receipt_line_id;
  select * into receipt from public.inventory_receipts where id=line.receipt_id;
  if receipt.delivery_request_id is null then return new; end if;
  if new.event_type is distinct from 'Receipt'
     or new.organization_id is distinct from line.organization_id
     or new.facility_id is distinct from receipt.facility_id
     or new.ingredient_id is distinct from line.ingredient_id
     or new.quantity_delta is distinct from line.quantity
     or new.uom is distinct from line.uom
     or new.created_by is distinct from receipt.created_by then
    raise exception 'Purchase delivery ledger event must match its receipt line';
  end if;
  return new;
end $$;
create trigger purchase_delivery_event_guard before insert on public.inventory_events
  for each row execute function public.guard_purchase_delivery_event();

-- Direct Data API inserts run in their own transaction. This deferred assertion
-- rejects an idempotency header unless its entire immutable line, ledger, package
-- allocation, and generated-label graph exists by transaction end.
create function public.assert_purchase_delivery_complete() returns trigger
language plpgsql security definer set search_path='' as $$
declare receipt public.inventory_receipts%rowtype;
begin
  select * into receipt from public.inventory_receipts where id=new.id;
  if receipt.id is null or receipt.delivery_request_id is null then return null; end if;
  if (select sum(jsonb_array_length(value->'packages'))
      from jsonb_array_elements(receipt.delivery_payload->'lines'))>200 then
    raise exception 'Purchase delivery cannot commit more than 200 packages';
  end if;
  if receipt.organization_id is distinct from public.current_org()
     or receipt.facility_id is distinct from public.current_facility()
     or receipt.created_by is distinct from auth.uid()
     or receipt.supplier_id is distinct from (receipt.delivery_payload->>'supplier_id')::uuid
     or receipt.received_on is distinct from (receipt.delivery_payload->>'received_on')::date
     or receipt.supplier_reference is distinct from receipt.delivery_payload->>'supplier_reference'
     or receipt.note is distinct from receipt.delivery_payload->>'note'
     or length(receipt.supplier_reference)>120 or length(receipt.note)>1000
     or not exists(select 1 from public.suppliers supplier
       where supplier.id=receipt.supplier_id and supplier.organization_id=receipt.organization_id
         and supplier.active)
     or (select count(distinct (value->>'id')::uuid)
       from jsonb_array_elements(receipt.delivery_payload->'lines'))<>receipt.delivery_line_count
     or (select count(*) from public.inventory_receipt_lines where receipt_id=receipt.id)
       <>receipt.delivery_line_count
     or exists(select 1 from jsonb_array_elements(receipt.delivery_payload->'lines') requested
       left join public.inventory_receipt_lines line
         on line.receipt_id=receipt.id and line.id=(requested.value->>'id')::uuid
       left join public.inventory_events event on event.receipt_line_id=line.id
       left join public.receipt_serializations serialization on serialization.receipt_line_id=line.id
       left join public.purchase_draft_lines purchase_line on purchase_line.id=line.purchase_draft_line_id
       left join public.supplier_items item on item.id=purchase_line.supplier_item_id
       left join public.ingredients ingredient on ingredient.id=line.ingredient_id
       where line.id is null
         or line.purchase_draft_line_id is distinct from (requested.value->>'purchase_draft_line_id')::uuid
         or line.quantity is distinct from (requested.value->>'quantity')::numeric
         or line.supplier_lot is distinct from coalesce(requested.value->>'supplier_lot','')
         or line.expiration_date is distinct from nullif(requested.value->>'expiration_date','')::date
         or line.quantity<=0 or line.quantity>1000000 or line.quantity='NaN'::numeric
         or line.quantity<>round(line.quantity,4) or length(line.supplier_lot)>120
         or not item.active or not ingredient.active
         or event.event_type is distinct from 'Receipt'
         or event.ingredient_id is distinct from line.ingredient_id
         or event.quantity_delta is distinct from line.quantity
         or event.uom is distinct from line.uom
         or serialization.id is null
         or serialization.packages is distinct from requested.value->'packages'
         or (select count(*) from public.serialized_units unit
           where unit.serialization_id=serialization.id)
           <>jsonb_array_length(requested.value->'packages')) then
    raise exception 'Purchase delivery must commit its complete immutable receipt';
  end if;
  return null;
end $$;
create constraint trigger purchase_delivery_complete_check
  after insert on public.inventory_receipts deferrable initially deferred
  for each row execute function public.assert_purchase_delivery_complete();

-- Purchase snapshots, rather than mutable catalog pack values, describe received
-- PO lines. An inactive catalog item remains blocked as a deliberate safety gate.
create or replace function public.guard_receipt_serialization() returns trigger
language plpgsql security invoker set search_path='' as $$
declare line public.inventory_receipt_lines%rowtype; receipt public.inventory_receipts%rowtype;
  item public.supplier_items%rowtype; purchase_line public.purchase_draft_lines%rowtype;
  package jsonb; total numeric := 0; amount numeric; barcode text;
begin
  if not public.has_permission('inventory.receive') or new.created_by is distinct from auth.uid()
     or new.organization_id is distinct from public.current_org()
     or new.facility_id is distinct from public.current_facility() then
    raise exception 'Receiving permission required';
  end if;
  select * into line from public.inventory_receipt_lines where id=new.receipt_line_id;
  select * into receipt from public.inventory_receipts where id=line.receipt_id;
  if receipt.id is null or not exists(select 1 from public.inventory_events
      where receipt_line_id=line.id and event_type='Receipt') then
    raise exception 'Choose a posted receipt in this facility';
  end if;
  if exists(select 1 from public.ingredients where id=line.ingredient_id and traceability_mode='future_required')
     and not ((line.source_lot_origin='supplier_provided' and line.supplier_lot<>'')
       or (line.source_lot_origin='salad_soulmates_assigned'
         and coalesce(line.assigned_source_lot,'')<>'')) then
    raise exception 'Source lot is required before serialization';
  end if;
  if jsonb_typeof(new.packages) is distinct from 'array'
     or jsonb_array_length(new.packages) not between 1 and 200 then
    raise exception 'Enter 1 to 200 packages';
  end if;
  for package in select value from jsonb_array_elements(new.packages) loop
    amount := (package->>'quantity')::numeric;
    if amount is null or amount='NaN'::numeric or amount<=0 or amount>1000000
       or amount<>round(amount,4) then
      raise exception 'Package quantity must be positive with at most four decimals';
    end if;
    barcode := nullif(package->>'supplier_barcode','');
    if barcode is not null and (barcode<>trim(barcode) or length(barcode)>120
       or barcode !~ '^[!-~]+$' or upper(barcode) like 'SSU-%') then
      raise exception 'Supplier barcode must be printable ASCII without spaces or the SSU- prefix';
    end if;
    total := total+amount;
  end loop;
  if total<>line.quantity then raise exception 'Package quantities must equal the received quantity'; end if;
  if line.purchase_draft_line_id is not null then
    select * into purchase_line from public.purchase_draft_lines where id=line.purchase_draft_line_id;
    if purchase_line.id is null or new.supplier_item_id is distinct from purchase_line.supplier_item_id
       or not exists(select 1 from public.supplier_items where id=purchase_line.supplier_item_id and active) then
      raise exception 'Choose the active supplier item captured by the purchase order';
    end if;
    new.supplier_item_snapshot := jsonb_build_object(
      'supplier_sku',purchase_line.supplier_sku,
      'purchase_uom',purchase_line.purchase_uom,
      'pack_quantity',purchase_line.pack_quantity,
      'uom',purchase_line.uom);
  elsif new.supplier_item_id is not null then
    select * into item from public.supplier_items where id=new.supplier_item_id and active;
    if item.id is null or item.supplier_id<>receipt.supplier_id
       or item.ingredient_id<>line.ingredient_id or item.pack_quantity_uom<>line.uom then
      raise exception 'Choose a matching active supplier item in the base unit';
    end if;
    new.supplier_item_snapshot := jsonb_build_object(
      'supplier_sku',item.supplier_sku,'purchase_uom',item.purchase_uom,
      'pack_quantity',item.pack_quantity,'uom',item.pack_quantity_uom);
  else
    new.supplier_item_snapshot := null;
  end if;
  new.created_at := now();
  return new;
end $$;

create function public.receive_purchase_delivery(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  request_token uuid;
  requested_supplier uuid;
  received_date date;
  canonical jsonb;
  prior public.inventory_receipts%rowtype;
  receipt_id uuid := gen_random_uuid();
  requested_line jsonb;
  purchase_line public.purchase_draft_lines%rowtype;
  supplier_name text;
  supplied_lot text;
  line_quantity numeric;
  package_quantity numeric;
  package_total numeric;
  package_count integer := 0;
  line_count integer;
  package jsonb;
begin
  if not public.has_permission('inventory.receive') then raise exception 'Receiving permission required'; end if;
  if jsonb_typeof(payload) is distinct from 'object'
     or jsonb_typeof(payload->'lines') is distinct from 'array' then
    raise exception 'Purchase delivery lines are required';
  end if;
  request_token := nullif(payload->>'request_id','')::uuid;
  requested_supplier := nullif(payload->>'supplier_id','')::uuid;
  received_date := nullif(payload->>'received_on','')::date;
  line_count := jsonb_array_length(payload->'lines');
  if request_token is null or requested_supplier is null or received_date is null then
    raise exception 'Delivery request, supplier and received date are required';
  end if;
  if line_count not between 1 and 100 then raise exception 'Enter 1 to 100 receipt lines'; end if;
  if length(trim(coalesce(payload->>'supplier_reference','')))>120
     or length(trim(coalesce(payload->>'note','')))>1000 then
    raise exception 'Supplier reference or note is too long';
  end if;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(payload->'lines'))
     <> line_count then raise exception 'Receipt line IDs must be unique'; end if;

  for requested_line in select value from jsonb_array_elements(payload->'lines') loop
    if nullif(requested_line->>'id','')::uuid is null
       or nullif(requested_line->>'purchase_draft_line_id','')::uuid is null then
      raise exception 'Receipt line and purchase line IDs are required';
    end if;
    line_quantity := (requested_line->>'quantity')::numeric;
    if line_quantity is null or line_quantity='NaN'::numeric or line_quantity<=0
       or line_quantity>1000000 or line_quantity<>round(line_quantity,4) then
      raise exception 'Quantity must be positive with at most four decimal places';
    end if;
    if length(coalesce(requested_line->>'supplier_lot',''))>120 then
      raise exception 'Supplier lot is too long';
    end if;
    perform nullif(requested_line->>'expiration_date','')::date;
    if jsonb_typeof(requested_line->'packages') is distinct from 'array'
       or jsonb_array_length(requested_line->'packages') not between 1 and 200 then
      raise exception 'Enter packages for every receipt line';
    end if;
    package_total := 0;
    for package in select value from jsonb_array_elements(requested_line->'packages') loop
      package_quantity := (package->>'quantity')::numeric;
      if package_quantity is null or package_quantity='NaN'::numeric or package_quantity<=0
         or package_quantity>1000000 or package_quantity<>round(package_quantity,4) then
        raise exception 'Package quantity must be positive with at most four decimals';
      end if;
      if nullif(package->>'supplier_barcode','') is not null
         and ((package->>'supplier_barcode')<>trim(package->>'supplier_barcode')
           or length(package->>'supplier_barcode')>120
           or package->>'supplier_barcode' !~ '^[!-~]+$'
           or upper(package->>'supplier_barcode') like 'SSU-%') then
        raise exception 'Supplier barcode must be printable ASCII without spaces or the SSU- prefix';
      end if;
      package_total := package_total+package_quantity;
      package_count := package_count+1;
    end loop;
    if package_total<>line_quantity then
      raise exception 'Package quantities must equal the received quantity';
    end if;
  end loop;
  if package_count>200 then raise exception 'Enter no more than 200 packages per delivery'; end if;

  select jsonb_build_object(
    'request_id',request_token,
    'supplier_id',requested_supplier,
    'received_on',received_date,
    'supplier_reference',trim(coalesce(payload->>'supplier_reference','')),
    'note',trim(coalesce(payload->>'note','')),
    'lines',jsonb_agg(jsonb_build_object(
      'id',(line.value->>'id')::uuid,
      'purchase_draft_line_id',(line.value->>'purchase_draft_line_id')::uuid,
      'quantity',(line.value->>'quantity')::numeric,
      'supplier_lot',coalesce(line.value->>'supplier_lot',''),
      'expiration_date',nullif(line.value->>'expiration_date','')::date,
      'packages',(select jsonb_agg(jsonb_build_object(
        'quantity',(entry.value->>'quantity')::numeric,
        'supplier_barcode',coalesce(entry.value->>'supplier_barcode','')) order by entry.ordinality)
        from jsonb_array_elements(line.value->'packages') with ordinality entry(value,ordinality))
    ) order by (line.value->>'id')::uuid)
  ) into canonical
  from jsonb_array_elements(payload->'lines') line(value);

  perform pg_advisory_xact_lock(hashtextextended(request_token::text,0));
  select * into prior from public.inventory_receipts
    where delivery_request_id=request_token
      and organization_id=public.current_org() and facility_id=public.current_facility();
  if found then
    if prior.created_by is distinct from auth.uid() or prior.delivery_payload is distinct from canonical then
      raise exception 'Request ID already used with different values';
    end if;
    if (select count(*) from public.inventory_receipt_lines saved_line
        where saved_line.receipt_id=prior.id)<>prior.delivery_line_count
       or (select count(*) from public.inventory_events event join public.inventory_receipt_lines line
          on line.id=event.receipt_line_id where line.receipt_id=prior.id)<>prior.delivery_line_count
       or (select count(*) from public.receipt_serializations serialization
          join public.inventory_receipt_lines line on line.id=serialization.receipt_line_id
          where line.receipt_id=prior.id)<>prior.delivery_line_count
       or (select count(*) from public.serialized_units unit
          join public.receipt_serializations serialization on serialization.id=unit.serialization_id
          join public.inventory_receipt_lines line on line.id=serialization.receipt_line_id
          where line.receipt_id=prior.id)<>package_count then
      raise exception 'Saved purchase delivery is incomplete';
    end if;
    return prior.id;
  end if;

  -- Blank-lot legacy receipts lock this allocator before their PO trigger locks.
  -- Pre-lock it in the same order, without issuing a sequence until validation.
  if exists(select 1 from jsonb_array_elements(canonical->'lines')
      where coalesce(value->>'supplier_lot','')='') then
    insert into public.source_lot_daily_sequences(
      organization_id,facility_id,received_on,next_sequence)
    values(public.current_org(),public.current_facility(),received_date,1)
    on conflict(organization_id,facility_id,received_on) do nothing;
    perform 1 from public.source_lot_daily_sequences
      where organization_id=public.current_org() and facility_id=public.current_facility()
        and received_on=received_date for update;
  end if;

  -- Every caller then locks all PO headers and all PO lines in UUID order. This
  -- is the same header-first order used by cancellation and receipt validation.
  perform draft.id from public.purchase_drafts draft
    where draft.id in (select line.purchase_draft_id from public.purchase_draft_lines line
      join jsonb_array_elements(canonical->'lines') requested
        on line.id=(requested.value->>'purchase_draft_line_id')::uuid)
    order by draft.id for update;
  perform line.id from public.purchase_draft_lines line
    where line.id in (select (value->>'purchase_draft_line_id')::uuid
      from jsonb_array_elements(canonical->'lines'))
    order by line.id for update;
  perform ingredient.id from public.ingredients ingredient
    where ingredient.id in (select line.ingredient_id from public.purchase_draft_lines line
      where line.id in (select (value->>'purchase_draft_line_id')::uuid
        from jsonb_array_elements(canonical->'lines')))
    order by ingredient.id for share;

  if exists(select 1 from jsonb_array_elements(canonical->'lines') requested
    left join public.purchase_draft_lines line
      on line.id=(requested.value->>'purchase_draft_line_id')::uuid
    left join public.purchase_drafts draft on draft.id=line.purchase_draft_id
    left join public.supplier_items item on item.id=line.supplier_item_id
    left join public.ingredients ingredient on ingredient.id=line.ingredient_id
    where line.id is null or draft.id is null or draft.organization_id<>public.current_org()
      or draft.facility_id<>public.current_facility() or draft.status<>'Confirmed'
      or draft.supplier_id<>requested_supplier or not item.active or not ingredient.active
      or ingredient.default_uom<>line.uom) then
    raise exception 'Select confirmed inbound from one active supplier in this facility';
  end if;
  if exists(with requested as (
      select (value->>'purchase_draft_line_id')::uuid line_id,
        sum((value->>'quantity')::numeric) quantity
      from jsonb_array_elements(canonical->'lines') group by line_id
    ), received as (
      select purchase_draft_line_id line_id,sum(quantity) quantity
      from public.inventory_receipt_lines where purchase_draft_line_id is not null
      group by purchase_draft_line_id
    )
    select line.id from public.purchase_draft_lines line
      join requested on requested.line_id=line.id
      left join received on received.line_id=line.id
    where coalesce(received.quantity,0)+requested.quantity>line.quantity) then
    raise exception 'Receipt exceeds the outstanding inbound quantity';
  end if;
  select name into supplier_name from public.suppliers
    where id=requested_supplier and organization_id=public.current_org() and active;
  if supplier_name is null then raise exception 'Choose an active supplier'; end if;

  insert into public.inventory_receipts(
    id,supplier_id,received_on,supplier_reference,note,
    delivery_request_id,delivery_payload,delivery_line_count)
  values(receipt_id,requested_supplier,received_date,
    canonical->>'supplier_reference',canonical->>'note',request_token,canonical,line_count);

  for requested_line in select value from jsonb_array_elements(canonical->'lines') loop
    select * into purchase_line from public.purchase_draft_lines
      where id=(requested_line->>'purchase_draft_line_id')::uuid;
    supplied_lot := requested_line->>'supplier_lot';
    insert into public.inventory_receipt_lines(
      id,receipt_id,ingredient_id,quantity,uom,supplier_lot,assigned_source_lot,
      source_lot_origin,expiration_date,purchase_draft_line_id)
    values((requested_line->>'id')::uuid,receipt_id,purchase_line.ingredient_id,
      (requested_line->>'quantity')::numeric,purchase_line.uom,supplied_lot,null,
      null,nullif(requested_line->>'expiration_date','')::date,purchase_line.id);
    insert into public.inventory_events(
      ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,receipt_line_id)
    values(purchase_line.ingredient_id,'Receipt',(requested_line->>'quantity')::numeric,
      purchase_line.uom,'Received from ' || supplier_name
        || case when canonical->>'supplier_reference'='' then ''
          else ' · ' || (canonical->>'supplier_reference') end,
      gen_random_uuid(),(requested_line->>'id')::uuid);
    insert into public.receipt_serializations(receipt_line_id,supplier_item_id,packages)
    values((requested_line->>'id')::uuid,purchase_line.supplier_item_id,
      requested_line->'packages');
  end loop;
  set constraints public.purchase_delivery_complete_check immediate;
  set constraints public.purchase_delivery_complete_check deferred;
  return receipt_id;
end $$;

revoke all on function public.guard_purchase_delivery_line(),
  public.guard_purchase_delivery_event(),public.assert_purchase_delivery_complete()
  from public,anon,authenticated;
revoke all on function public.receive_purchase_delivery(jsonb) from public,anon;
grant execute on function public.receive_purchase_delivery(jsonb) to authenticated;

commit;
