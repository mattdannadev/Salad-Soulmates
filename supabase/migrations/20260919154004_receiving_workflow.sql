-- Posted receipts tie supplier deliveries to immutable inventory history.
create table public.inventory_receipts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org(),
 facility_id uuid not null default public.current_facility(), supplier_id uuid not null,
 received_on date not null, supplier_reference text not null default '', note text not null default '',
 created_by uuid not null default auth.uid() references auth.users, created_at timestamptz not null default now(),
 foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
 foreign key(organization_id,supplier_id) references public.suppliers(organization_id,id), unique(organization_id,id)
);
create table public.inventory_receipt_lines (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org(),
 receipt_id uuid not null, ingredient_id uuid not null, quantity numeric(14,4) not null check(quantity > 0 and quantity <> 'NaN'::numeric),
 uom text not null check(uom in ('lb','oz','gal','each')), supplier_lot text not null default '', expiration_date date,
 foreign key(organization_id,receipt_id) references public.inventory_receipts(organization_id,id),
 foreign key(organization_id,ingredient_id) references public.ingredients(organization_id,id), unique(organization_id,id)
);
alter table public.inventory_events add column receipt_line_id uuid unique references public.inventory_receipt_lines;
alter table public.inventory_events drop constraint inventory_events_event_type_check;
alter table public.inventory_events add constraint inventory_events_event_type_check
  check(event_type in ('OpeningBalance','Adjustment','Receipt'));

drop policy read_master on public.ingredients;
create policy read_master on public.ingredients for select to authenticated
 using(organization_id=public.current_org() and public.current_role() in ('admin','reviewer','receiver'));
drop policy read_master on public.suppliers;
create policy read_master on public.suppliers for select to authenticated
 using(organization_id=public.current_org() and public.current_role() in ('admin','reviewer','receiver'));

alter table public.inventory_receipts enable row level security;
alter table public.inventory_receipt_lines enable row level security;
create policy receipt_read on public.inventory_receipts for select to authenticated
 using(organization_id=public.current_org() and facility_id=public.current_facility() and public.current_role() in ('admin','reviewer','receiver'));
create policy receipt_add on public.inventory_receipts for insert to authenticated
 with check(organization_id=public.current_org() and facility_id=public.current_facility() and public.current_role() in ('admin','receiver') and created_by=auth.uid());
create policy receipt_line_read on public.inventory_receipt_lines for select to authenticated
 using(organization_id=public.current_org() and exists(select 1 from public.inventory_receipts r where r.id=receipt_id and r.facility_id=public.current_facility()) and public.current_role() in ('admin','reviewer','receiver'));
create policy receipt_line_add on public.inventory_receipt_lines for insert to authenticated
 with check(organization_id=public.current_org() and exists(select 1 from public.inventory_receipts r where r.id=receipt_id and r.facility_id=public.current_facility()) and public.current_role() in ('admin','receiver'));
drop policy inventory_read on public.inventory_events;
create policy inventory_read on public.inventory_events for select to authenticated
 using(organization_id=public.current_org() and facility_id=public.current_facility() and public.current_role() in ('admin','reviewer','receiver'));
drop policy inventory_add on public.inventory_events;
create policy inventory_add on public.inventory_events for insert to authenticated
 with check(organization_id=public.current_org() and facility_id=public.current_facility() and public.current_role() in ('admin','receiver') and created_by=auth.uid());

create function public.post_inventory_receipt(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare receipt_id uuid := gen_random_uuid();
declare line_id uuid := gen_random_uuid();
declare ingredient_unit text;
declare supplier_name text;
begin
 if public.current_role() not in ('admin','receiver') or public.current_role() is null then raise exception 'Receiving access required'; end if;
 select default_uom into ingredient_unit from public.ingredients where id=(payload->>'ingredient_id')::uuid;
 if ingredient_unit is null or ingredient_unit is distinct from payload->>'uom' then raise exception 'Receipt unit must match ingredient base unit'; end if;
 select name into supplier_name from public.suppliers where id=(payload->>'supplier_id')::uuid and active;
 if supplier_name is null then raise exception 'Choose an active supplier'; end if;
 insert into public.inventory_receipts(id,supplier_id,received_on,supplier_reference,note)
 values(receipt_id,(payload->>'supplier_id')::uuid,(payload->>'received_on')::date,trim(coalesce(payload->>'supplier_reference','')),trim(coalesce(payload->>'note','')));
 insert into public.inventory_receipt_lines(id,receipt_id,ingredient_id,quantity,uom,supplier_lot,expiration_date)
 values(line_id,receipt_id,(payload->>'ingredient_id')::uuid,(payload->>'quantity')::numeric,payload->>'uom',trim(coalesce(payload->>'supplier_lot','')),nullif(payload->>'expiration_date','')::date);
 insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,receipt_line_id)
 values((payload->>'ingredient_id')::uuid,'Receipt',(payload->>'quantity')::numeric,payload->>'uom',
   'Received from ' || supplier_name || case when trim(coalesce(payload->>'supplier_reference',''))='' then '' else ' · ' || trim(payload->>'supplier_reference') end,
   coalesce(nullif(payload->>'request_id','')::uuid,gen_random_uuid()),line_id);
 return receipt_id;
end $$;

create trigger receipt_audit after insert on public.inventory_receipts for each row execute function public.audit_change();
create trigger receipt_line_audit after insert on public.inventory_receipt_lines for each row execute function public.audit_change();
revoke all on public.inventory_receipts,public.inventory_receipt_lines from anon,authenticated;
grant select,insert on public.inventory_receipts,public.inventory_receipt_lines to authenticated;
revoke all on function public.post_inventory_receipt(jsonb) from public,anon;
grant execute on function public.post_inventory_receipt(jsonb) to authenticated;
create index receipt_lookup on public.inventory_receipts(organization_id,facility_id,received_on desc);
create index receipt_line_lookup on public.inventory_receipt_lines(organization_id,receipt_id,ingredient_id);
