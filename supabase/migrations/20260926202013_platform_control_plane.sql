-- Platform operators are assigned out of band; tenant access profiles cannot grant this role.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from public, anon, authenticated;
grant select on table public.platform_admins to service_role;

alter table public.organizations
  add column status text not null default 'active'
    check (status in ('active', 'suspended')),
  add column signup_enabled_before_suspension boolean;

-- Tenant authorization is checked against current database state, not stale JWT claims.
create or replace function public.current_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = (select auth.uid()) and p.active and o.status = 'active'
$$;
create or replace function public.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = (select auth.uid()) and p.active and o.status = 'active'
$$;
create or replace function public.current_facility() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.facility_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = (select auth.uid()) and p.active and o.status = 'active'
$$;
create or replace function public.has_permission(requested text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.organizations o on o.id = p.organization_id
    join public.access_profile_permissions app on app.access_profile_id = p.access_profile_id
    where p.id = (select auth.uid()) and p.active and o.status = 'active'
      and app.permission_code = requested
  )
$$;

create or replace function public.resolve_signup_organization(tenant_slug text)
returns table(name text, slug text)
language sql stable security definer set search_path = '' as $$
  select o.name, o.slug from public.organizations o
  where o.signup_enabled and o.status = 'active'
    and lower(trim(o.slug)) = lower(trim($1))
  limit 1
$$;

-- Covers the existing definer signup RPC without changing its validated input contract.
create function public.guard_suspended_access_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.organizations o
    where o.id = new.organization_id and o.status = 'active'
  ) then
    raise exception using errcode = 'P0002', message = 'Organization is unavailable';
  end if;
  return new;
end
$$;
create trigger guard_suspended_access_request
before insert on public.access_requests
for each row execute function public.guard_suspended_access_request();
revoke all on function public.guard_suspended_access_request() from public, anon, authenticated;

