begin;

-- A production_lot row is the durable traceability identity for a Production
-- Run. Keep the table name so historic trace links remain valid.
alter table public.production_lots
  drop constraint if exists production_lots_production_lot_code_check,
  add column if not exists run_sequence integer not null default 1
    check (run_sequence > 0),
  add constraint production_lots_production_lot_code_check
    check (production_lot_code ~ '^[0-9]{5}(-[A-Z0-9]+(-[0-9]{2,4})?)?$');

drop index if exists public.production_lot_one_active_product_per_plan;
create unique index production_run_daily_sequence
  on public.production_lots(organization_id,facility_id,product_id,assigned_on,run_sequence)
  where status='Assigned';

-- Product codes are small, operator-readable reference values used in run lot
-- numbers. They are intentionally separate from product display names.
alter table public.products add column if not exists production_lot_identifier text;
update public.products set production_lot_identifier=regexp_replace(upper(product_code),'[^A-Z0-9]','','g')
  where production_lot_identifier is null and product_code is not null;
create or replace function public.set_product_lot_code(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare requested_product uuid := (payload->>'product_id')::uuid;
  requested_code text := upper(trim(coalesce(payload->>'product_code','')));
begin
  if not public.has_permission('products.write') then raise exception 'Product permission required'; end if;
  if requested_product is null or requested_code !~ '^[A-Z0-9]{1,20}$' then
    raise exception 'Use 1 to 20 letters or numbers for the product lot identifier';
  end if;
  update public.products set production_lot_identifier=requested_code where id=requested_product
    and organization_id=public.current_org();
  if not found then raise exception 'Choose an active product in this organization'; end if;
  return requested_product;
end $$;
revoke all on function public.set_product_lot_code(jsonb) from public,anon;
grant execute on function public.set_product_lot_code(jsonb) to authenticated;

-- Compatibility only for historic clients. Current UI never exposes this path;
-- new production work receives a run lot in open_batch_worksheet instead.
create or replace function public.assign_production_lot(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor_org uuid := public.current_org(); actor_facility uuid := public.current_facility();
  requested_order uuid := (payload->>'order_id')::uuid; requested_product uuid := (payload->>'product_id')::uuid;
  requested_date date := (payload->>'assigned_on')::date; result uuid; plan public.order_production_plans%rowtype; expected_batches integer;
begin
  if not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write') then raise exception 'Production lot permission required'; end if;
  select * into plan from public.order_production_plans where id=requested_order and organization_id=actor_org and facility_id=actor_facility for update;
  if plan.id is null or plan.status<>'Draft' then raise exception 'Save a draft production preparation before assigning lots'; end if;
  select count(*) into expected_batches from public.planned_mixer_batches where order_id=requested_order and product_id=requested_product and organization_id=actor_org and facility_id=actor_facility;
  if expected_batches=0 then raise exception 'Choose a product from this production plan'; end if;
  if exists(select 1 from public.planned_mixer_batches where order_id=requested_order and product_id=requested_product and production_lot_id is not null) then raise exception 'A production lot is already assigned for this product'; end if;
  insert into public.production_lots(organization_id,facility_id,order_id,product_id,assigned_on,production_lot_code,planned_gallons,planned_batch_count)
    values(actor_org,actor_facility,requested_order,requested_product,requested_date,to_char(requested_date,'DDDYY'),expected_batches*40,expected_batches) returning id into result;
  update public.planned_mixer_batches set production_lot_id=result where order_id=requested_order and product_id=requested_product and organization_id=actor_org and facility_id=actor_facility and production_lot_id is null;
  return result;
end $$;

create or replace function public.open_batch_worksheet(batch_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor_org uuid := public.current_org(); actor_facility uuid := public.current_facility();
  batch public.planned_mixer_batches%rowtype; spice public.planned_spice_preparations%rowtype;
  run_lot public.production_lots%rowtype; result uuid; run_date date; product_code text; next_sequence integer;
begin
  if not public.has_permission('production.mobile') or actor_org is null or actor_facility is null then
    raise exception 'Production worksheet permission required';
  end if;
  select * into batch from public.planned_mixer_batches where id=batch_id
    and organization_id=actor_org and facility_id=actor_facility for update;
  if batch.id is null then raise exception 'Choose an assigned production batch'; end if;
  select id into result from public.batch_worksheet_executions where planned_mixer_batch_id=batch.id
    and organization_id=actor_org and facility_id=actor_facility;
  if result is not null then return result; end if;
  if not exists(select 1 from public.order_production_plans p where p.id=batch.order_id
    and p.organization_id=actor_org and p.facility_id=actor_facility and p.status='Confirmed') then
    raise exception 'Production preparation is not confirmed and assigned';
  end if;
  select * into spice from public.planned_spice_preparations where planned_mixer_batch_id=batch.id
    and organization_id=actor_org and facility_id=actor_facility;
  if spice.id is null then raise exception 'Choose the paired spice preparation'; end if;
  if batch.production_lot_id is not null then
    select * into run_lot from public.production_lots where id=batch.production_lot_id
      and organization_id=actor_org and facility_id=actor_facility and status='Assigned';
  end if;
  if run_lot.id is null then
    select (now() at time zone facility.timezone)::date into run_date from public.facilities facility
      where facility.id=actor_facility and facility.organization_id=actor_org and facility.active for share;
    select upper(trim(product.production_lot_identifier)) into product_code from public.products product
      where product.id=batch.product_id and product.organization_id=actor_org and product.active;
    if product_code is null or product_code !~ '^[A-Z0-9]{1,20}$' then
      raise exception 'Set a product lot identifier before starting production';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(actor_facility::text||batch.product_id::text||run_date::text,17));
    select coalesce(max(lot.run_sequence),0)+1 into next_sequence from public.production_lots lot
      where lot.organization_id=actor_org and lot.facility_id=actor_facility and lot.product_id=batch.product_id
        and lot.assigned_on=run_date and lot.status='Assigned';
    insert into public.production_lots(organization_id,facility_id,order_id,product_id,assigned_on,
      production_lot_code,run_sequence,planned_gallons,planned_batch_count)
    values(actor_org,actor_facility,batch.order_id,batch.product_id,run_date,
      to_char(run_date,'DDDYY')||'-'||product_code||case when next_sequence=1 then '' else '-'||lpad(next_sequence::text,2,'0') end,
      next_sequence,40,1) returning * into run_lot;
    update public.planned_mixer_batches set production_lot_id=run_lot.id where id=batch.id
      and organization_id=actor_org and facility_id=actor_facility;
  end if;
  insert into public.batch_worksheet_executions(organization_id,facility_id,planned_mixer_batch_id,
    planned_spice_preparation_id,production_lot_id)
  values(actor_org,actor_facility,batch.id,spice.id,run_lot.id) returning id into result;
  insert into public.batch_worksheet_lines(organization_id,facility_id,execution_id,recipe_line_id,
    ingredient_id,required_quantity,uom,sequence)
  select actor_org,actor_facility,result,line.id,line.ingredient_id,line.normalized_quantity,
    line.normalized_uom,line.sequence from public.recipe_lines line
    where line.recipe_version_id=batch.recipe_version_id and line.organization_id=actor_org order by line.sequence;
  if not found then raise exception 'Released recipe has no ingredient lines'; end if;
  return result;
end $$;

create or replace function public.worker_spice_preparations_base() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_permission('production.mobile') then raise exception 'Production worksheet permission required'; end if;
  select coalesce(jsonb_agg(to_jsonb(task) order by task.plan_start_on,task.product_name,task.sequence),'[]'::jsonb)
    into result from (
    select batch.id planned_mixer_batch_id,spice.id planned_spice_preparation_id,batch.sequence,batch.target_gallons,
      product.name product_name,lot.id production_lot_id,lot.production_lot_code,lot.assigned_on,
      plan.start_on plan_start_on,plan.finish_on plan_finish_on,execution.id execution_id,
      coalesce(execution.status,'Not started') status,
      coalesce((select jsonb_agg(jsonb_build_object('id',line.id,'ingredient_id',recipe_line.ingredient_id,
        'ingredient_name',ingredient.name,'required_quantity',recipe_line.normalized_quantity,'uom',recipe_line.normalized_uom,
        'sequence',recipe_line.sequence,'usages',coalesce((select jsonb_agg(jsonb_build_object('id',usage.id,
          'serialized_unit_id',usage.serialized_unit_id,'source_lot',usage.source_lot,'quantity',usage.quantity) order by usage.used_at,usage.id)
          from public.batch_worksheet_source_usages usage where usage.worksheet_line_id=line.id),'[]'::jsonb),
        'packages',coalesce((select jsonb_agg(jsonb_build_object('id',unit.id,'internal_code',unit.internal_code,
          'source_lot',unit.source_lot,'remaining_quantity',unit.remaining_quantity,'availability',unit.availability)
          order by unit.expiration_date nulls last,unit.internal_code) from public.serialized_unit_balances unit
          where unit.ingredient_id=recipe_line.ingredient_id and unit.facility_id=batch.facility_id
            and unit.uom=recipe_line.normalized_uom and unit.availability='Available' and unit.source_lot<>''),'[]'::jsonb))
        order by recipe_line.sequence) from public.recipe_lines recipe_line
        join public.ingredients ingredient on ingredient.id=recipe_line.ingredient_id
        left join public.batch_worksheet_lines line on line.recipe_line_id=recipe_line.id and line.execution_id=execution.id
        where recipe_line.recipe_version_id=batch.recipe_version_id),'[]'::jsonb) lines
    from public.planned_mixer_batches batch join public.planned_spice_preparations spice on spice.planned_mixer_batch_id=batch.id
      join public.order_production_plans plan on plan.id=batch.order_id join public.products product on product.id=batch.product_id
      left join public.production_lots lot on lot.id=batch.production_lot_id left join public.batch_worksheet_executions execution on execution.planned_mixer_batch_id=batch.id
    where batch.organization_id=public.current_org() and batch.facility_id=public.current_facility() and plan.status='Confirmed'
  ) task;
  return result;
end $$;

create or replace function public.find_traceability_production_lots(product_filter uuid, production_lot_code_filter text,
  page_number integer default 0, requested_page_size integer default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if product_filter is null or production_lot_code_filter !~ '^[0-9]{5}(-[A-Z0-9]+(-[0-9]{2,4})?)?$' or page_number<0 then
    raise exception 'Choose a product, a valid production lot, and page';
  end if;
  return jsonb_build_object('page',page_number,'page_size',requested_page_size,'items',coalesce((select jsonb_agg(to_jsonb(item)) from (
    select lot.id,lot.product_id,product.name product_name,lot.production_lot_code,lot.assigned_on,lot.status,lot.planned_gallons,lot.planned_batch_count
    from public.production_lots lot join public.products product on product.id=lot.product_id where lot.organization_id=public.current_org()
      and lot.facility_id=public.current_facility() and lot.product_id=product_filter and lot.production_lot_code=production_lot_code_filter
    order by lot.assigned_on desc,lot.id limit requested_page_size offset page_number*requested_page_size) item),'[]'::jsonb));
end $$;

commit;
