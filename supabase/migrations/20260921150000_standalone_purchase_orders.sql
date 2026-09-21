begin;

-- Manual replenishment is an actual purchase order. The legacy draft-named tables
-- and RPC remain for compatibility with order-driven purchasing.
create or replace function public.guard_purchase_line() returns trigger
language plpgsql security invoker set search_path='' as $$
declare draft public.purchase_drafts%rowtype; item public.supplier_items%rowtype; requirement jsonb;
begin
  select * into draft from public.purchase_drafts where id=new.purchase_draft_id for update;
  if not found or draft.status<>'Draft' then raise exception 'Only draft purchases accept lines'; end if;
  select * into item from public.supplier_items where id=new.supplier_item_id and active;
  if not found or item.supplier_id<>draft.supplier_id or item.ingredient_id<>new.ingredient_id then raise exception 'Choose an active supplier pack for this ingredient'; end if;
  if draft.material_plan_id is null then
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
  if (select count(distinct value->>'ingredient_id') from jsonb_array_elements(payload->'lines'))<>jsonb_array_length(payload->'lines') then raise exception 'An ingredient may appear only once per purchase'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0)); select * into prior from public.purchase_drafts where id=requested_id;
  if found then
    if prior.created_by is distinct from auth.uid() or prior.material_plan_id is distinct from requested_plan or prior.supplier_id is distinct from (payload->>'supplier_id')::uuid or prior.expected_on is distinct from (payload->>'expected_on')::date
       or prior.status is distinct from (case when purchase_kind='standalone' then 'Confirmed' else 'Draft' end)
       or (select count(*) from public.purchase_draft_lines where purchase_draft_id=prior.id)<>jsonb_array_length(payload->'lines')
       or exists(select 1 from jsonb_array_elements(payload->'lines') requested
         where not exists(select 1 from public.purchase_draft_lines saved where saved.purchase_draft_id=prior.id
           and saved.ingredient_id=(requested->>'ingredient_id')::uuid
           and saved.supplier_item_id=(requested->>'supplier_item_id')::uuid
           and saved.purchase_units=(requested->>'purchase_units')::numeric
           and saved.override_reason=trim(coalesce(requested->>'override_reason','')))) then
      raise exception 'Request ID already used with different values'; end if;
    return prior.id;
  end if;
  insert into public.purchase_drafts(id,material_plan_id,supplier_id,expected_on) values(requested_id,requested_plan,(payload->>'supplier_id')::uuid,(payload->>'expected_on')::date);
  for line in select value from jsonb_array_elements(payload->'lines') loop
    if (line->>'purchase_units')::numeric is null or (line->>'purchase_units')::numeric<>trunc((line->>'purchase_units')::numeric) then raise exception 'Purchase units must be whole numbers'; end if;
    insert into public.purchase_draft_lines(purchase_draft_id,ingredient_id,supplier_item_id,purchase_units,override_reason) values(requested_id,(line->>'ingredient_id')::uuid,(line->>'supplier_item_id')::uuid,(line->>'purchase_units')::integer,trim(coalesce(line->>'override_reason','')));
  end loop;
  if purchase_kind='standalone' then
    update public.purchase_drafts
      set status='Confirmed',reference='PO-' || upper(right(replace(requested_id::text,'-',''),8)),revision=revision+1
      where id=requested_id;
  end if;
  return requested_id;
end $$;

commit;
