begin;

-- One catalog is the source of truth for inventory and purchasing measures.
-- Packaging is intentionally a family too: a purchase can be a case or pail,
-- while its contents remain in an inventory unit such as kg or gallons.
create table public.uom_families (
  organization_id uuid not null default public.current_org() references public.organizations,
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,49}$'),
  label_en text not null check (length(trim(label_en)) between 1 and 100),
  label_es text not null check (length(trim(label_es)) between 1 and 100),
  sort_order integer not null default 0,
  active boolean not null default true,
  primary key (organization_id, code)
);

create table public.uoms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org() references public.organizations,
  family_code text not null,
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,49}$'),
  label_en text not null check (length(trim(label_en)) between 1 and 100),
  label_es text not null check (length(trim(label_es)) between 1 and 100),
  measurement_system text not null check (measurement_system in ('metric','imperial','universal')),
  is_inventory_unit boolean not null default false,
  is_purchase_unit boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  foreign key (organization_id, family_code) references public.uom_families(organization_id, code),
  unique (organization_id, code),
  check (is_inventory_unit or is_purchase_unit)
);

do $$ declare org uuid; begin
  for org in select id from public.organizations loop
    insert into public.uom_families(organization_id,code,label_en,label_es,sort_order) values
      (org,'mass','Mass / weight','Masa / peso',10),
      (org,'volume','Volume','Volumen',20),
      (org,'count','Count','Conteo',30),
      (org,'packaging','Packaging','Empaque',40)
    on conflict do nothing;
    insert into public.uoms(organization_id,family_code,code,label_en,label_es,measurement_system,is_inventory_unit,is_purchase_unit,sort_order) values
      (org,'mass','lb','Pound (lb)','Libra (lb)','imperial',true,false,10),
      (org,'mass','oz','Ounce (oz)','Onza (oz)','imperial',true,false,20),
      (org,'mass','kg','Kilogram (kg)','Kilogramo (kg)','metric',true,false,30),
      (org,'mass','g','Gram (g)','Gramo (g)','metric',true,false,40),
      (org,'volume','gal','Gallon (gal)','Galón (gal)','imperial',true,false,10),
      (org,'volume','fl_oz','Fluid ounce (fl oz)','Onza líquida (fl oz)','imperial',true,false,20),
      (org,'volume','l','Liter (L)','Litro (L)','metric',true,false,30),
      (org,'volume','ml','Milliliter (mL)','Mililitro (mL)','metric',true,false,40),
      (org,'count','each','Each','Cada uno','universal',true,true,10),
      (org,'packaging','bag','Bag','Bolsa','universal',false,true,10),
      (org,'packaging','case','Case','Caja','universal',false,true,20),
      (org,'packaging','pail','Pail','Cubeta','universal',false,true,30)
    on conflict do nothing;
  end loop;
end $$;

alter table public.ingredients drop constraint ingredients_default_uom_check;
alter table public.supplier_items drop constraint supplier_items_purchase_uom_check;
alter table public.supplier_items drop constraint supplier_items_pack_quantity_uom_check;
alter table public.feedback_items drop constraint feedback_items_feedback_type_check;

create or replace function public.validate_canonical_uom() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'ingredients' and not exists (
    select 1 from public.uoms where organization_id=new.organization_id and code=new.default_uom
      and active and is_inventory_unit
  ) then raise exception 'Choose an active inventory unit'; end if;
  if tg_table_name = 'supplier_items' and (
    not exists (select 1 from public.uoms where organization_id=new.organization_id and code=new.purchase_uom and active and is_purchase_unit)
    or not exists (select 1 from public.uoms where organization_id=new.organization_id and code=new.pack_quantity_uom and active and is_inventory_unit)
  ) then raise exception 'Choose active shared purchase and content units'; end if;
  if tg_table_name = 'feedback_items' and not exists (
    select 1 from public.reference_options where organization_id=new.organization_id and list_code='feedback_type'
      and code=new.feedback_type and active
  ) then raise exception 'Choose an active feedback type'; end if;
  return new;
end $$;
create trigger canonical_ingredient_uom before insert or update of default_uom on public.ingredients for each row execute function public.validate_canonical_uom();
create trigger canonical_supplier_item_uom before insert or update of purchase_uom,pack_quantity_uom on public.supplier_items for each row execute function public.validate_canonical_uom();
create trigger canonical_feedback_type before insert or update of feedback_type on public.feedback_items for each row execute function public.validate_canonical_uom();

alter table public.uom_families enable row level security;
alter table public.uoms enable row level security;
create policy uom_family_read on public.uom_families for select to authenticated using (organization_id=public.current_org());
create policy uom_family_manage on public.uom_families for all to authenticated using (organization_id=public.current_org() and public.has_permission('settings.manage')) with check (organization_id=public.current_org() and public.has_permission('settings.manage'));
create policy uom_read on public.uoms for select to authenticated using (organization_id=public.current_org());
create policy uom_manage on public.uoms for all to authenticated using (organization_id=public.current_org() and public.has_permission('settings.manage')) with check (organization_id=public.current_org() and public.has_permission('settings.manage'));
revoke all on public.uom_families, public.uoms from anon, authenticated;
grant select, insert, update, delete on public.uom_families, public.uoms to authenticated;
create index uoms_active_lookup on public.uoms(organization_id, family_code, active, sort_order);

-- These lists were a duplicate presentation of the new catalog. Keep their historic
-- values intact for audit, but prevent future configuration from diverging.
update public.reference_lists set area='Legacy', allow_custom_values=false
where code in ('base_unit','purchase_unit');
update public.reference_lists set allow_custom_values=true where code='feedback_type';

commit;
