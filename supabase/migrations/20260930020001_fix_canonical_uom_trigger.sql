begin;

-- Do not access fields that do not exist on the row being validated.
create or replace function public.validate_canonical_uom() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'ingredients' then
    if not exists (select 1 from public.uoms where organization_id = new.organization_id and code = new.default_uom and active and is_inventory_unit) then raise exception 'Choose an active inventory unit'; end if;
  elsif tg_table_name = 'supplier_items' then
    if not exists (select 1 from public.uoms where organization_id = new.organization_id and code = new.purchase_uom and active and is_purchase_unit)
      or not exists (select 1 from public.uoms where organization_id = new.organization_id and code = new.pack_quantity_uom and active and is_inventory_unit) then raise exception 'Choose active shared purchase and content units'; end if;
  elsif tg_table_name = 'feedback_items' then
    if not exists (select 1 from public.reference_options where organization_id = new.organization_id and list_code = 'feedback_type' and code = new.feedback_type and active) then raise exception 'Choose an active feedback type'; end if;
  end if;
  return new;
end;
$$;

commit;
