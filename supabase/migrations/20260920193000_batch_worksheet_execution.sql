begin;

-- The DDDYY production lot provides worker context. Every material edge instead
-- preserves the actual serialized package and source-lot snapshot.
create table public.batch_worksheet_executions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org(), facility_id uuid not null default public.current_facility(),
  planned_mixer_batch_id uuid not null unique, production_lot_id uuid not null, status text not null default 'Open' check(status in ('Open','Complete')),
  opened_by uuid not null default auth.uid() references auth.users, opened_at timestamptz not null default now(), completed_at timestamptz,
  unique(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,planned_mixer_batch_id) references public.planned_mixer_batches(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,production_lot_id) references public.production_lots(organization_id,facility_id,id)
);
create table public.batch_worksheet_lines (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null default public.current_org(), facility_id uuid not null default public.current_facility(),
  execution_id uuid not null, recipe_line_id uuid not null, ingredient_id uuid not null, required_quantity numeric(14,4) not null check(required_quantity>0), uom text not null, sequence integer not null check(sequence>0),
  unique(execution_id,recipe_line_id), unique(organization_id,facility_id,id), foreign key(organization_id,facility_id,execution_id) references public.batch_worksheet_executions(organization_id,facility_id,id)
);
create table public.batch_worksheet_source_usages (
  id uuid primary key, organization_id uuid not null default public.current_org(), facility_id uuid not null default public.current_facility(),
  worksheet_line_id uuid not null, serialized_unit_id uuid not null, source_lot text not null check(length(trim(source_lot))>0), quantity numeric(14,4) not null check(quantity>0),
  operator_id uuid not null default auth.uid() references auth.users, used_at timestamptz not null default now(), unique(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,worksheet_line_id) references public.batch_worksheet_lines(organization_id,facility_id,id),
  -- Serialized units are tenant-unique. Facility scope is enforced against the
  -- worksheet execution in record_batch_worksheet_usage before insertion.
  foreign key(organization_id,serialized_unit_id) references public.serialized_units(organization_id,id)
);
-- Corrections compensate usage; they never edit or delete the original edge.
create table public.batch_worksheet_usage_corrections (
  id uuid primary key, organization_id uuid not null default public.current_org(), facility_id uuid not null default public.current_facility(), usage_id uuid not null,
  restored_quantity numeric(14,4) not null check(restored_quantity>0), reason text not null check(length(trim(reason)) between 3 and 1000),
  corrected_by uuid not null default auth.uid() references auth.users, corrected_at timestamptz not null default now(), unique(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,usage_id) references public.batch_worksheet_source_usages(organization_id,facility_id,id)
);

alter table public.batch_worksheet_executions enable row level security;
alter table public.batch_worksheet_lines enable row level security;
alter table public.batch_worksheet_source_usages enable row level security;
alter table public.batch_worksheet_usage_corrections enable row level security;
revoke all on public.batch_worksheet_executions,public.batch_worksheet_lines,public.batch_worksheet_source_usages,public.batch_worksheet_usage_corrections from public,anon,authenticated;
grant select on public.batch_worksheet_executions,public.batch_worksheet_lines,public.batch_worksheet_source_usages,public.batch_worksheet_usage_corrections to authenticated;
do $$ declare relation_name text; begin foreach relation_name in array array['batch_worksheet_executions','batch_worksheet_lines','batch_worksheet_source_usages','batch_worksheet_usage_corrections'] loop
  execute format('create policy worksheet_read on public.%I for select to authenticated using (organization_id=public.current_org() and facility_id=public.current_facility() and public.has_permission(''production.mobile''))',relation_name);
end loop; end $$;

