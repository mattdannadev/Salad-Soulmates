begin;

-- Recall readers cross several RLS-protected operational tables.  They run as
-- definer only after asserting the caller and every required read capability;
-- this preserves a bounded, organization/facility-scoped reporting surface.
create function public.traceability_read_allowed() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null
    or not public.has_permission('inventory.read')
    or not public.has_permission('orders.read')
    or not public.has_permission('planning.read') then
    raise exception 'Traceability lookup permission required';
  end if;
end $$;

create function public.find_traceability_production_lots(
  product_filter uuid,
  production_lot_code_filter text,
  page_number integer default 0,
  requested_page_size integer default 50
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare page_size integer := greatest(1, least(coalesce(requested_page_size, 50), 100)); offset_rows integer;
begin
  perform public.traceability_read_allowed();
  if product_filter is null or production_lot_code_filter !~ '^[0-9]{5}$' or page_number < 0 then
    raise exception 'Choose a product, DDDYY production lot, and valid page';
  end if;
  offset_rows := page_number * page_size;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(result)) from (
      select lot.id, lot.product_id, product.name as product_name, lot.production_lot_code,
        lot.assigned_on, lot.status, lot.planned_gallons, lot.planned_batch_count
      from public.production_lots lot
      join public.products product on product.id=lot.product_id
      where lot.organization_id=public.current_org() and lot.facility_id=public.current_facility()
        and lot.product_id=product_filter and lot.production_lot_code=production_lot_code_filter
      order by lot.assigned_on desc, lot.assigned_at desc, lot.id
      limit page_size offset offset_rows
    ) result), '[]'::jsonb),
    'page', page_number,
    'page_size', page_size
  );
end $$;