-- This RPC is callable only with the server's secret key. It rechecks membership
-- inside the same transaction as the read, so revocation takes effect immediately.
create function public.list_platform_organizations(actor_user_id uuid)
returns table (
  id uuid, name text, slug text, status text, signup_enabled boolean,
  enabled_user_count bigint, created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if actor_user_id is null or not exists (
    select 1 from public.platform_admins pa where pa.user_id = actor_user_id
  ) then
    raise exception 'Platform administrator required';
  end if;
  return query
    select o.id, o.name, o.slug, o.status, o.signup_enabled,
      count(p.id) filter (where p.active), o.created_at
    from public.organizations o
    left join public.profiles p on p.organization_id = o.id
    group by o.id
    order by lower(o.name), o.id;
end
$$;

create function public.provision_platform_organization(
  actor_user_id uuid, organization_name text, organization_slug text,
  facility_name text, facility_timezone text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_organization_id uuid;
  new_admin_profile_id uuid;
  new_reviewer_profile_id uuid;
  new_worker_profile_id uuid;
  new_receiver_profile_id uuid;
begin
  if actor_user_id is null or not exists (
    select 1 from public.platform_admins pa where pa.user_id = actor_user_id
  ) then
    raise exception 'Platform administrator required';
  end if;
  if length(trim(organization_name)) not between 2 and 120
    or organization_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(organization_slug) > 63
    or length(trim(facility_name)) not between 2 and 120
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = facility_timezone)
  then
    raise exception 'Invalid organization details';
  end if;

  insert into public.organizations(name, slug)
  values (trim(organization_name), organization_slug)
  returning public.organizations.id into new_organization_id;
  insert into public.facilities(organization_id, name, timezone)
  values (new_organization_id, trim(facility_name), facility_timezone);

  insert into public.access_profiles(organization_id, name, description, base_role, is_system)
  values (new_organization_id, 'Administrator', 'Full system administration', 'admin', true)
  returning id into new_admin_profile_id;
  insert into public.access_profiles(organization_id, name, description, base_role, is_system)
  values (new_organization_id, 'Operations Reviewer', 'Read-only operations access', 'reviewer', true)
  returning id into new_reviewer_profile_id;
  insert into public.access_profiles(organization_id, name, description, base_role, is_system)
  values (new_organization_id, 'Production Worker', 'Spanish-first mobile production access', 'worker', true)
  returning id into new_worker_profile_id;
  insert into public.access_profiles(organization_id, name, description, base_role, is_system)
  values (new_organization_id, 'Receiver', 'Supplier receiving access', 'receiver', true)
  returning id into new_receiver_profile_id;
  insert into public.access_profile_permissions(organization_id, access_profile_id, permission_code)
    select new_organization_id, new_admin_profile_id, code from public.permissions;
  insert into public.access_profile_permissions(organization_id, access_profile_id, permission_code)
  values
    (new_organization_id,new_reviewer_profile_id,'dashboard.read'),
    (new_organization_id,new_reviewer_profile_id,'master_data.read'),
    (new_organization_id,new_reviewer_profile_id,'products.read'),
    (new_organization_id,new_reviewer_profile_id,'orders.read'),
    (new_organization_id,new_reviewer_profile_id,'planning.read'),
    (new_organization_id,new_reviewer_profile_id,'inventory.read'),
    (new_organization_id,new_reviewer_profile_id,'workforce.read'),
    (new_organization_id,new_worker_profile_id,'production.mobile'),
    (new_organization_id,new_receiver_profile_id,'master_data.read'),
    (new_organization_id,new_receiver_profile_id,'inventory.read'),
    (new_organization_id,new_receiver_profile_id,'inventory.receive');

  insert into public.reference_lists(organization_id,code,area,name_en,name_es,allow_custom_values)
  values
    (new_organization_id,'ingredient_category','Master data','Ingredient types','Tipos de ingredientes',true),
    (new_organization_id,'base_unit','Master data','Base units','Unidades base',true),
    (new_organization_id,'purchase_unit','Suppliers','Purchase units','Unidades de compra',true),
    (new_organization_id,'feedback_type','Feedback','Feedback types','Tipos de comentarios',true);
  insert into public.reference_options(organization_id,list_code,code,label_en,label_es,sort_order)
  values
    (new_organization_id,'ingredient_category','Dry','Dry','Seco',10),
    (new_organization_id,'ingredient_category','Liquid','Liquid','Líquido',20),
    (new_organization_id,'ingredient_category','Refrigerated','Refrigerated','Refrigerado',30),
    (new_organization_id,'base_unit','lb','Pounds (lb)','Libras (lb)',10),
    (new_organization_id,'base_unit','oz','Ounces (oz)','Onzas (oz)',20),
    (new_organization_id,'base_unit','gal','Gallons (gal)','Galones (gal)',30),
    (new_organization_id,'base_unit','each','Each','Cada uno',40),
    (new_organization_id,'purchase_unit','pail','Pail','Cubeta',10),
    (new_organization_id,'purchase_unit','bag','Bag','Bolsa',20),
    (new_organization_id,'purchase_unit','case','Case','Caja',30),
    (new_organization_id,'purchase_unit','each','Each','Cada uno',40),
    (new_organization_id,'feedback_type','Suggestion','Suggestion','Sugerencia',10),
    (new_organization_id,'feedback_type','Issue','Issue','Problema',20),
    (new_organization_id,'feedback_type','Positive','Positive','Positivo',30),
    (new_organization_id,'feedback_type','Question','Question','Pregunta',40);
  update public.reference_lists set allow_custom_values = false
  where organization_id = new_organization_id
    and code in ('base_unit','purchase_unit','feedback_type');

  -- The canonical catalog is installed by an earlier migration on main. Keep
  -- provisioning usable on release branches that have not received it yet.
  if to_regclass('public.uom_families') is not null
    and to_regclass('public.uoms') is not null then
    insert into public.uom_families(organization_id,code,label_en,label_es,sort_order)
    values
      (new_organization_id,'mass','Mass / weight','Masa / peso',10),
      (new_organization_id,'volume','Volume','Volumen',20),
      (new_organization_id,'count','Count','Conteo',30),
      (new_organization_id,'packaging','Packaging','Empaque',40)
    on conflict do nothing;
    insert into public.uoms(organization_id,family_code,code,label_en,label_es,
      measurement_system,is_inventory_unit,is_purchase_unit,sort_order)
    values
      (new_organization_id,'mass','lb','Pound (lb)','Libra (lb)','imperial',true,false,10),
      (new_organization_id,'mass','oz','Ounce (oz)','Onza (oz)','imperial',true,false,20),
      (new_organization_id,'mass','kg','Kilogram (kg)','Kilogramo (kg)','metric',true,false,30),
      (new_organization_id,'mass','g','Gram (g)','Gramo (g)','metric',true,false,40),
      (new_organization_id,'volume','gal','Gallon (gal)','Galón (gal)','imperial',true,false,10),
      (new_organization_id,'volume','fl_oz','Fluid ounce (fl oz)','Onza líquida (fl oz)','imperial',true,false,20),
      (new_organization_id,'volume','l','Liter (L)','Litro (L)','metric',true,false,30),
      (new_organization_id,'volume','ml','Milliliter (mL)','Mililitro (mL)','metric',true,false,40),
      (new_organization_id,'count','each','Each','Cada uno','universal',true,true,10),
      (new_organization_id,'packaging','bag','Bag','Bolsa','universal',false,true,10),
      (new_organization_id,'packaging','case','Case','Caja','universal',false,true,20),
      (new_organization_id,'packaging','pail','Pail','Cubeta','universal',false,true,30)
    on conflict do nothing;
    update public.reference_lists set area = 'Legacy'
    where organization_id = new_organization_id and code in ('base_unit','purchase_unit');
  end if;

  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,after_data)
  values (new_organization_id,actor_user_id,'organizations',new_organization_id,
    'ORGANIZATION_PROVISIONED',jsonb_build_object('name',trim(organization_name),'slug',organization_slug));
  return new_organization_id;
