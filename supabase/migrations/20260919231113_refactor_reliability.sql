-- Forward-only fixes; run on disposable databases first. Never reset hosted data.
alter table public.feedback_items drop constraint feedback_items_route_check;
alter table public.feedback_items add constraint feedback_items_route_check
  check (route ~ '^/(app|worker|receiving)(/|$)');

create or replace function public.post_inventory_receipt(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare receipt_id uuid := gen_random_uuid(); line_id uuid := gen_random_uuid(); ingredient_unit text; supplier_name text; prior_event public.inventory_events%rowtype; prior_receipt public.inventory_receipts%rowtype; prior_line public.inventory_receipt_lines%rowtype; request_token uuid := (payload->>'request_id')::uuid;
begin
 if not public.has_permission('inventory.receive') then raise exception 'Receiving permission required'; end if;
 if request_token is null then raise exception 'Request ID is required'; end if;
 if (payload->>'quantity')::numeric <= 0 or (payload->>'quantity')::numeric > 1000000
    or (payload->>'quantity')::numeric <> round((payload->>'quantity')::numeric,4) then
   raise exception 'Quantity must be positive with at most four decimal places';
 end if;
 -- Serialize only this business request. The unique request constraint remains the final guard.
 perform pg_advisory_xact_lock(hashtextextended(request_token::text,0));
 select * into prior_event from public.inventory_events where request_id=request_token;
 if found then
   select * into prior_line from public.inventory_receipt_lines where id=prior_event.receipt_line_id;
   select * into prior_receipt from public.inventory_receipts where id=prior_line.receipt_id;
   if prior_event.event_type='Receipt' and prior_event.created_by=auth.uid()
      and prior_event.ingredient_id=(payload->>'ingredient_id')::uuid
      and prior_event.quantity_delta=(payload->>'quantity')::numeric
      and prior_event.uom=payload->>'uom'
      and prior_receipt.supplier_id=(payload->>'supplier_id')::uuid
      and prior_receipt.received_on=(payload->>'received_on')::date
      and prior_receipt.supplier_reference=trim(coalesce(payload->>'supplier_reference',''))
      and prior_receipt.note=trim(coalesce(payload->>'note',''))
      and prior_line.supplier_lot=trim(coalesce(payload->>'supplier_lot',''))
      and prior_line.expiration_date is not distinct from nullif(payload->>'expiration_date','')::date then
     return prior_receipt.id;
   end if;
   raise exception 'Request ID already used with different values';
 end if;
 select default_uom into ingredient_unit from public.ingredients where id=(payload->>'ingredient_id')::uuid and active;
 if ingredient_unit is null or ingredient_unit is distinct from payload->>'uom' then raise exception 'Receipt unit must match ingredient base unit'; end if;
 select name into supplier_name from public.suppliers where id=(payload->>'supplier_id')::uuid and active;
 if supplier_name is null then raise exception 'Choose an active supplier'; end if;
 insert into public.inventory_receipts(id,supplier_id,received_on,supplier_reference,note) values(receipt_id,(payload->>'supplier_id')::uuid,(payload->>'received_on')::date,trim(coalesce(payload->>'supplier_reference','')),trim(coalesce(payload->>'note','')));
 insert into public.inventory_receipt_lines(id,receipt_id,ingredient_id,quantity,uom,supplier_lot,expiration_date) values(line_id,receipt_id,(payload->>'ingredient_id')::uuid,(payload->>'quantity')::numeric,payload->>'uom',trim(coalesce(payload->>'supplier_lot','')),nullif(payload->>'expiration_date','')::date);
 insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,receipt_line_id) values((payload->>'ingredient_id')::uuid,'Receipt',(payload->>'quantity')::numeric,payload->>'uom','Received from '||supplier_name||case when trim(coalesce(payload->>'supplier_reference',''))='' then '' else ' · '||trim(payload->>'supplier_reference') end,coalesce(nullif(payload->>'request_id','')::uuid,gen_random_uuid()),line_id);
 return receipt_id;
end $$;

-- Labels are editable; codes already stored on business records are immutable.
create function public.guard_reference_option() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.list_code<>old.list_code or new.code<>old.code) then
   raise exception 'Reference codes cannot be changed';
 end if;
 if tg_op='INSERT' and not exists (
   select 1 from public.reference_lists where organization_id=new.organization_id
   and code=new.list_code and allow_custom_values
 ) then raise exception 'This reference list does not allow custom values'; end if;
 return new;
end $$;
create trigger reference_option_guard before insert or update on public.reference_options
for each row execute function public.guard_reference_option();
revoke all on function public.guard_reference_option() from public,anon,authenticated;
