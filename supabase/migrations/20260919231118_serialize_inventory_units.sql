begin;

-- Hold the ingredient row through inventory commit, so a base-unit update cannot
-- pass its history check while the first posting is still uncommitted.
-- A receiver may read ingredients but may not update them. The trigger therefore
-- needs a narrowly scoped definer context to acquire FOR SHARE. It returns no
-- queried data, explicitly checks tenant/actor, and does not replace INSERT RLS.
create or replace function public.validate_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ingredient_unit text;
begin
  if auth.uid() is null or new.created_by is distinct from auth.uid() then
    raise exception 'Invalid inventory actor';
  end if;
  if new.organization_id is distinct from public.current_org()
     or new.facility_id is distinct from public.current_facility() then
    raise exception 'Invalid inventory organization or facility';
  end if;
  if not public.has_permission(case when new.event_type = 'Receipt'
      then 'inventory.receive' else 'inventory.adjust' end) then
    raise exception 'Inventory permission required';
  end if;
  select default_uom into ingredient_unit
    from public.ingredients
    where id = new.ingredient_id and organization_id = public.current_org()
    for share;
  if ingredient_unit is null or new.uom is distinct from ingredient_unit then
    raise exception 'Inventory unit must match ingredient base unit';
  end if;
  if new.event_type = 'OpeningBalance' and new.quantity_delta < 0 then
    raise exception 'Opening balance must be positive';
  end if;
  return new;
end $$;
revoke execute on function public.validate_inventory() from public, anon, authenticated;

commit;
