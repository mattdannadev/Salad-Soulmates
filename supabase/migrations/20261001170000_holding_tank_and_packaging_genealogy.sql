begin;

alter table public.products
  add column default_pouch_size_gallons numeric(14,4)
    check (default_pouch_size_gallons > 0),
  add column default_packaging_equipment_id uuid;

-- A holding-tank session is the commingling boundary between 40-gallon mixer
-- charges and continuous pouch packaging. It deliberately retains every
-- contributing batch rather than inventing a narrower finished-lot story.
create table public.holding_tank_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  tank_equipment_id uuid not null,
  product_id uuid not null,
  state text not null default 'open' check (state in ('open','closed','on_hold')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  tank_code_snapshot text not null check (length(trim(tank_code_snapshot)) between 1 and 80),
  tank_name_snapshot text not null check (length(trim(tank_name_snapshot)) between 1 and 120),
  capacity_quantity_snapshot numeric(14,4) not null check (capacity_quantity_snapshot > 0),
  capacity_uom_snapshot text not null check (length(trim(capacity_uom_snapshot)) between 1 and 50),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  foreign key (organization_id, facility_id) references public.facilities(organization_id,id),
  foreign key (organization_id, facility_id, tank_equipment_id) references public.equipment(organization_id,facility_id,id),
  foreign key (organization_id, product_id) references public.products(organization_id,id),
  check ((state = 'open' and closed_at is null) or (state <> 'open' and closed_at is not null))
);

create table public.production_batch_holding_tank_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  production_batch_id uuid not null,
  holding_tank_session_id uuid not null,
  transferred_quantity numeric(14,4) not null check (transferred_quantity > 0),
  transferred_uom text not null check (length(trim(transferred_uom)) between 1 and 50),
  transferred_at timestamptz not null default now(),
  idempotency_key uuid not null,
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, idempotency_key),
  foreign key (organization_id, facility_id, production_batch_id) references public.production_batches(organization_id,facility_id,id),
  foreign key (organization_id, facility_id, holding_tank_session_id) references public.holding_tank_sessions(organization_id,facility_id,id)
);

create table public.packaging_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  holding_tank_session_id uuid not null,
  packaging_equipment_id uuid not null,
  product_id uuid not null,
  state text not null default 'in_progress' check (state in ('in_progress','complete','on_hold','cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  pouch_size_gallons_snapshot numeric(14,4) not null check (pouch_size_gallons_snapshot > 0),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  foreign key (organization_id, facility_id, holding_tank_session_id) references public.holding_tank_sessions(organization_id,facility_id,id),
  foreign key (organization_id, facility_id, packaging_equipment_id) references public.equipment(organization_id,facility_id,id),
  foreign key (organization_id, product_id) references public.products(organization_id,id),
  check (completed_at is null or completed_at >= started_at)
);

create table public.packaging_run_outputs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  packaging_run_id uuid not null,
  pouch_count integer not null check (pouch_count > 0),
  cases_count integer check (cases_count >= 0),
  produced_at timestamptz not null default now(),
  idempotency_key uuid not null,
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique (organization_id, facility_id, id),
  unique (organization_id, facility_id, idempotency_key),
  foreign key (organization_id, facility_id, packaging_run_id) references public.packaging_runs(organization_id,facility_id,id)
);

create index holding_tank_sessions_active on public.holding_tank_sessions(facility_id,tank_equipment_id,state);
create index tank_transfer_batch on public.production_batch_holding_tank_transfers(facility_id,production_batch_id);
create index packaging_run_session on public.packaging_runs(facility_id,holding_tank_session_id);

create function public.guard_holding_tank_genealogy() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare session_row public.holding_tank_sessions%rowtype;
declare batch_row public.production_batches%rowtype;
declare run_row public.packaging_runs%rowtype;
declare used_quantity numeric;
begin
  if tg_table_name = 'production_batch_holding_tank_transfers' then
    if tg_op <> 'INSERT' then raise exception 'Holding-tank transfers are immutable'; end if;
    select * into session_row from public.holding_tank_sessions where id=new.holding_tank_session_id for update;
    select * into batch_row from public.production_batches where id=new.production_batch_id for update;
    if session_row.id is null or batch_row.id is null or session_row.state <> 'open'
      or session_row.product_id is distinct from batch_row.product_id
      or batch_row.state not in ('in_progress','awaiting_quality','released') then
      raise exception 'Transfer requires an open same-product completed batch and holding session';
    end if;
    if new.transferred_uom is distinct from session_row.capacity_uom_snapshot then
      raise exception 'Transfer unit must match holding-tank capacity unit';
    end if;
    select coalesce(sum(transferred_quantity),0) into used_quantity
      from public.production_batch_holding_tank_transfers where holding_tank_session_id=session_row.id;
    if used_quantity + new.transferred_quantity > session_row.capacity_quantity_snapshot then
      raise exception 'Transfer exceeds holding-tank capacity';
    end if;
  elsif tg_table_name = 'packaging_runs' then
    select * into session_row from public.holding_tank_sessions where id=new.holding_tank_session_id for key share;
    if session_row.id is null or session_row.product_id is distinct from new.product_id then
      raise exception 'Packaging run must match its holding-tank product';
    end if;
  end if;
  return new;
end $$;

create trigger holding_tank_transfer_guard before insert or update or delete
  on public.production_batch_holding_tank_transfers for each row execute function public.guard_holding_tank_genealogy();
create trigger packaging_run_holding_tank_guard before insert or update
  on public.packaging_runs for each row execute function public.guard_holding_tank_genealogy();

alter table public.holding_tank_sessions enable row level security;
alter table public.production_batch_holding_tank_transfers enable row level security;
alter table public.packaging_runs enable row level security;
alter table public.packaging_run_outputs enable row level security;
revoke all on public.holding_tank_sessions, public.production_batch_holding_tank_transfers,
  public.packaging_runs, public.packaging_run_outputs from public, anon, authenticated;
revoke all on function public.guard_holding_tank_genealogy() from public, anon, authenticated;

comment on table public.production_batch_holding_tank_transfers is
  'Exact genealogy from physical mixer charges into a commingled holding-tank session.';
comment on table public.packaging_run_outputs is
  'Pouch/case output summarized by continuous packaging run; future serialized units inherit this ancestry.';
commit;
