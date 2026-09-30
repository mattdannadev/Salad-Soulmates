begin;

-- Purchase lines retain the supplier-price estimate used when they were created.
-- The confirmed supplier quote on purchase_drafts.total_cost remains the
-- authoritative amount and is intentionally independent from this estimate.
alter table public.purchase_draft_lines
  add column supplier_price_id uuid,
  add column estimated_unit_cost numeric(12,2),
  add column estimated_line_cost numeric(20,2),
  add column estimated_as_of date not null default current_date,
  add constraint purchase_line_estimate_complete check (
    (supplier_price_id is null and estimated_unit_cost is null and estimated_line_cost is null)
    or
    (supplier_price_id is not null and estimated_unit_cost is not null
      and estimated_line_cost is not null and estimated_unit_cost > 0
      and estimated_line_cost = estimated_unit_cost * purchase_units)
  ),
  add constraint purchase_line_supplier_price_fkey
    foreign key (organization_id,supplier_price_id)
    references public.supplier_item_prices(organization_id,id);

-- Existing lines predate supplier-price estimates. Leave them explicitly
-- unpriced rather than fabricating historical snapshots from today's catalog.
alter table public.purchase_draft_lines
  alter column estimated_as_of drop default;

create or replace function public.guard_purchase_line() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  draft public.purchase_drafts%rowtype;
  item public.supplier_items%rowtype;
  requirement jsonb;
  effective_price public.supplier_item_prices%rowtype;
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
    new.ingredient_name := requirement->>'ingredient_name';
    new.raw_shortage := (requirement->>'shortage')::numeric;
    new.recommended_units := ceil(new.raw_shortage/item.pack_quantity);
    if new.purchase_units<>new.recommended_units and length(trim(new.override_reason))<3 then raise exception 'A purchase quantity override requires a reason'; end if;
  end if;
  new.supplier_sku := item.supplier_sku;
  new.uom := item.pack_quantity_uom;
  new.purchase_uom := item.purchase_uom;
  new.pack_quantity := item.pack_quantity;
  new.quantity := new.purchase_units*item.pack_quantity;
  new.estimated_as_of := draft.expected_on;
  select * into effective_price
  from public.supplier_item_prices price
  where price.supplier_item_id=new.supplier_item_id
    and price.effective_on<=draft.expected_on
  order by price.effective_on desc,price.created_at desc
  limit 1;
  if found then
    new.supplier_price_id := effective_price.id;
    new.estimated_unit_cost := effective_price.unit_price;
    new.estimated_line_cost := effective_price.unit_price*new.purchase_units;
  else
    new.supplier_price_id := null;
    new.estimated_unit_cost := null;
    new.estimated_line_cost := null;
  end if;
  return new;
end $$;

commit;