create function public.open_batch_worksheet(batch_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare batch public.planned_mixer_batches%rowtype; result uuid;
begin
 if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
 select * into batch from public.planned_mixer_batches where id=batch_id for update;
 if batch.id is null or batch.production_lot_id is null then raise exception 'Choose an assigned production batch'; end if;
 select id into result from public.batch_worksheet_executions where planned_mixer_batch_id=batch.id;
 if result is not null then return result; end if;
 insert into public.batch_worksheet_executions(organization_id,facility_id,planned_mixer_batch_id,production_lot_id) values(batch.organization_id,batch.facility_id,batch.id,batch.production_lot_id) returning id into result;
 insert into public.batch_worksheet_lines(organization_id,facility_id,execution_id,recipe_line_id,ingredient_id,required_quantity,uom,sequence)
   select batch.organization_id,batch.facility_id,result,line.id,line.ingredient_id,line.normalized_quantity,line.normalized_uom,line.sequence from public.recipe_lines line where line.recipe_version_id=batch.recipe_version_id order by line.sequence;
 if not found then raise exception 'Released recipe has no ingredient lines'; end if;
 return result;
end $$;

create function public.record_batch_worksheet_usage(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid := (payload->>'id')::uuid; line_id uuid := (payload->>'worksheet_line_id')::uuid; unit_id uuid := (payload->>'serialized_unit_id')::uuid; amount numeric := (payload->>'quantity')::numeric;
 prior public.batch_worksheet_source_usages%rowtype; line public.batch_worksheet_lines%rowtype; execution public.batch_worksheet_executions%rowtype; unit public.serialized_unit_balances%rowtype; allocated numeric; consumed numeric;
begin
 if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
 if request_id is null or line_id is null or unit_id is null or amount is null or amount<=0 or amount<>round(amount,4) then raise exception 'Choose a package and a positive quantity with at most four decimals'; end if;
 select * into prior from public.batch_worksheet_source_usages where id=request_id;
 if prior.id is not null then if prior.worksheet_line_id=line_id and prior.serialized_unit_id=unit_id and prior.quantity=amount and prior.operator_id=auth.uid() then return prior.id; end if; raise exception 'Usage request is already in use with different values'; end if;
 select * into line from public.batch_worksheet_lines where id=line_id;
 select * into execution from public.batch_worksheet_executions where id=line.execution_id;
 if line.id is null or execution.id is null or execution.status<>'Open' then raise exception 'Choose an open worksheet line'; end if;
 perform 1 from public.serialized_units where id=unit_id for update;
 select * into unit from public.serialized_unit_balances where id=unit_id;
 if unit.id is null or unit.facility_id<>execution.facility_id then raise exception 'Package is not available in this facility'; end if;
 if unit.ingredient_id<>line.ingredient_id or unit.uom<>line.uom then raise exception 'Package does not match this ingredient line'; end if;
 if unit.availability<>'Available' or unit.source_lot='' then raise exception 'Package is held, expired, exhausted, or missing source-lot evidence'; end if;
 select coalesce(sum(usage.quantity)-sum(coalesce(correction.restored_quantity,0)),0) into allocated from public.batch_worksheet_source_usages usage left join public.batch_worksheet_usage_corrections correction on correction.usage_id=usage.id where usage.worksheet_line_id=line.id;
 select coalesce(sum(usage.quantity)-sum(coalesce(correction.restored_quantity,0)),0) into consumed from public.batch_worksheet_source_usages usage left join public.batch_worksheet_usage_corrections correction on correction.usage_id=usage.id where usage.serialized_unit_id=unit.id;
 if allocated+amount>line.required_quantity then raise exception 'Quantity exceeds the recipe line requirement'; end if;
 if amount>unit.remaining_quantity-consumed then raise exception 'Quantity exceeds the available package balance'; end if;
 insert into public.batch_worksheet_source_usages(id,organization_id,facility_id,worksheet_line_id,serialized_unit_id,source_lot,quantity) values(request_id,execution.organization_id,execution.facility_id,line.id,unit.id,unit.source_lot,amount);
 return request_id;
end $$;

create function public.complete_batch_worksheet(execution_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare execution public.batch_worksheet_executions%rowtype;
begin
 if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
 select * into execution from public.batch_worksheet_executions where id=execution_id for update;
 if execution.id is null then raise exception 'Choose an open worksheet'; end if;
 if execution.status='Complete' then return execution.id; end if;
 if exists(select 1 from public.batch_worksheet_lines line left join lateral(select coalesce(sum(usage.quantity)-sum(coalesce(correction.restored_quantity,0)),0) quantity from public.batch_worksheet_source_usages usage left join public.batch_worksheet_usage_corrections correction on correction.usage_id=usage.id where usage.worksheet_line_id=line.id) used on true where line.execution_id=execution.id and used.quantity<>line.required_quantity) then raise exception 'Record the required quantity for every ingredient line before completing'; end if;
 update public.batch_worksheet_executions set status='Complete',completed_at=now() where id=execution.id;
 return execution.id;
end $$;
revoke all on function public.open_batch_worksheet(uuid),public.record_batch_worksheet_usage(jsonb),public.complete_batch_worksheet(uuid) from public,anon;
grant execute on function public.open_batch_worksheet(uuid),public.record_batch_worksheet_usage(jsonb),public.complete_batch_worksheet(uuid) to authenticated;
commit;
