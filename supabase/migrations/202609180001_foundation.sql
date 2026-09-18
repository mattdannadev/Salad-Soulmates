-- Foundation and the first master-data slice. All writes use the signed-in user.
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null,
 slug text not null unique, created_at timestamptz not null default now()
);
create table public.facilities (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 name text not null, timezone text not null default 'America/Chicago', active boolean not null default true,
 unique (organization_id, id)
);
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 organization_id uuid not null references public.organizations, facility_id uuid not null,
 display_name text not null, role text not null check (role in ('admin','reviewer','worker','receiver')),
 preferred_locale text not null default 'es' check (preferred_locale in ('es','en')),
 active boolean not null default true,
 foreign key (organization_id, facility_id) references public.facilities(organization_id,id)
);
-- Security-definer helpers read only the caller's provisioned profile, preventing recursive RLS.
create function public.current_org() returns uuid language sql stable security definer set search_path = '' as $$
 select organization_id from public.profiles where id = auth.uid() and active
$$;
create function public.current_role() returns text language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id = auth.uid() and active
$$;
create function public.current_facility() returns uuid language sql stable security definer set search_path = '' as $$
 select facility_id from public.profiles where id = auth.uid() and active
$$;
create table public.ingredients (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org() references public.organizations,
 name text not null check (length(trim(name)) between 1 and 120), internal_code text,
 category text not null default 'Dry' check(category in ('Dry','Liquid','Refrigerated')), default_uom text not null check (default_uom in ('lb','oz','gal','each')),
 description text not null default '', storage_notes text not null default '',
 traceability_mode text not null default 'future_required' check (traceability_mode in ('future_required','not_required')),
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (organization_id,id)
);
create unique index ingredients_org_name on public.ingredients(organization_id,lower(trim(name)));
create table public.ingredient_translations (
 organization_id uuid not null default public.current_org(), ingredient_id uuid primary key,
 locale text not null default 'es' check(locale = 'es'), display_name text not null check(length(trim(display_name)) between 1 and 120),
 approved_by uuid not null default auth.uid() references auth.users, approved_at timestamptz not null default now(),
 foreign key (organization_id,ingredient_id) references public.ingredients(organization_id,id)
);
create table public.allergens (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org() references public.organizations,
 name text not null check(length(trim(name)) between 1 and 80), unique(organization_id,name), unique(organization_id,id)
);
create table public.ingredient_allergens (
 organization_id uuid not null default public.current_org(), ingredient_id uuid not null, allergen_id uuid not null,
 primary key(ingredient_id,allergen_id),
 foreign key(organization_id,ingredient_id) references public.ingredients(organization_id,id),
 foreign key(organization_id,allergen_id) references public.allergens(organization_id,id)
);
create table public.suppliers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org() references public.organizations,
 name text not null check(length(trim(name)) between 1 and 120), contact_name text not null default '',
 email text not null default '', phone text not null default '', lead_time_days integer check(lead_time_days >= 0),
 active boolean not null default true, created_at timestamptz not null default now(), unique(organization_id,id)
);
create unique index suppliers_org_name on public.suppliers(organization_id,lower(trim(name)));
create table public.supplier_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org(), supplier_id uuid not null, ingredient_id uuid not null,
 supplier_sku text not null default '', purchase_uom text not null check(purchase_uom in ('pail','bag','case','each')),
 pack_quantity numeric(14,4) not null check(pack_quantity > 0 and pack_quantity <> 'NaN'::numeric), pack_quantity_uom text not null check(pack_quantity_uom in ('lb','oz','gal','each')),
 is_preferred boolean not null default false, active boolean not null default true, notes text not null default '',
 foreign key(organization_id,supplier_id) references public.suppliers(organization_id,id),
 foreign key(organization_id,ingredient_id) references public.ingredients(organization_id,id), unique(organization_id,id)
);
create unique index one_preferred_pack on public.supplier_items(organization_id,ingredient_id) where is_preferred and active;
create table public.inventory_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org(), facility_id uuid not null default public.current_facility(),
 ingredient_id uuid not null, event_type text not null check(event_type in ('OpeningBalance','Adjustment')),
 quantity_delta numeric(14,4) not null check(quantity_delta <> 0 and quantity_delta <> 'NaN'::numeric), uom text not null,
 reason_note text not null check(length(trim(reason_note)) between 3 and 1000),
 created_by uuid not null default auth.uid() references auth.users, created_at timestamptz not null default now(),
 request_id uuid not null unique,
 foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
 foreign key(organization_id,ingredient_id) references public.ingredients(organization_id,id)
);
create table public.feedback_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org() references public.organizations,
 submitted_by uuid not null default auth.uid() references auth.users, route text not null check(route ~ '^/(app|worker)(/|$)'),
 entity_type text, entity_id uuid, comment text not null check(length(trim(comment)) between 1 and 2000),
 feedback_type text not null default 'Suggestion' check(feedback_type in ('Suggestion','Issue','Positive','Question')),
 status text not null default 'New' check(status in ('New','Reviewed','Resolved')),
 resolution_note text not null default '', app_version text, created_at timestamptz not null default now()
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 actor_user_id uuid references auth.users, entity_type text not null, entity_id uuid not null,
 event_type text not null, before_data jsonb, after_data jsonb, occurred_at timestamptz not null default now()
);
create function public.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data)
 values(new.organization_id,auth.uid(),tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'ingredient_id')::uuid,tg_op,
 case when tg_op = 'UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
