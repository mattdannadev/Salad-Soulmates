begin;

create table public.workforce_pto_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  color text not null default '#6d7f67' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, sort_order),
  foreign key (organization_id) references public.organizations(id)
);

alter table public.workforce_pto_types enable row level security;
create policy workforce_pto_types_read on public.workforce_pto_types
  for select to authenticated using (
    organization_id = public.current_org() and public.has_permission('workforce.read')
  );
revoke all on public.workforce_pto_types from public, anon;
grant select on public.workforce_pto_types to authenticated;

alter table public.workforce_pto_blocks
  add column pto_type_id uuid references public.workforce_pto_types(id);

insert into public.workforce_pto_types(organization_id, name, color, sort_order)
select organization.id, defaults.name, defaults.color, defaults.sort_order
from public.organizations organization
cross join (values
  ('Vacation', '#2f6b4f', 10),
  ('Sick leave', '#9c5f33', 20),
  ('Personal leave', '#5d6f9a', 30)
) as defaults(name, color, sort_order);

insert into public.workforce_pto_types (organization_id, name, sort_order)
select distinct organization_id, 'Unspecified', 0
from public.workforce_pto_blocks
on conflict (organization_id, name) do nothing;

update public.workforce_pto_blocks block
set pto_type_id = type.id
from public.workforce_pto_types type
where type.organization_id = block.organization_id
  and type.name = 'Unspecified'
  and block.pto_type_id is null;

alter table public.workforce_pto_blocks
  alter column pto_type_id set not null;

-- General workforce readers need availability, never private PTO notes. Replace the
-- existing function body in-place so its established authorization remains intact.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.get_workforce_schedule(jsonb)'::regprocedure) into definition;
  definition := replace(definition, '''private_note'',b.private_note,', '');
  definition := replace(definition, '''end_minute'',b.end_minute,''revision'',b.revision)',
    '''end_minute'',b.end_minute,''pto_type_id'',b.pto_type_id,''revision'',b.revision)');
  definition := replace(definition, '''publication_revision'',coalesce((select max(p.revision) from public.workforce_publications p\n      where p.facility_id=f.id),0),',
    '''publication_revision'',coalesce((select max(p.revision) from public.workforce_publications p\n      where p.facility_id=f.id),0),\n    ''pto_types'',coalesce((select jsonb_agg(jsonb_build_object(''id'',type.id,''name'',type.name,''color'',type.color,''sort_order'',type.sort_order,''active'',type.active) order by type.sort_order,type.name) from public.workforce_pto_types type where type.organization_id=f.organization_id),''[]''::jsonb),');
  execute definition;
end $$;

create function public.save_workforce_pto_type(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested_id uuid := (payload->>'id')::uuid;
  requested_name text := trim(coalesce(payload->>'name', ''));
  requested_color text := coalesce(payload->>'color', '#6d7f67');
  requested_sort integer := coalesce((payload->>'sort_order')::integer, 0);
begin
  if not public.has_permission('settings.manage') then
    raise exception 'PTO type administration permission required';
  end if;
  if requested_name = '' or length(requested_name) > 80
    or requested_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid PTO type';
  end if;
  insert into public.workforce_pto_types (id, organization_id, name, color, sort_order)
  values (requested_id, public.current_org(), requested_name, requested_color, requested_sort)
  on conflict (id) do update set
    name = excluded.name,
    color = excluded.color,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now()
  where workforce_pto_types.organization_id = public.current_org();
  if not found then raise exception 'PTO type unavailable'; end if;
  return requested_id;
end $$;

create function public.retire_workforce_pto_type(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_id uuid := (payload->>'id')::uuid;
begin
  if not public.has_permission('settings.manage') then
    raise exception 'PTO type administration permission required';
  end if;
  update public.workforce_pto_types set active = false, updated_at = now()
  where id = requested_id and organization_id = public.current_org();
  if not found then raise exception 'PTO type unavailable'; end if;
  return requested_id;
end $$;

revoke all on function public.save_workforce_pto_type(jsonb), public.retire_workforce_pto_type(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_workforce_pto_type(jsonb), public.retire_workforce_pto_type(jsonb)
  to authenticated;

commit;
