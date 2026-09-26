begin;

-- Inventory policy values are stored in each ingredient's base unit.  Null means
-- the organization has not set that control yet, rather than treating it as zero.
alter table public.ingredients
  add column reorder_point numeric(14,4),
  add column par_level numeric(14,4),
  add column reorder_quantity numeric(14,4),
  add constraint ingredients_reorder_point_check check (reorder_point is null or (reorder_point >= 0 and reorder_point <> 'NaN'::numeric)),
  add constraint ingredients_par_level_check check (par_level is null or (par_level >= 0 and par_level <> 'NaN'::numeric)),
  add constraint ingredients_reorder_quantity_check check (reorder_quantity is null or (reorder_quantity > 0 and reorder_quantity <> 'NaN'::numeric)),
  add constraint ingredients_par_at_least_reorder_check check (par_level is null or reorder_point is null or par_level >= reorder_point);

alter table public.inventory_events
  add column effective_on date not null default current_date;

update public.inventory_events event
set effective_on = receipt.received_on
from public.inventory_receipt_lines line
join public.inventory_receipts receipt on receipt.id = line.receipt_id
where event.receipt_line_id = line.id;

alter table public.inventory_events drop constraint inventory_events_event_type_check;
alter table public.inventory_events add constraint inventory_events_event_type_check
  check(event_type in ('OpeningBalance','Adjustment','Receipt','ManualGain','ManualShrink','OrderUsage'));

create or replace function public.validate_inventory() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.uom is distinct from (select default_uom from public.ingredients where id = new.ingredient_id) then
  raise exception 'Inventory unit must match ingredient base unit';
 end if;
 if new.created_by <> auth.uid() then raise exception 'Invalid inventory actor'; end if;
 if new.event_type = 'OpeningBalance' and new.quantity_delta < 0 then raise exception 'Opening balance must be positive'; end if;
 if new.event_type = 'ManualGain' and new.quantity_delta <= 0 then raise exception 'Manual gain must be positive'; end if;
 if new.event_type in ('ManualShrink','OrderUsage') and new.quantity_delta >= 0 then raise exception 'Inventory shrink and order usage must be negative'; end if;
 if new.event_type = 'Receipt' and new.quantity_delta <= 0 then raise exception 'Receipt must be positive'; end if;
 return new;
end $$;

-- Receipt events inherit the operational receipt date. Manual events retain the
-- effective date supplied by the inventory adjustment form.
create function public.set_inventory_effective_date() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.event_type = 'Receipt' and new.receipt_line_id is not null then
  select receipt.received_on into new.effective_on
  from public.inventory_receipt_lines line
  join public.inventory_receipts receipt on receipt.id = line.receipt_id
  where line.id = new.receipt_line_id;
 end if;
 return new;
end $$;
create trigger inventory_effective_date before insert on public.inventory_events
  for each row execute function public.set_inventory_effective_date();

create or replace function public.save_ingredient(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid; allergen uuid;
begin
 if not public.has_permission('master_data.write') then raise exception 'Master data permission required'; end if;
 if not exists(select 1 from public.reference_options where organization_id=public.current_org() and list_code='ingredient_category' and code=payload->>'category' and active) then raise exception 'Choose an active ingredient type'; end if;
 result := coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 insert into public.ingredients(id,name,category,default_uom,description,storage_notes,active,reorder_point,par_level,reorder_quantity)
 values(result,trim(payload->>'name'),payload->>'category',payload->>'default_uom',coalesce(payload->>'description',''),coalesce(payload->>'storage_notes',''),coalesce((payload->>'active')::boolean,true),nullif(payload->>'reorder_point','')::numeric,nullif(payload->>'par_level','')::numeric,nullif(payload->>'reorder_quantity','')::numeric)
 on conflict(id) do update set name=excluded.name,category=excluded.category,default_uom=excluded.default_uom,description=excluded.description,storage_notes=excluded.storage_notes,active=excluded.active,reorder_point=excluded.reorder_point,par_level=excluded.par_level,reorder_quantity=excluded.reorder_quantity;
 if length(trim(coalesce(payload->>'spanish_name',''))) > 0 then
  insert into public.ingredient_translations(ingredient_id,display_name) values(result,trim(payload->>'spanish_name'))
  on conflict(ingredient_id) do update set display_name=excluded.display_name,approved_by=auth.uid(),approved_at=now();
 elsif exists(select 1 from public.ingredient_translations where ingredient_id=result) then raise exception 'An approved Spanish name cannot be cleared. Enter a reviewed replacement.'; end if;
 delete from public.ingredient_allergens where ingredient_id=result;
 for allergen in select jsonb_array_elements_text(coalesce(payload->'allergen_ids','[]'::jsonb))::uuid loop insert into public.ingredient_allergens(ingredient_id,allergen_id) values(result,allergen); end loop;
 return result;
end $$;

create index inventory_events_effective_on_lookup on public.inventory_events(organization_id, facility_id, effective_on desc, created_at desc);

commit;
