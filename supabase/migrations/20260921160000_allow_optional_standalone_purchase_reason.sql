begin;

-- Correct installations that received the standalone-purchasing UI before the
-- optional-reason rule. Manual replenishment is valid without a customer-order
-- override, so its line reason remains optional.
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

commit;
