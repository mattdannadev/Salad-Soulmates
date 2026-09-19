-- Explicit permission profiles drive navigation and RLS; users receive one profile on approval.
create table public.permissions (
 code text primary key, area text not null, label text not null, description text not null default ''
);
create table public.access_profiles (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 name text not null check(length(trim(name)) between 2 and 100), description text not null default '',
 base_role text not null check(base_role in ('admin','reviewer','worker','receiver')),
 is_system boolean not null default false, active boolean not null default true,
 unique(organization_id,id), unique(organization_id,name)
);
create table public.access_profile_permissions (
 organization_id uuid not null, access_profile_id uuid not null, permission_code text not null references public.permissions,
 primary key(access_profile_id,permission_code),
 foreign key(organization_id,access_profile_id) references public.access_profiles(organization_id,id)
);
alter table public.profiles add column access_profile_id uuid;
alter table public.profiles add foreign key(organization_id,access_profile_id) references public.access_profiles(organization_id,id);

insert into public.permissions(code,area,label,description) values
 ('dashboard.read','Operations','View dashboard','Open the operations dashboard'),
 ('master_data.read','Master data','View ingredients and suppliers','Read ingredients, allergens, suppliers and packs'),
 ('master_data.write','Master data','Manage ingredients and suppliers','Create and edit master data'),
 ('products.read','Products & recipes','View products and recipes','Read product and recipe definitions'),
 ('products.write','Products & recipes','Manage products and recipes','Create and activate product and recipe versions'),
 ('orders.read','Orders','View orders','Read customer orders'),('orders.write','Orders','Manage orders','Create and edit customer orders'),
 ('planning.read','Planning','View plans','Read production plans'),('planning.write','Planning','Manage plans','Generate and adjust production plans'),
 ('inventory.read','Inventory','View inventory','Read inventory balances and history'),
 ('inventory.adjust','Inventory','Adjust inventory','Post opening balances and corrections'),
 ('inventory.receive','Receiving','Receive supplier deliveries','Post receipts linked to suppliers'),
 ('workforce.read','Workforce','View schedules','Read schedules and PTO'),('workforce.manage','Workforce','Manage schedules','Assign workers and manage PTO'),
 ('production.mobile','Production','Use worker workspace','Use the mobile batch worksheet'),
 ('feedback.manage','Administration','Manage feedback','Review and resolve all feedback'),
 ('access.manage','Administration','Manage users and access','Approve requests and assign access profiles'),
 ('settings.manage','Administration','Manage settings','Edit application dropdown lists and custom access profiles'),
 ('audit.read','Administration','View audit history','Read security and data-change history');

do $$ declare org uuid; admin_id uuid; reviewer_id uuid; worker_id uuid; receiver_id uuid; begin
 for org in select id from public.organizations loop
  insert into public.access_profiles(organization_id,name,description,base_role,is_system) values
   (org,'Administrator','Full system administration','admin',true),
   (org,'Operations Reviewer','Read-only operations access','reviewer',true),
   (org,'Production Worker','Spanish-first mobile production access','worker',true),
   (org,'Receiver','Supplier receiving access','receiver',true);
  select id into admin_id from public.access_profiles where organization_id=org and name='Administrator';
  select id into reviewer_id from public.access_profiles where organization_id=org and name='Operations Reviewer';
  select id into worker_id from public.access_profiles where organization_id=org and name='Production Worker';
  select id into receiver_id from public.access_profiles where organization_id=org and name='Receiver';
  insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code) select org,admin_id,code from public.permissions;
  insert into public.access_profile_permissions values
   (org,reviewer_id,'dashboard.read'),(org,reviewer_id,'master_data.read'),(org,reviewer_id,'products.read'),(org,reviewer_id,'orders.read'),(org,reviewer_id,'planning.read'),(org,reviewer_id,'inventory.read'),(org,reviewer_id,'workforce.read'),
   (org,worker_id,'production.mobile'),
   (org,receiver_id,'master_data.read'),(org,receiver_id,'inventory.read'),(org,receiver_id,'inventory.receive');
  update public.profiles p set access_profile_id=case p.role when 'admin' then admin_id when 'reviewer' then reviewer_id when 'worker' then worker_id else receiver_id end where p.organization_id=org;
 end loop;