create function public.trace_production_lot(
  production_lot_filter uuid,
  page_number integer default 0,
  requested_page_size integer default 100
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare page_size integer := greatest(1, least(coalesce(requested_page_size, 100), 200)); offset_rows integer; lot jsonb;
begin
  perform public.traceability_read_allowed();
  if production_lot_filter is null or page_number < 0 then raise exception 'Choose a production lot and valid page'; end if;
  offset_rows := page_number * page_size;
  select jsonb_build_object(
    'id', item.id, 'product_id', item.product_id, 'product_name', item.product_name,
    'production_lot_code', item.production_lot_code, 'assigned_on', item.assigned_on,
    'status', item.status
  ) into lot from (
    select production_lot.id, production_lot.product_id, product.name as product_name,
      production_lot.production_lot_code, production_lot.assigned_on, production_lot.status
    from public.production_lots production_lot join public.products product on product.id=production_lot.product_id
    where production_lot.id=production_lot_filter and production_lot.organization_id=public.current_org()
      and production_lot.facility_id=public.current_facility()
  ) item;
  if lot is null then raise exception 'Production lot was not found in this facility'; end if;
  return jsonb_build_object(
    'lot', lot,
    'batches', coalesce((select jsonb_agg(to_jsonb(result)) from (
      select batch.id, batch.sequence, batch.target_gallons, execution.id as worksheet_execution_id,
        execution.status as worksheet_status, execution.opened_at, execution.completed_at
      from public.planned_mixer_batches batch
      left join public.batch_worksheet_executions execution on execution.planned_mixer_batch_id=batch.id
      where batch.production_lot_id=production_lot_filter and batch.organization_id=public.current_org()
        and batch.facility_id=public.current_facility()
      order by batch.sequence, batch.id
    ) result), '[]'::jsonb),
    'allocations', coalesce((select jsonb_agg(to_jsonb(result)) from (
      select usage.id as usage_id, usage.quantity, usage.used_at, usage.source_lot,
        batch.id as batch_id, batch.sequence as batch_sequence, ingredient.name as ingredient_name,
        unit.id as serialized_unit_id, unit.internal_code as package_serial, unit.supplier_barcode,
        receipt_line.id as receipt_line_id, receipt_line.source_lot_origin,
        receipt.id as receipt_id, receipt.received_on, supplier.id as supplier_id, supplier.name as supplier_name
      from public.batch_worksheet_source_usages usage
      join public.batch_worksheet_lines worksheet_line on worksheet_line.id=usage.worksheet_line_id
      join public.batch_worksheet_executions execution on execution.id=worksheet_line.execution_id
      join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id
      join public.ingredients ingredient on ingredient.id=worksheet_line.ingredient_id
      join public.serialized_units unit on unit.id=usage.serialized_unit_id
      join public.receipt_serializations serialization on serialization.id=unit.serialization_id
      join public.inventory_receipt_lines receipt_line on receipt_line.id=serialization.receipt_line_id
      join public.inventory_receipts receipt on receipt.id=receipt_line.receipt_id
      join public.suppliers supplier on supplier.id=receipt.supplier_id
      where execution.production_lot_id=production_lot_filter and usage.organization_id=public.current_org()
        and usage.facility_id=public.current_facility()
      order by batch.sequence, usage.used_at, usage.id
      limit page_size offset offset_rows
    ) result), '[]'::jsonb),
    'page', page_number,
    'page_size', page_size
  );
end $$;

create function public.trace_source_material(
  source_lot_filter text default null,
  serialized_unit_filter uuid default null,
  page_number integer default 0,
  requested_page_size integer default 100
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare page_size integer := greatest(1, least(coalesce(requested_page_size, 100), 200)); offset_rows integer;
begin
  perform public.traceability_read_allowed();
  if page_number < 0 or (nullif(trim(coalesce(source_lot_filter, '')), '') is null and serialized_unit_filter is null) then
    raise exception 'Enter a source lot or package serial and valid page';
  end if;
  offset_rows := page_number * page_size;
  return jsonb_build_object(
    'matches', coalesce((select jsonb_agg(to_jsonb(result)) from (
      select distinct receipt_line.id as receipt_line_id, effective_source_lot.source_lot,
        receipt_line.source_lot_origin, ingredient.id as ingredient_id, ingredient.name as ingredient_name,
        supplier.id as supplier_id, supplier.name as supplier_name, receipt.id as receipt_id,
        receipt.received_on
      from public.inventory_receipt_lines receipt_line
      join public.inventory_receipts receipt on receipt.id=receipt_line.receipt_id
      join public.ingredients ingredient on ingredient.id=receipt_line.ingredient_id
      join public.suppliers supplier on supplier.id=receipt.supplier_id
      cross join lateral (select case receipt_line.source_lot_origin
        when 'supplier_provided' then receipt_line.supplier_lot
        when 'salad_soulmates_assigned' then receipt_line.assigned_source_lot end as source_lot) effective_source_lot
      where receipt_line.organization_id=public.current_org() and receipt.facility_id=public.current_facility()
        and ((serialized_unit_filter is not null and exists (
          select 1 from public.serialized_units unit join public.receipt_serializations serialization on serialization.id=unit.serialization_id
          where unit.id=serialized_unit_filter and serialization.receipt_line_id=receipt_line.id
        )) or (serialized_unit_filter is null and effective_source_lot.source_lot=trim(source_lot_filter)))
      order by receipt.received_on desc, receipt_line.id
      limit page_size offset offset_rows
    ) result), '[]'::jsonb),
    'affected_batches', coalesce((select jsonb_agg(to_jsonb(result)) from (
      select usage.id as usage_id, usage.quantity, usage.used_at, usage.source_lot,
        batch.id as batch_id, batch.sequence as batch_sequence,
        production_lot.id as production_lot_id, production_lot.production_lot_code,
        production_lot.assigned_on, product.name as product_name,
        unit.id as serialized_unit_id, unit.internal_code as package_serial, unit.supplier_barcode,
        receipt_line.id as receipt_line_id, receipt_line.source_lot_origin
      from public.batch_worksheet_source_usages usage
      join public.batch_worksheet_lines worksheet_line on worksheet_line.id=usage.worksheet_line_id
      join public.batch_worksheet_executions execution on execution.id=worksheet_line.execution_id
      join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id
      join public.production_lots production_lot on production_lot.id=execution.production_lot_id
      join public.products product on product.id=production_lot.product_id
      join public.serialized_units unit on unit.id=usage.serialized_unit_id
      join public.receipt_serializations serialization on serialization.id=unit.serialization_id
      join public.inventory_receipt_lines receipt_line on receipt_line.id=serialization.receipt_line_id
      join public.inventory_receipts receipt on receipt.id=receipt_line.receipt_id
      where usage.organization_id=public.current_org() and usage.facility_id=public.current_facility()
        and receipt.facility_id=public.current_facility()
        and ((serialized_unit_filter is not null and usage.serialized_unit_id=serialized_unit_filter)
          or (serialized_unit_filter is null and usage.source_lot=trim(source_lot_filter)))
      order by production_lot.assigned_on desc, batch.sequence, usage.used_at, usage.id
      limit page_size offset offset_rows
    ) result), '[]'::jsonb),
    'page', page_number,
    'page_size', page_size
  );
end $$;

revoke all on function public.traceability_read_allowed() from public, anon, authenticated;
revoke all on function public.find_traceability_production_lots(uuid,text,integer,integer) from public, anon, authenticated;
revoke all on function public.trace_production_lot(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.trace_source_material(text,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.find_traceability_production_lots(uuid,text,integer,integer) to authenticated;
grant execute on function public.trace_production_lot(uuid,integer,integer) to authenticated;
grant execute on function public.trace_source_material(text,uuid,integer,integer) to authenticated;
commit;