create function public.validate_inventory() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.uom is distinct from (select default_uom from public.ingredients where id = new.ingredient_id) then
  raise exception 'Inventory unit must match ingredient base unit';
 end if;
 if new.created_by <> auth.uid() then raise exception 'Invalid inventory actor'; end if;
 if new.event_type = 'OpeningBalance' and new.quantity_delta < 0 then raise exception 'Opening balance must be positive'; end if;
 return new;
end $$;
create trigger inventory_validate before insert on public.inventory_events for each row execute function public.validate_inventory();
create function public.guard_ingredient_unit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.default_uom <> old.default_uom and exists(select 1 from public.inventory_events where ingredient_id = old.id) then
  raise exception 'Base unit cannot change after inventory history exists';
 end if;
 new.updated_at = now(); return new;
end $$;
create trigger ingredient_unit before update on public.ingredients for each row execute function public.guard_ingredient_unit();
alter table public.organizations enable row level security;
alter table public.facilities enable row level security;
alter table public.profiles enable row level security;
create policy org_read on public.organizations for select to authenticated using(id=public.current_org());
create policy facility_read on public.facilities for select to authenticated using(organization_id=public.current_org() and (id=public.current_facility() or public.current_role()='admin'));
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or (organization_id=public.current_org() and public.current_role()='admin'));
-- Profile roles/org membership are provisioned out-of-band; users cannot self-promote.
do $$ declare t text; begin
 foreach t in array array['ingredients','ingredient_translations','allergens','ingredient_allergens','suppliers','supplier_items'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy read_master on public.%I for select to authenticated using(organization_id=public.current_org() and public.current_role() in (''admin'',''reviewer''))',t);
  execute format('create policy insert_master on public.%I for insert to authenticated with check(organization_id=public.current_org() and public.current_role()=''admin'')',t);
  execute format('create policy update_master on public.%I for update to authenticated using(organization_id=public.current_org() and public.current_role()=''admin'') with check(organization_id=public.current_org() and public.current_role()=''admin'')',t);
 end loop;
 foreach t in array array['ingredients','ingredient_translations','suppliers','supplier_items','inventory_events'] loop
  execute format('create trigger audit_write after insert or update on public.%I for each row execute function public.audit_change()',t);
 end loop;
end $$;
alter table public.inventory_events enable row level security;
create policy inventory_read on public.inventory_events for select to authenticated using(organization_id=public.current_org() and facility_id=public.current_facility() and public.current_role() in ('admin','reviewer'));
create policy inventory_add on public.inventory_events for insert to authenticated with check(organization_id=public.current_org() and facility_id=public.current_facility() and public.current_role()='admin' and created_by=auth.uid());
alter table public.audit_events enable row level security;
create policy audit_read on public.audit_events for select to authenticated using(organization_id=public.current_org() and public.current_role()='admin');
alter table public.feedback_items enable row level security;
create policy feedback_read on public.feedback_items for select to authenticated using(organization_id=public.current_org() and (submitted_by=auth.uid() or public.current_role()='admin'));
create policy feedback_add on public.feedback_items for insert to authenticated with check(organization_id=public.current_org() and submitted_by=auth.uid() and status='New' and resolution_note='');
create policy feedback_review on public.feedback_items for update to authenticated using(organization_id=public.current_org() and public.current_role()='admin') with check(organization_id=public.current_org() and public.current_role()='admin');
-- Transactionally save ingredient, controlled Spanish name and allergen relationships.
create function public.save_ingredient(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid; allergen uuid;
begin
 if public.current_role() <> 'admin' or public.current_role() is null then raise exception 'Administrator required'; end if;
 result := coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 insert into public.ingredients(id,name,category,default_uom,description,storage_notes,active)
 values(result,trim(payload->>'name'),payload->>'category',payload->>'default_uom',coalesce(payload->>'description',''),coalesce(payload->>'storage_notes',''),coalesce((payload->>'active')::boolean,true))
 on conflict(id) do update set name=excluded.name,category=excluded.category,default_uom=excluded.default_uom,
 description=excluded.description,storage_notes=excluded.storage_notes,active=excluded.active;
 if length(trim(coalesce(payload->>'spanish_name',''))) > 0 then
  insert into public.ingredient_translations(ingredient_id,display_name) values(result,trim(payload->>'spanish_name'))
  on conflict(ingredient_id) do update set display_name=excluded.display_name,approved_by=auth.uid(),approved_at=now();
 elsif exists(select 1 from public.ingredient_translations where ingredient_id=result) then
  raise exception 'An approved Spanish name cannot be cleared. Enter a reviewed replacement.';
 end if;
 delete from public.ingredient_allergens where ingredient_id=result;
 for allergen in select jsonb_array_elements_text(coalesce(payload->'allergen_ids','[]'::jsonb))::uuid loop
  insert into public.ingredient_allergens(ingredient_id,allergen_id) values(result,allergen);
 end loop;
 return result;
end $$;
create policy allergen_unlink on public.ingredient_allergens for delete to authenticated using(organization_id=public.current_org() and public.current_role()='admin');
-- Minimal grants: ledger/audit history cannot be updated/deleted even by an app admin.
grant usage on schema public to authenticated;
revoke all on public.organizations,public.facilities,public.profiles,public.ingredients,public.ingredient_translations,public.allergens,public.ingredient_allergens,public.suppliers,public.supplier_items,public.inventory_events,public.feedback_items,public.audit_events from anon,authenticated;
grant select on public.organizations,public.facilities,public.profiles,public.ingredients,public.ingredient_translations,public.allergens,public.ingredient_allergens,public.suppliers,public.supplier_items,public.inventory_events,public.feedback_items,public.audit_events to authenticated;
grant insert,update on public.ingredients,public.ingredient_translations,public.allergens,public.ingredient_allergens,public.suppliers,public.supplier_items,public.feedback_items to authenticated;
grant delete on public.ingredient_allergens to authenticated;
grant insert on public.inventory_events to authenticated;
revoke all on function public.save_ingredient(jsonb) from public;
grant execute on function public.save_ingredient(jsonb) to authenticated;
revoke all on function public.audit_change() from public;
create index inventory_lookup on public.inventory_events(organization_id,facility_id,ingredient_id,created_at);
create index feedback_lookup on public.feedback_items(organization_id,created_at);