end $$;
alter table public.profiles alter column access_profile_id set not null;

create function public.has_permission(requested text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.access_profile_permissions app on app.access_profile_id=p.access_profile_id where p.id=auth.uid() and p.active and app.permission_code=requested)
$$;
revoke all on function public.has_permission(text) from public,anon;
grant execute on function public.has_permission(text) to authenticated;

-- Replace broad legacy-role policies with explicit permission checks.
drop policy facility_read on public.facilities;
create policy facility_read on public.facilities for select to authenticated using(organization_id=public.current_org() and (id=public.current_facility() or public.has_permission('access.manage') or public.has_permission('workforce.read')));
drop policy profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or (organization_id=public.current_org() and (public.has_permission('access.manage') or public.has_permission('workforce.read'))));
do $$ declare t text; begin foreach t in array array['ingredients','ingredient_translations','allergens','ingredient_allergens','suppliers','supplier_items'] loop
 execute format('drop policy read_master on public.%I',t);
 execute format('drop policy insert_master on public.%I',t);
 execute format('drop policy update_master on public.%I',t);
 execute format('create policy read_master on public.%I for select to authenticated using(organization_id=public.current_org() and public.has_permission(''master_data.read''))',t);
 execute format('create policy insert_master on public.%I for insert to authenticated with check(organization_id=public.current_org() and public.has_permission(''master_data.write''))',t);
 execute format('create policy update_master on public.%I for update to authenticated using(organization_id=public.current_org() and public.has_permission(''master_data.write'')) with check(organization_id=public.current_org() and public.has_permission(''master_data.write''))',t);
 end loop; end $$;
drop policy allergen_unlink on public.ingredient_allergens;
create policy allergen_unlink on public.ingredient_allergens for delete to authenticated using(organization_id=public.current_org() and public.has_permission('master_data.write'));
drop policy inventory_read on public.inventory_events;
create policy inventory_read on public.inventory_events for select to authenticated using(organization_id=public.current_org() and facility_id=public.current_facility() and public.has_permission('inventory.read'));
drop policy inventory_add on public.inventory_events;
create policy inventory_add on public.inventory_events for insert to authenticated with check(organization_id=public.current_org() and facility_id=public.current_facility() and created_by=auth.uid() and ((event_type='Receipt' and public.has_permission('inventory.receive')) or (event_type<>'Receipt' and public.has_permission('inventory.adjust'))));
drop policy receipt_read on public.inventory_receipts;
create policy receipt_read on public.inventory_receipts for select to authenticated using(organization_id=public.current_org() and facility_id=public.current_facility() and public.has_permission('inventory.read'));
drop policy receipt_add on public.inventory_receipts;
create policy receipt_add on public.inventory_receipts for insert to authenticated with check(organization_id=public.current_org() and facility_id=public.current_facility() and created_by=auth.uid() and public.has_permission('inventory.receive'));
drop policy receipt_line_read on public.inventory_receipt_lines;
create policy receipt_line_read on public.inventory_receipt_lines for select to authenticated using(organization_id=public.current_org() and public.has_permission('inventory.read') and exists(select 1 from public.inventory_receipts r where r.id=receipt_id and r.facility_id=public.current_facility()));
drop policy receipt_line_add on public.inventory_receipt_lines;
create policy receipt_line_add on public.inventory_receipt_lines for insert to authenticated with check(organization_id=public.current_org() and public.has_permission('inventory.receive') and exists(select 1 from public.inventory_receipts r where r.id=receipt_id and r.facility_id=public.current_facility()));
drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated using(organization_id=public.current_org() and public.has_permission('audit.read'));
drop policy feedback_read on public.feedback_items;
create policy feedback_read on public.feedback_items for select to authenticated using(organization_id=public.current_org() and (submitted_by=auth.uid() or public.has_permission('feedback.manage')));
drop policy feedback_review on public.feedback_items;
create policy feedback_review on public.feedback_items for update to authenticated using(organization_id=public.current_org() and public.has_permission('feedback.manage')) with check(organization_id=public.current_org() and public.has_permission('feedback.manage'));
drop policy access_request_admin_read on public.access_requests;
create policy access_request_admin_read on public.access_requests for select to authenticated using(public.has_permission('access.manage'));
drop policy access_request_admin_review on public.access_requests;
create policy access_request_admin_review on public.access_requests for update to authenticated using(public.has_permission('access.manage')) with check(public.has_permission('access.manage'));