end
$$;

create function public.set_platform_organization_suspended(
  actor_user_id uuid, target_organization_id uuid, should_suspend boolean, reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.organizations%rowtype;
  next_status text;
begin
  if actor_user_id is null or not exists (
    select 1 from public.platform_admins pa where pa.user_id = actor_user_id
  ) then
    raise exception 'Platform administrator required';
  end if;
  if target_organization_id is null or should_suspend is null
    or length(trim(coalesce(reason,''))) not between 3 and 500 then
    raise exception 'Invalid status change';
  end if;
  select * into target from public.organizations where id = target_organization_id for update;
  if target.id is null then raise exception 'Organization not found'; end if;
  if not exists (
    select 1 from public.platform_admins pa where pa.user_id = actor_user_id
  ) then
    raise exception 'Platform administrator required';
  end if;
  next_status := case when should_suspend then 'suspended' else 'active' end;
  if target.status = next_status then return; end if;

  update public.organizations
  set status = next_status,
    signup_enabled_before_suspension = case when should_suspend then target.signup_enabled else null end,
    signup_enabled = case when should_suspend then false
      else coalesce(target.signup_enabled_before_suspension, false) end
  where id = target_organization_id;
  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,
    event_type,before_data,after_data)
  values (target_organization_id,actor_user_id,'organizations',target_organization_id,
    case when should_suspend then 'ORGANIZATION_SUSPENDED' else 'ORGANIZATION_REACTIVATED' end,
    jsonb_build_object('status',target.status,'signup_enabled',target.signup_enabled),
    jsonb_build_object('status',next_status,'reason',trim(reason)));
end
$$;

revoke all on function public.list_platform_organizations(uuid) from public, anon, authenticated;
revoke all on function public.provision_platform_organization(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.set_platform_organization_suspended(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.list_platform_organizations(uuid) to service_role;
grant execute on function public.provision_platform_organization(uuid,text,text,text,text) to service_role;
grant execute on function public.set_platform_organization_suspended(uuid,uuid,boolean,text) to service_role;
