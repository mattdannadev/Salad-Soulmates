begin;

-- Saved worksheets pin released recipes. Their requirements are planning commitments,
-- never inventory consumption. Cancel and replace a worksheet to change batch counts.
create table public.material_plans (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  name text not null check (length(trim(name)) between 1 and 120),
  needed_on date not null,
  batches jsonb not null,
  requirements jsonb not null default '[]',
  status text not null default 'Active' check (status in ('Active','Cancelled')),
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique (organization_id,facility_id,id),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id)
);
create table public.purchase_drafts (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  material_plan_id uuid not null,
  supplier_id uuid not null,
  expected_on date not null,
  status text not null default 'Draft' check (status in ('Draft','Confirmed','Cancelled')),
  reference text not null default '' check (length(reference) <= 120),
  note text not null default '' check (length(note) <= 1000),
  revision integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  unique (organization_id,facility_id,id),
  foreign key (organization_id,facility_id,material_plan_id)
    references public.material_plans(organization_id,facility_id,id),
  foreign key (organization_id,supplier_id) references public.suppliers(organization_id,id)
);
create unique index one_open_supplier_draft on public.purchase_drafts(material_plan_id,supplier_id)
  where status = 'Draft';
create table public.purchase_draft_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  purchase_draft_id uuid not null,
  ingredient_id uuid not null,
  supplier_item_id uuid not null,
  ingredient_name text not null,
  supplier_sku text not null,
  uom text not null check (uom in ('lb','oz','gal','each')),
  purchase_uom text not null,
  pack_quantity numeric not null check (pack_quantity > 0 and pack_quantity < 1000000000),
  raw_shortage numeric not null check (raw_shortage > 0 and raw_shortage < 1000000000),
  recommended_units integer not null check (recommended_units > 0),
  purchase_units integer not null check (purchase_units between 1 and 1000000),
  quantity numeric not null check (quantity > 0 and quantity <= 1000000000),
  override_reason text not null default '' check (length(override_reason) <= 1000),
  unique (purchase_draft_id,ingredient_id),
  unique (organization_id,facility_id,id),
  foreign key (organization_id,facility_id,purchase_draft_id)
    references public.purchase_drafts(organization_id,facility_id,id),
  foreign key (organization_id,ingredient_id) references public.ingredients(organization_id,id),
  foreign key (organization_id,supplier_item_id) references public.supplier_items(organization_id,id)
);
alter table public.inventory_receipt_lines add column purchase_draft_line_id uuid
  references public.purchase_draft_lines(id);
create index receipt_purchase_line on public.inventory_receipt_lines(purchase_draft_line_id)
  where purchase_draft_line_id is not null;
create index material_plans_scope on public.material_plans(organization_id,facility_id,status);
create index purchase_drafts_scope on public.purchase_drafts(organization_id,facility_id,status,expected_on);
create index purchase_lines_draft on public.purchase_draft_lines(purchase_draft_id);
create index purchase_lines_ingredient on public.purchase_draft_lines(ingredient_id);
create index purchase_lines_item on public.purchase_draft_lines(supplier_item_id);