create or replace function public.save_ingredient(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid; allergen uuid;
begin
 if not public.has_permission('master_data.write') then raise exception 'Master data permission required'; end if;
 if not exists(select 1 from public.reference_options where organization_id=public.current_org() and list_code='ingredient_category' and code=payload->>'category' and active) then raise exception 'Choose an active ingredient type'; end if;
 result := coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 insert into public.ingredients(id,name,category,default_uom,description,storage_notes,active)
 values(result,trim(payload->>'name'),payload->>'category',payload->>'default_uom',coalesce(payload->>'description',''),coalesce(payload->>'storage_notes',''),coalesce((payload->>'active')::boolean,true))
 on conflict(id) do update set name=excluded.name,category=excluded.category,default_uom=excluded.default_uom,description=excluded.description,storage_notes=excluded.storage_notes,active=excluded.active;
 if length(trim(coalesce(payload->>'spanish_name',''))) > 0 then
  insert into public.ingredient_translations(ingredient_id,display_name) values(result,trim(payload->>'spanish_name'))
  on conflict(ingredient_id) do update set display_name=excluded.display_name,approved_by=auth.uid(),approved_at=now();
 elsif exists(select 1 from public.ingredient_translations where ingredient_id=result) then raise exception 'An approved Spanish name cannot be cleared. Enter a reviewed replacement.'; end if;
 delete from public.ingredient_allergens where ingredient_id=result;
 for allergen in select jsonb_array_elements_text(coalesce(payload->'allergen_ids','[]'::jsonb))::uuid loop insert into public.ingredient_allergens(ingredient_id,allergen_id) values(result,allergen); end loop;
 return result;
end $$;

create or replace function public.post_inventory_receipt(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare receipt_id uuid := gen_random_uuid(); line_id uuid := gen_random_uuid(); ingredient_unit text; supplier_name text;
begin
 if not public.has_permission('inventory.receive') then raise exception 'Receiving permission required'; end if;
 select default_uom into ingredient_unit from public.ingredients where id=(payload->>'ingredient_id')::uuid;
 if ingredient_unit is null or ingredient_unit is distinct from payload->>'uom' then raise exception 'Receipt unit must match ingredient base unit'; end if;
 select name into supplier_name from public.suppliers where id=(payload->>'supplier_id')::uuid and active;
 if supplier_name is null then raise exception 'Choose an active supplier'; end if;
 insert into public.inventory_receipts(id,supplier_id,received_on,supplier_reference,note) values(receipt_id,(payload->>'supplier_id')::uuid,(payload->>'received_on')::date,trim(coalesce(payload->>'supplier_reference','')),trim(coalesce(payload->>'note','')));
 insert into public.inventory_receipt_lines(id,receipt_id,ingredient_id,quantity,uom,supplier_lot,expiration_date) values(line_id,receipt_id,(payload->>'ingredient_id')::uuid,(payload->>'quantity')::numeric,payload->>'uom',trim(coalesce(payload->>'supplier_lot','')),nullif(payload->>'expiration_date','')::date);
 insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,receipt_line_id) values((payload->>'ingredient_id')::uuid,'Receipt',(payload->>'quantity')::numeric,payload->>'uom','Received from '||supplier_name||case when trim(coalesce(payload->>'supplier_reference',''))='' then '' else ' · '||trim(payload->>'supplier_reference') end,coalesce(nullif(payload->>'request_id','')::uuid,gen_random_uuid()),line_id);
 return receipt_id;
end $$;

alter table public.permissions enable row level security;
alter table public.access_profiles enable row level security;
alter table public.access_profile_permissions enable row level security;
create policy permissions_read on public.permissions for select to authenticated using(true);
create policy access_profile_read on public.access_profiles for select to authenticated using(organization_id=public.current_org() and (active or public.has_permission('settings.manage')));
create policy access_profile_manage on public.access_profiles for all to authenticated using(organization_id=public.current_org() and public.has_permission('settings.manage') and not is_system) with check(organization_id=public.current_org() and public.has_permission('settings.manage') and not is_system);
create policy access_profile_permission_read on public.access_profile_permissions for select to authenticated using(organization_id=public.current_org());
create policy access_profile_permission_manage on public.access_profile_permissions for all to authenticated using(organization_id=public.current_org() and public.has_permission('settings.manage') and exists(select 1 from public.access_profiles p where p.id=access_profile_id and not p.is_system)) with check(organization_id=public.current_org() and public.has_permission('settings.manage') and exists(select 1 from public.access_profiles p where p.id=access_profile_id and not p.is_system));
revoke all on public.permissions,public.access_profiles,public.access_profile_permissions from anon,authenticated;
grant select on public.permissions,public.access_profiles,public.access_profile_permissions to authenticated;
grant insert,update,delete on public.access_profiles,public.access_profile_permissions to authenticated;

-- Administrator-maintained dropdown values, grouped by business area.
create table public.reference_lists (
 organization_id uuid not null references public.organizations, code text not null, area text not null,
 name_en text not null, name_es text not null, allow_custom_values boolean not null default true,
 primary key(organization_id,code)
);
create table public.reference_options (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org(), list_code text not null,
 code text not null check(code ~ '^[A-Za-z][A-Za-z0-9_]{0,49}$'), label_en text not null, label_es text not null,
 sort_order integer not null default 0, active boolean not null default true,
 foreign key(organization_id,list_code) references public.reference_lists(organization_id,code),
 unique(organization_id,list_code,code)
);
do $$ declare org uuid; begin for org in select id from public.organizations loop
 insert into public.reference_lists values
  (org,'ingredient_category','Master data','Ingredient types','Tipos de ingredientes',true),
  (org,'base_unit','Master data','Base units','Unidades base',false),
  (org,'purchase_unit','Suppliers','Purchase units','Unidades de compra',false),
  (org,'feedback_type','Feedback','Feedback types','Tipos de comentarios',false);
 insert into public.reference_options(organization_id,list_code,code,label_en,label_es,sort_order) values
  (org,'ingredient_category','Dry','Dry','Seco',10),(org,'ingredient_category','Liquid','Liquid','Líquido',20),(org,'ingredient_category','Refrigerated','Refrigerated','Refrigerado',30),
  (org,'base_unit','lb','Pounds (lb)','Libras (lb)',10),(org,'base_unit','oz','Ounces (oz)','Onzas (oz)',20),(org,'base_unit','gal','Gallons (gal)','Galones (gal)',30),(org,'base_unit','each','Each','Cada uno',40),
  (org,'purchase_unit','pail','Pail','Cubeta',10),(org,'purchase_unit','bag','Bag','Bolsa',20),(org,'purchase_unit','case','Case','Caja',30),(org,'purchase_unit','each','Each','Cada uno',40),
  (org,'feedback_type','Suggestion','Suggestion','Sugerencia',10),(org,'feedback_type','Issue','Issue','Problema',20),(org,'feedback_type','Positive','Positive','Positivo',30),(org,'feedback_type','Question','Question','Pregunta',40);
end loop; end $$;
alter table public.ingredients drop constraint ingredients_category_check;
alter table public.reference_lists enable row level security;
alter table public.reference_options enable row level security;
create policy reference_list_read on public.reference_lists for select to authenticated using(organization_id=public.current_org());
create policy reference_list_manage on public.reference_lists for update to authenticated using(organization_id=public.current_org() and public.has_permission('settings.manage')) with check(organization_id=public.current_org() and public.has_permission('settings.manage'));
create policy reference_option_read on public.reference_options for select to authenticated using(organization_id=public.current_org());
create policy reference_option_manage on public.reference_options for all to authenticated using(organization_id=public.current_org() and public.has_permission('settings.manage')) with check(organization_id=public.current_org() and public.has_permission('settings.manage'));
revoke all on public.reference_lists,public.reference_options from anon,authenticated;
grant select on public.reference_lists,public.reference_options to authenticated;
grant update on public.reference_lists to authenticated;
grant insert,update,delete on public.reference_options to authenticated;

create function public.save_access_profile(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid; permission text;
begin
 if not public.has_permission('settings.manage') then raise exception 'Settings permission required'; end if;
 result:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 if exists(select 1 from public.access_profiles where id=result and is_system) then raise exception 'System profiles cannot be changed'; end if;
 insert into public.access_profiles(id,organization_id,name,description,base_role,is_system,active)
 values(result,public.current_org(),trim(payload->>'name'),trim(coalesce(payload->>'description','')),payload->>'base_role',false,coalesce((payload->>'active')::boolean,true))
 on conflict(id) do update set name=excluded.name,description=excluded.description,base_role=excluded.base_role,active=excluded.active;
 delete from public.access_profile_permissions where access_profile_id=result;
 for permission in select jsonb_array_elements_text(coalesce(payload->'permission_codes','[]'::jsonb)) loop
  insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code) values(public.current_org(),result,permission);
 end loop;
 return result;
end $$;
revoke all on function public.save_access_profile(jsonb) from public,anon;
grant execute on function public.save_access_profile(jsonb) to authenticated;

drop function public.approve_access_request(uuid,uuid,uuid,text);
create function public.approve_access_request(request_id uuid, invited_user_id uuid, assigned_facility_id uuid, assigned_access_profile_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
declare requester public.access_requests%rowtype; admin_profile public.profiles%rowtype; assigned public.access_profiles%rowtype;
begin
 select * into admin_profile from public.profiles where id=auth.uid() and active;
 if not public.has_permission('access.manage') then raise exception 'Access management permission required'; end if;
 select * into assigned from public.access_profiles where id=assigned_access_profile_id and organization_id=admin_profile.organization_id and active;
 if assigned.id is null then raise exception 'Invalid access profile'; end if;
 if not exists(select 1 from public.facilities where id=assigned_facility_id and organization_id=admin_profile.organization_id and active) then raise exception 'Invalid facility'; end if;
 select * into requester from public.access_requests where id=request_id for update;
 if requester.id is null or requester.contact_kind<>'email' or requester.status not in ('New','Invited') then raise exception 'Request cannot be approved'; end if;
 if requester.auth_user_id is not null and requester.auth_user_id<>invited_user_id then raise exception 'Invitation does not match request'; end if;
 insert into public.profiles(id,organization_id,facility_id,display_name,role,preferred_locale,active,access_profile_id)
 values(invited_user_id,admin_profile.organization_id,assigned_facility_id,requester.display_name,assigned.base_role,requester.preferred_locale,true,assigned.id) on conflict(id) do nothing;
 update public.access_requests set status='Approved',auth_user_id=invited_user_id,reviewed_at=now(),reviewed_by=auth.uid(),review_note='Approved with profile '||assigned.name where id=request_id;
 insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,after_data) values(admin_profile.organization_id,auth.uid(),'profiles',invited_user_id,'ACCESS_APPROVED',jsonb_build_object('access_profile_id',assigned.id,'facility_id',assigned_facility_id,'request_id',request_id));
 return invited_user_id;
end $$;
revoke all on function public.approve_access_request(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.approve_access_request(uuid,uuid,uuid,uuid) to authenticated;
create index access_profile_permissions_lookup on public.access_profile_permissions(access_profile_id,permission_code);
create index reference_options_lookup on public.reference_options(organization_id,list_code,active,sort_order);
