begin;

alter table public.organizations
  add column measurement_system text not null default 'imperial'
  check (measurement_system in ('metric', 'imperial'));

create or replace function public.validate_canonical_uom()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_system text;
begin
  select measurement_system into selected_system
  from public.organizations
  where id = new.organization_id;

  if tg_table_name = 'ingredients' and not exists (
    select 1 from public.uoms
    where organization_id = new.organization_id
      and code = new.default_uom
      and active
      and is_inventory_unit
      and measurement_system in (selected_system, 'universal')
  ) then
    raise exception 'Choose an active inventory unit for the organization measurement system';
  end if;

  if tg_table_name = 'supplier_items' and (
    not exists (
      select 1 from public.uoms
      where organization_id = new.organization_id
        and code = new.purchase_uom
        and active
        and is_purchase_unit
        and measurement_system in (selected_system, 'universal')
    )
    or not exists (
      select 1 from public.uoms
      where organization_id = new.organization_id
        and code = new.pack_quantity_uom
        and active
        and is_inventory_unit
        and measurement_system in (selected_system, 'universal')
    )
  ) then
    raise exception 'Choose active shared purchase and content units for the organization measurement system';
  end if;

  if tg_table_name = 'feedback_items' and not exists (
    select 1 from public.reference_options
    where organization_id = new.organization_id
      and list_code = 'feedback_type'
      and code = new.feedback_type
      and active
  ) then
    raise exception 'Choose an active feedback type';
  end if;

  return new;
end
$$;

create or replace function public.set_organization_measurement_system(payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_system text := payload->>'measurement_system';
  organization uuid := public.current_org();
begin
  if organization is null or not public.has_permission('settings.manage') then
    raise exception 'Settings management permission required';
  end if;
  if selected_system not in ('metric', 'imperial') then
    raise exception 'Choose metric or imperial';
  end if;

  update public.organizations
  set measurement_system = selected_system
  where id = organization;

  return selected_system;
end
$$;

revoke all on function public.set_organization_measurement_system(jsonb) from public, anon;
grant execute on function public.set_organization_measurement_system(jsonb) to authenticated;

commit;