-- Callers retain their session and RLS. No service-role client is used by these workflows.
do $$ declare table_name text; begin
  foreach table_name in array array['material_plans','purchase_drafts','purchase_draft_lines'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public,anon,authenticated', table_name);
    execute format('grant select,insert,update on public.%I to authenticated', table_name);
    execute format('create policy planning_read on public.%I for select to authenticated using
      (organization_id=public.current_org() and facility_id=public.current_facility()
       and (public.has_permission(''planning.read'') or public.has_permission(''inventory.receive'')))', table_name);
    execute format('create policy planning_insert on public.%I for insert to authenticated with check
      (organization_id=public.current_org() and facility_id=public.current_facility()
       and public.has_permission(''planning.write''))', table_name);
    execute format('create policy planning_update on public.%I for update to authenticated using
      (organization_id=public.current_org() and facility_id=public.current_facility()
       and public.has_permission(''planning.write'')) with check
      (organization_id=public.current_org() and facility_id=public.current_facility()
       and public.has_permission(''planning.write''))', table_name);
    execute format('create trigger audit_write after insert or update on public.%I
      for each row execute function public.audit_change()', table_name);
  end loop;
end $$;
-- Receivers need inbound lines, not recipe/plan content.
drop policy planning_read on public.material_plans;
create policy planning_read on public.material_plans for select to authenticated using
  (organization_id=public.current_org() and facility_id=public.current_facility()
   and public.has_permission('planning.read'));
revoke update on public.purchase_draft_lines from authenticated;

create function public.guard_material_plan() returns trigger
language plpgsql security invoker set search_path='' as $$
declare batch jsonb; version_row record; result jsonb;
begin
  if not public.has_permission('planning.write') or (tg_op='INSERT' and new.created_by is distinct from auth.uid()) then
    raise exception 'Planning permission required';
  end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status')
       or old.status <> 'Active' or new.status <> 'Cancelled' then
      raise exception 'Saved requirements are immutable; cancel and replace the worksheet';
    end if;
    if exists(select 1 from public.purchase_drafts where material_plan_id=old.id and status = 'Draft') then
      raise exception 'Cancel linked draft purchases before cancelling this worksheet';
    end if;
    return new;
  end if;
  if new.status <> 'Active' or jsonb_typeof(new.batches) is distinct from 'array'
     or jsonb_array_length(new.batches) not between 1 and 100 then
    raise exception 'Choose between one and one hundred released recipes';
  end if;
  if (select count(distinct value->>'recipe_version_id') from jsonb_array_elements(new.batches))
     <> jsonb_array_length(new.batches) then raise exception 'A recipe version may appear only once'; end if;
  for batch in select value from jsonb_array_elements(new.batches) loop
    if (batch->>'batch_count')::numeric is null or (batch->>'batch_count')::numeric not between 1 and 10000
       or (batch->>'batch_count')::numeric <> trunc((batch->>'batch_count')::numeric) then
      raise exception 'Batch count must be a whole number from 1 to 10000';
    end if;
    select v.id,v.target_yield_gallons,p.name into version_row
      from public.recipe_versions v join public.recipes r on r.id=v.recipe_id
      join public.products p on p.id=r.product_id
      where v.id=(batch->>'recipe_version_id')::uuid and v.status='Released' and p.active
        and v.target_yield_gallons=40 and p.standard_batch_gallons=40;
    if not found then raise exception 'Choose a released recipe for an active 40-gallon product'; end if;
    perform 1 from public.ingredients i where exists(select 1 from public.recipe_lines l
      where l.recipe_version_id=version_row.id and l.ingredient_id=i.id) order by i.id for share;
    if not exists(select 1 from public.recipe_lines where recipe_version_id=version_row.id) then
      raise exception 'Released recipe has no ingredient requirements';
    end if;
    if exists(select 1 from public.recipe_lines l join public.ingredients i on i.id=l.ingredient_id
      where l.recipe_version_id=version_row.id and (not i.active or l.normalized_uom<>i.default_uom
      or l.normalized_quantity is null or l.normalized_quantity<=0
      or l.normalized_quantity>=1000000000
      or l.normalized_quantity<>round(l.normalized_quantity,4))) then
      raise exception 'Recipe ingredient must be active with a validated quantity in its base unit (four decimals)';
    end if;
  end loop;
  select jsonb_agg(to_jsonb(requirement) order by ingredient_name) into result from (
    select i.id ingredient_id,i.name ingredient_name,i.default_uom uom,
      sum(l.normalized_quantity*(b.value->>'batch_count')::integer) required,
      jsonb_agg(jsonb_build_object('recipe_line_id',l.id,'recipe_version_id',v.id,'product_name',p.name,
        'version_number',v.version_number,'batch_count',(b.value->>'batch_count')::integer,
        'per_batch',l.normalized_quantity,'quantity',l.normalized_quantity*(b.value->>'batch_count')::integer)
        order by p.name,l.sequence) contributions
    from jsonb_array_elements(new.batches) b
    join public.recipe_versions v on v.id=(b.value->>'recipe_version_id')::uuid
    join public.recipes r on r.id=v.recipe_id join public.products p on p.id=r.product_id
    join public.recipe_lines l on l.recipe_version_id=v.id join public.ingredients i on i.id=l.ingredient_id
    group by i.id,i.name,i.default_uom
  ) requirement;
  if result is null or exists(select 1 from jsonb_array_elements(result) r where (r->>'required')::numeric>1000000000) then
    raise exception 'Requirements are empty or exceed the supported quantity';
  end if;
  new.requirements := result;
  return new;
end $$;
create trigger material_plan_guard before insert or update on public.material_plans
  for each row execute function public.guard_material_plan();

-- One statement snapshot: the selected plan is excluded from other commitments.
-- Confirmed inbound includes only the outstanding quantity due by the plan horizon.
create function public.material_requirements(plan_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(r.value || jsonb_build_object(
    'on_hand',stock.quantity,'other_commitments',commitments.quantity,
    'confirmed_inbound',inbound.quantity,
    'projected',stock.quantity+inbound.quantity-commitments.quantity-(r.value->>'required')::numeric,
    'shortage',greatest(0,(r.value->>'required')::numeric+commitments.quantity-stock.quantity-inbound.quantity))), '[]'::jsonb)
  from public.material_plans plan cross join lateral jsonb_array_elements(plan.requirements) r
  cross join lateral (select coalesce(sum(e.quantity_delta),0) quantity from public.inventory_events e
    where e.ingredient_id=(r.value->>'ingredient_id')::uuid and e.uom=r.value->>'uom'
      and (e.receipt_line_id is null or exists(select 1 from public.inventory_receipt_lines receipt
        where receipt.id=e.receipt_line_id and (receipt.expiration_date is null or receipt.expiration_date>=plan.needed_on)))) stock
  cross join lateral (select coalesce(sum((c.value->>'required')::numeric),0) quantity
    from public.material_plans other cross join lateral jsonb_array_elements(other.requirements) c
    where other.status='Active' and other.id<>plan.id
      and c.value->>'ingredient_id'=r.value->>'ingredient_id') commitments
  cross join lateral (select coalesce(sum(greatest(0,l.quantity-coalesce((select sum(received.quantity)
    from public.inventory_receipt_lines received where received.purchase_draft_line_id=l.id),0))),0) quantity
    from public.purchase_draft_lines l join public.purchase_drafts d on d.id=l.purchase_draft_id
    where d.status='Confirmed' and d.expected_on<=plan.needed_on
      and l.ingredient_id=(r.value->>'ingredient_id')::uuid and l.uom=r.value->>'uom') inbound
  where plan.id=plan_id and plan.status='Active'
    and public.has_permission('planning.read') and public.has_permission('inventory.read')
$$;

create function public.save_material_plan(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior public.material_plans%rowtype; requested_id uuid := (payload->>'id')::uuid;
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  if requested_id is null then raise exception 'Request ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0));
  select * into prior from public.material_plans where id=requested_id;
  if found then
    if prior.created_by=auth.uid() and prior.name=trim(payload->>'name')
       and prior.needed_on=(payload->>'needed_on')::date and prior.batches=payload->'batches' then return prior.id; end if;
    raise exception 'Request ID already used with different values';
  end if;
  insert into public.material_plans(id,name,needed_on,batches)
    values(requested_id,trim(payload->>'name'),(payload->>'needed_on')::date,payload->'batches');
  return requested_id;
end $$;

create function public.cancel_material_plan(plan_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior public.material_plans%rowtype;
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  select * into prior from public.material_plans where id=plan_id for update;
  if not found then raise exception 'Worksheet not found'; end if;
  if prior.status='Cancelled' then return prior.id; end if;
  update public.material_plans set status='Cancelled' where id=plan_id;
  return prior.id;
end $$;

create function public.guard_purchase_draft() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  if tg_op='INSERT' then
    if new.status<>'Draft' or new.created_by is distinct from auth.uid() or new.revision<>1 then
      raise exception 'Create a draft before confirming inbound'; end if;
    perform 1 from public.material_plans where id=new.material_plan_id and status='Active' for share;
    if not found then raise exception 'Choose an active worksheet'; end if;
    if not exists(select 1 from public.suppliers where id=new.supplier_id and active) then
      raise exception 'Choose an active supplier'; end if;
  else
    if (to_jsonb(new)-array['status','reference','note','revision'])
       is distinct from (to_jsonb(old)-array['status','reference','note','revision']) then
      raise exception 'Purchase identity, dates and snapshots are immutable'; end if;
    if new.revision<>old.revision+1 then raise exception 'Purchase changed; reload before trying again'; end if;
    if old.status='Cancelled' or new.status=old.status
       or (old.status='Confirmed' and new.status<>'Cancelled') or new.status='Draft' then
      raise exception 'Invalid purchase status transition'; end if;
    if new.status='Confirmed' then
      if length(trim(new.reference))<1 then raise exception 'Enter the external order reference before confirming inbound'; end if;
      if not exists(select 1 from public.purchase_draft_lines where purchase_draft_id=new.id) then
        raise exception 'An empty draft cannot be confirmed'; end if;
    end if;
    if new.status='Cancelled' and length(trim(new.note))<3 then raise exception 'Enter a cancellation reason'; end if;
    if new.status='Cancelled' and exists(select 1 from public.inventory_receipt_lines r
      join public.purchase_draft_lines l on l.id=r.purchase_draft_line_id where l.purchase_draft_id=new.id) then
      raise exception 'Received purchases cannot be cancelled'; end if;
  end if;
  return new;
end $$;
create trigger purchase_draft_guard before insert or update on public.purchase_drafts
  for each row execute function public.guard_purchase_draft();

create function public.guard_purchase_line() returns trigger
language plpgsql security invoker set search_path='' as $$
declare draft public.purchase_drafts%rowtype; item public.supplier_items%rowtype; requirement jsonb;
begin
  select * into draft from public.purchase_drafts where id=new.purchase_draft_id for update;
  if not found or draft.status<>'Draft' then raise exception 'Only draft purchases accept lines'; end if;
  select * into item from public.supplier_items where id=new.supplier_item_id and active;
  if not found or item.supplier_id<>draft.supplier_id or item.ingredient_id<>new.ingredient_id then
    raise exception 'Choose an active supplier pack for this ingredient'; end if;
  select value into requirement from jsonb_array_elements(public.material_requirements(draft.material_plan_id))
    where value->>'ingredient_id'=new.ingredient_id::text;
  if requirement is null or (requirement->>'shortage')::numeric<=0 then raise exception 'This ingredient has no current shortage'; end if;
  if item.pack_quantity_uom<>requirement->>'uom' then raise exception 'Configure a validated pack in the ingredient base unit'; end if;
  new.ingredient_name := requirement->>'ingredient_name';
  new.supplier_sku := item.supplier_sku;
  new.uom := item.pack_quantity_uom;
  new.purchase_uom := item.purchase_uom;
  new.pack_quantity := item.pack_quantity;
  new.raw_shortage := (requirement->>'shortage')::numeric;
  new.recommended_units := ceil(new.raw_shortage/item.pack_quantity);
  new.quantity := new.purchase_units*item.pack_quantity;
  if new.purchase_units<>new.recommended_units and length(trim(new.override_reason))<3 then
    raise exception 'A purchase quantity override requires a reason'; end if;
  return new;
end $$;
create trigger purchase_line_guard before insert on public.purchase_draft_lines
  for each row execute function public.guard_purchase_line();

create function public.create_purchase_draft(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare requested_id uuid := (payload->>'id')::uuid; prior public.purchase_drafts%rowtype; line jsonb;
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  if requested_id is null or jsonb_typeof(payload->'lines') is distinct from 'array'
     or jsonb_array_length(payload->'lines') not between 1 and 200 then raise exception 'Select purchase lines'; end if;
  if (payload->>'material_plan_id') is null or (payload->>'supplier_id') is null
    or (payload->>'expected_on') is null then raise exception 'Purchase identity and expected date are required'; end if;
  if (select count(distinct value->>'ingredient_id') from jsonb_array_elements(payload->'lines'))
    <> jsonb_array_length(payload->'lines') then raise exception 'An ingredient may appear only once per draft'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_id::text,0));
  select * into prior from public.purchase_drafts where id=requested_id;
  if found then
    if prior.created_by is distinct from auth.uid() or prior.material_plan_id is distinct from (payload->>'material_plan_id')::uuid
       or prior.supplier_id is distinct from (payload->>'supplier_id')::uuid or prior.expected_on is distinct from (payload->>'expected_on')::date
       or (select count(*) from public.purchase_draft_lines where purchase_draft_id=prior.id)<>jsonb_array_length(payload->'lines')
       or exists(select 1 from jsonb_array_elements(payload->'lines') requested
         where not exists(select 1 from public.purchase_draft_lines saved where saved.purchase_draft_id=prior.id
           and saved.ingredient_id=(requested->>'ingredient_id')::uuid
           and saved.supplier_item_id=(requested->>'supplier_item_id')::uuid
           and saved.purchase_units=(requested->>'purchase_units')::numeric
           and saved.override_reason=trim(coalesce(requested->>'override_reason','')))) then
      raise exception 'Request ID already used with different values'; end if;
    return prior.id;
  end if;
  insert into public.purchase_drafts(id,material_plan_id,supplier_id,expected_on)
    values(requested_id,(payload->>'material_plan_id')::uuid,(payload->>'supplier_id')::uuid,(payload->>'expected_on')::date);
  for line in select value from jsonb_array_elements(payload->'lines') loop
    if (line->>'purchase_units')::numeric is null or (line->>'purchase_units')::numeric<>trunc((line->>'purchase_units')::numeric) then
      raise exception 'Purchase units must be whole numbers'; end if;
    insert into public.purchase_draft_lines(purchase_draft_id,ingredient_id,supplier_item_id,purchase_units,override_reason)
      values(requested_id,(line->>'ingredient_id')::uuid,(line->>'supplier_item_id')::uuid,
        (line->>'purchase_units')::integer,trim(coalesce(line->>'override_reason','')));
  end loop;
  return requested_id;
end $$;

create function public.change_purchase_status(payload jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior public.purchase_drafts%rowtype;
begin
  if not public.has_permission('planning.write') then raise exception 'Planning permission required'; end if;
  select * into prior from public.purchase_drafts where id=(payload->>'id')::uuid for update;
  if not found then raise exception 'Purchase not found'; end if;
  if prior.status=payload->>'status' and prior.reference=trim(coalesce(payload->>'reference',''))
     and prior.note=trim(coalesce(payload->>'note','')) and prior.revision=(payload->>'revision')::integer+1 then return prior.id; end if;
  if prior.revision is distinct from (payload->>'revision')::integer then raise exception 'Purchase changed; reload before trying again'; end if;
  update public.purchase_drafts set status=payload->>'status',reference=trim(coalesce(payload->>'reference','')),
    note=trim(coalesce(payload->>'note','')),revision=revision+1 where id=prior.id;
  return prior.id;
end $$;

-- Lock the header first for consistent ordering with cancellation, then the line.
-- Receivers lack UPDATE rights; this narrow trigger takes the locks on their behalf.
create function public.validate_purchase_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare line public.purchase_draft_lines%rowtype; draft public.purchase_drafts%rowtype; receipt public.inventory_receipts%rowtype; already_received numeric;
begin
  if new.purchase_draft_line_id is null then return new; end if;
  if not public.has_permission('inventory.receive') or new.organization_id is distinct from public.current_org() then
    raise exception 'Receiving permission required'; end if;
  select d.* into draft from public.purchase_drafts d join public.purchase_draft_lines l on l.purchase_draft_id=d.id
    where l.id=new.purchase_draft_line_id and d.organization_id=public.current_org()
      and d.facility_id=public.current_facility() for update of d;
  if not found or draft.status<>'Confirmed' then raise exception 'Select confirmed inbound for this facility'; end if;
  select * into line from public.purchase_draft_lines where id=new.purchase_draft_line_id for update;
  select * into receipt from public.inventory_receipts where id=new.receipt_id
    and organization_id=public.current_org() and facility_id=public.current_facility() and created_by=auth.uid();
  if not found or receipt.supplier_id<>draft.supplier_id or new.ingredient_id<>line.ingredient_id or new.uom<>line.uom then
    raise exception 'Receipt must match inbound supplier, ingredient and unit'; end if;
  select coalesce(sum(quantity),0) into already_received from public.inventory_receipt_lines where purchase_draft_line_id=line.id;
  if already_received+new.quantity>line.quantity then raise exception 'Receipt exceeds the outstanding inbound quantity'; end if;
  return new;
end $$;
create trigger purchase_receipt_guard before insert on public.inventory_receipt_lines
  for each row execute function public.validate_purchase_receipt();

-- Protect pinned unit semantics across facilities, including plans with no stock yet.
create function public.guard_planned_ingredient_unit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.default_uom<>old.default_uom and exists(select 1 from public.material_plans p
    cross join lateral jsonb_array_elements(p.requirements) r where r.value->>'ingredient_id'=old.id::text) then
    raise exception 'Base unit cannot change after material planning history exists'; end if;
  return new;
end $$;
create trigger planned_ingredient_unit before update on public.ingredients
  for each row execute function public.guard_planned_ingredient_unit();

-- Explicit function grants, including helpers; trigger invocation needs no EXECUTE grant.
revoke all on function public.guard_material_plan(), public.guard_purchase_draft(),public.guard_purchase_line(),
  public.validate_purchase_receipt(),public.guard_planned_ingredient_unit() from public,anon,authenticated;
revoke all on function public.cancel_material_plan(uuid),public.material_requirements(uuid),public.save_material_plan(jsonb),
  public.create_purchase_draft(jsonb),public.change_purchase_status(jsonb) from public,anon;
grant execute on function public.cancel_material_plan(uuid),public.material_requirements(uuid),public.save_material_plan(jsonb),
  public.create_purchase_draft(jsonb),public.change_purchase_status(jsonb) to authenticated;

create or replace function public.post_inventory_receipt(payload jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare receipt_id uuid := gen_random_uuid(); line_id uuid := gen_random_uuid(); ingredient_unit text; supplier_name text; prior_event public.inventory_events%rowtype; prior_receipt public.inventory_receipts%rowtype; prior_line public.inventory_receipt_lines%rowtype; request_token uuid := (payload->>'request_id')::uuid;
begin
 if not public.has_permission('inventory.receive') then raise exception 'Receiving permission required'; end if;
 if request_token is null then raise exception 'Request ID is required'; end if;
 if (payload->>'quantity')::numeric <= 0 or (payload->>'quantity')::numeric > 1000000
    or (payload->>'quantity')::numeric <> round((payload->>'quantity')::numeric,4) then
   raise exception 'Quantity must be positive with at most four decimal places';
 end if;
 -- Serialize only this business request. The unique request constraint remains the final guard.
 perform pg_advisory_xact_lock(hashtextextended(request_token::text,0));
 select * into prior_event from public.inventory_events where request_id=request_token;
 if found then
   select * into prior_line from public.inventory_receipt_lines where id=prior_event.receipt_line_id;
   select * into prior_receipt from public.inventory_receipts where id=prior_line.receipt_id;
   if prior_event.event_type='Receipt' and prior_event.created_by=auth.uid()
      and prior_event.ingredient_id=(payload->>'ingredient_id')::uuid
      and prior_event.quantity_delta=(payload->>'quantity')::numeric
      and prior_event.uom=payload->>'uom'
      and prior_receipt.supplier_id=(payload->>'supplier_id')::uuid
      and prior_receipt.received_on=(payload->>'received_on')::date
      and prior_receipt.supplier_reference=trim(coalesce(payload->>'supplier_reference',''))
      and prior_receipt.note=trim(coalesce(payload->>'note',''))
      and prior_line.supplier_lot=trim(coalesce(payload->>'supplier_lot',''))
      and prior_line.expiration_date is not distinct from nullif(payload->>'expiration_date','')::date
      and prior_line.purchase_draft_line_id is not distinct from nullif(payload->>'purchase_draft_line_id','')::uuid then
     return prior_receipt.id;
   end if;
   raise exception 'Request ID already used with different values';
 end if;
 select default_uom into ingredient_unit from public.ingredients where id=(payload->>'ingredient_id')::uuid and active;
 if ingredient_unit is null or ingredient_unit is distinct from payload->>'uom' then raise exception 'Receipt unit must match ingredient base unit'; end if;
 select name into supplier_name from public.suppliers where id=(payload->>'supplier_id')::uuid and active;
 if supplier_name is null then raise exception 'Choose an active supplier'; end if;
 insert into public.inventory_receipts(id,supplier_id,received_on,supplier_reference,note) values(receipt_id,(payload->>'supplier_id')::uuid,(payload->>'received_on')::date,trim(coalesce(payload->>'supplier_reference','')),trim(coalesce(payload->>'note','')));
 insert into public.inventory_receipt_lines(id,receipt_id,ingredient_id,quantity,uom,supplier_lot,expiration_date,purchase_draft_line_id) values(line_id,receipt_id,(payload->>'ingredient_id')::uuid,(payload->>'quantity')::numeric,payload->>'uom',trim(coalesce(payload->>'supplier_lot','')),nullif(payload->>'expiration_date','')::date,nullif(payload->>'purchase_draft_line_id','')::uuid);
 insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,receipt_line_id) values((payload->>'ingredient_id')::uuid,'Receipt',(payload->>'quantity')::numeric,payload->>'uom','Received from '||supplier_name||case when trim(coalesce(payload->>'supplier_reference',''))='' then '' else ' · '||trim(payload->>'supplier_reference') end,coalesce(nullif(payload->>'request_id','')::uuid,gen_random_uuid()),line_id);
 return receipt_id;
end $$;


commit;
