begin;

-- A PO may replenish stock independently of a customer order. Existing order links remain immutable.
alter table public.purchase_drafts alter column material_plan_id drop not null;
drop index public.one_open_supplier_draft;
create unique index one_open_supplier_draft on public.purchase_drafts(material_plan_id,supplier_id)
  where status='Draft' and material_plan_id is not null;

create or replace function public.guard_purchase_draft() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  if tg_op='INSERT' then
    if new.status<>'Draft' or new.created_by is distinct from auth.uid() or new.revision<>1 then
      raise exception 'Create a draft before confirming inbound'; end if;
    if new.material_plan_id is not null then
      perform 1 from public.material_plans where id=new.material_plan_id and status='Active' for share;
      if not found then raise exception 'Choose an active customer order'; end if;
    end if;
    if not exists(select 1 from public.suppliers where id=new.supplier_id and active) then
      raise exception 'Choose an active supplier'; end if;
  else
    if (to_jsonb(new)-array['status','reference','note','revision'])
       is distinct from (to_jsonb(old)-array['status','reference','note','revision']) then
      raise exception 'Purchase identity, dates and snapshots are immutable'; end if;
    if new.revision<>old.revision+1 then raise exception 'Purchase changed; reload before trying again'; end if;
    if old.status='Cancelled' or new.status=old.status or (old.status='Confirmed' and new.status<>'Cancelled') or new.status='Draft' then
      raise exception 'Invalid purchase status transition'; end if;
    if new.status='Confirmed' and (length(trim(new.reference))<1 or not exists(select 1 from public.purchase_draft_lines where purchase_draft_id=new.id)) then
      raise exception 'Enter the external order reference before confirming inbound'; end if;
    if new.status='Cancelled' and length(trim(new.note))<3 then raise exception 'Enter a cancellation reason'; end if;
    if new.status='Cancelled' and exists(select 1 from public.inventory_receipt_lines r join public.purchase_draft_lines l on l.id=r.purchase_draft_line_id where l.purchase_draft_id=new.id) then
      raise exception 'Received purchases cannot be cancelled'; end if;
  end if;
  return new;
end $$;

create or replace function public.guard_purchase_line() returns trigger
language plpgsql security invoker set search_path='' as $$
declare draft public.purchase_drafts%rowtype; item public.supplier_items%rowtype; requirement jsonb;
begin
  select * into draft from public.purchase_drafts where id=new.purchase_draft_id for update;
  if not found or draft.status<>'Draft' then raise exception 'Only draft purchases accept lines'; end if;
  select * into item from public.supplier_items where id=new.supplier_item_id and active;
  if not found or item.supplier_id<>draft.supplier_id or item.ingredient_id<>new.ingredient_id then raise exception 'Choose an active supplier pack for this ingredient'; end if;
  if draft.material_plan_id is null then
    if length(trim(new.override_reason))<3 then raise exception 'A standalone purchase requires a reason'; end if;
    new.ingredient_name := (select name from public.ingredients where id=new.ingredient_id and active);
    if new.ingredient_name is null then raise exception 'Choose an active ingredient'; end if;
    new.raw_shortage := new.purchase_units * item.pack_quantity;
    new.recommended_units := new.purchase_units;
  else
    select value into requirement from jsonb_array_elements(public.material_requirements(draft.material_plan_id)) where value->>'ingredient_id'=new.ingredient_id::text;
    if requirement is null or (requirement->>'shortage')::numeric<=0 then raise exception 'This ingredient has no current shortage'; end if;
    if item.pack_quantity_uom<>requirement->>'uom' then raise exception 'Configure a validated pack in the ingredient base unit'; end if;
    new.ingredient_name := requirement->>'ingredient_name'; new.raw_shortage := (requirement->>'shortage')::numeric;
    new.recommended_units := ceil(new.raw_shortage/item.pack_quantity);
    if new.purchase_units<>new.recommended_units and length(trim(new.override_reason))<3 then raise exception 'A purchase quantity override requires a reason'; end if;
  end if;
  new.supplier_sku := item.supplier_sku; new.uom := item.pack_quantity_uom; new.purchase_uom := item.purchase_uom;
  new.pack_quantity := item.pack_quantity; new.quantity := new.purchase_units*item.pack_quantity;
  return new;
end $$;

create or replace function public.create_purchase_draft(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid := (payload->>'id')::uuid; prior public.purchase_drafts%rowtype; line jsonb; requested_plan uuid; purchase_kind text;
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  if requested_id is null or jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 200 then raise exception 'Select purchase lines'; end if;
  purchase_kind := coalesce(payload->>'kind', case when payload->>'material_plan_id' is null then 'standalone' else 'order' end);
  if payload->>'supplier_id' is null or payload->>'expected_on' is null or purchase_kind not in ('order','standalone') then raise exception 'Purchase identity and expected date are required'; end if;
  if purchase_kind='order' and (payload->>'material_plan_id') is null then raise exception 'Choose an active customer order'; end if;
  if purchase_kind='standalone' and (payload->>'material_plan_id') is not null then raise exception 'Standalone purchases cannot link a customer order'; end if;
  requested_plan := (payload->>'material_plan_id')::uuid;
  if (select count(distinct value->>'ingredient_id') from jsonb_array_elements(payload->'lines'))<>jsonb_array_length(payload->'lines') then raise exception 'An ingredient may appear only once per draft'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0)); select * into prior from public.purchase_drafts where id=requested_id;
  if found then
    if prior.created_by is distinct from auth.uid() or prior.material_plan_id is distinct from requested_plan or prior.supplier_id is distinct from (payload->>'supplier_id')::uuid or prior.expected_on is distinct from (payload->>'expected_on')::date or (select count(*) from public.purchase_draft_lines where purchase_draft_id=prior.id)<>jsonb_array_length(payload->'lines') then raise exception 'Request ID already used with different values'; end if;
    return prior.id;
  end if;
  insert into public.purchase_drafts(id,material_plan_id,supplier_id,expected_on) values(requested_id,requested_plan,(payload->>'supplier_id')::uuid,(payload->>'expected_on')::date);
  for line in select value from jsonb_array_elements(payload->'lines') loop
    if (line->>'purchase_units')::numeric is null or (line->>'purchase_units')::numeric<>trunc((line->>'purchase_units')::numeric) then raise exception 'Purchase units must be whole numbers'; end if;
    insert into public.purchase_draft_lines(purchase_draft_id,ingredient_id,supplier_item_id,purchase_units,override_reason) values(requested_id,(line->>'ingredient_id')::uuid,(line->>'supplier_item_id')::uuid,(line->>'purchase_units')::integer,trim(coalesce(line->>'override_reason','')));
  end loop;
  return requested_id;
end $$;

commit;
