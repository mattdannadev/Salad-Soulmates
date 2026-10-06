begin;

-- The calendar consumes only confirmed inbound purchase commitments that still
-- have outstanding quantities. This keeps completed receipts out of the work
-- queue while retaining the supplier and line context needed by operations.
create or replace function public.get_schedule_supplier_deliveries(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_facility uuid := (payload->>'facility_id')::uuid;
  requested_start date := (payload->>'start_on')::date;
  requested_end date := (payload->>'end_on')::date;
  result jsonb;
begin
  if not public.has_permission('workforce.read') then
    raise exception 'Workforce read permission required';
  end if;
  if requested_facility is distinct from public.current_facility() then
    raise exception 'Invalid facility scope';
  end if;
  if requested_end <= requested_start or requested_end > requested_start + 366 then
    raise exception 'Invalid schedule range';
  end if;

  with received as (
    select receipt_line.purchase_draft_line_id, sum(receipt_line.quantity) as quantity
    from public.inventory_receipt_lines receipt_line
    where receipt_line.organization_id = public.current_org()
      and receipt_line.purchase_draft_line_id is not null
    group by receipt_line.purchase_draft_line_id
  ), open_deliveries as (
    select purchase.id, purchase.expected_on, supplier.name as supplier_name,
      purchase.reference, purchase.note,
      jsonb_agg(jsonb_build_object(
        'ingredient_name', line.ingredient_name,
        'quantity', line.quantity - coalesce(received.quantity, 0),
        'uom', line.uom
      ) order by line.ingredient_name) filter (where line.quantity > coalesce(received.quantity, 0)) as lines
    from public.purchase_drafts purchase
    join public.suppliers supplier on supplier.organization_id = purchase.organization_id
      and supplier.id = purchase.supplier_id
    join public.purchase_draft_lines line on line.organization_id = purchase.organization_id
      and line.facility_id = purchase.facility_id
      and line.purchase_draft_id = purchase.id
    left join received on received.purchase_draft_line_id = line.id
    where purchase.organization_id = public.current_org()
      and purchase.facility_id = requested_facility
      and purchase.status = 'Confirmed'
      and purchase.expected_on >= requested_start
      and purchase.expected_on < requested_end
    group by purchase.id, purchase.expected_on, supplier.name, purchase.reference, purchase.note
    having bool_or(line.quantity > coalesce(received.quantity, 0))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', open_delivery.id,
    'supplier_name', open_delivery.supplier_name,
    'reference', open_delivery.reference,
    'expected_on', open_delivery.expected_on,
    'note', open_delivery.note,
    'lines', open_delivery.lines
  ) order by open_delivery.expected_on, open_delivery.supplier_name, open_delivery.id), '[]'::jsonb)
  into result
  from open_deliveries open_delivery;

  return result;
end $$;

revoke all on function public.get_schedule_supplier_deliveries(jsonb) from public, anon;
grant execute on function public.get_schedule_supplier_deliveries(jsonb) to authenticated;

commit;
