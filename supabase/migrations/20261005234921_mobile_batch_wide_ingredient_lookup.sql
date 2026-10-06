begin;

-- Resolve a package or source lot against the complete assigned preparation.
-- This lets the phone scan first while retaining the worksheet-line boundary
-- required by the immutable usage ledger.
create function public.mobile_find_mixing_ingredient(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_execution_id uuid;
  search_value text;
  preparation_id uuid;
  exact_package public.serialized_unit_balances%rowtype;
  result jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['execution_id', 'identifier']
    or payload - array['execution_id', 'identifier'] <> '{}'::jsonb
    or coalesce(payload->>'execution_id', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Scan or enter an ingredient package';
  end if;

  requested_execution_id := (payload->>'execution_id')::uuid;
  search_value := trim(coalesce(payload->>'identifier', ''));
  if length(search_value) not between 1 and 120 then
    raise exception 'Scan or enter an ingredient package';
  end if;

  select execution.planned_spice_preparation_id into preparation_id
  from public.batch_worksheet_executions execution
  where execution.id = requested_execution_id
    and execution.organization_id = public.current_org()
    and execution.facility_id = public.current_facility();
  if preparation_id is null then
    raise exception 'Choose an open spice preparation';
  end if;
  perform public.mobile_mixing_prep_work_order(preparation_id);

  select balance.* into exact_package
  from public.serialized_unit_balances balance
  where balance.organization_id = public.current_org()
    and balance.facility_id = public.current_facility()
    and (balance.internal_code = upper(search_value)
      or balance.supplier_barcode = search_value)
  limit 1;

  with expected_lines as (
    select
      worksheet_line.id,
      worksheet_line.ingredient_id,
      ingredient.name ingredient_name,
      recipe_line.display_measurement,
      worksheet_line.required_quantity,
      coalesce(usage.recorded_quantity, 0) recorded_quantity,
      worksheet_line.uom,
      worksheet_line.sequence,
      coalesce(recipe_line.operator_note, '') instruction
    from public.batch_worksheet_lines worksheet_line
    join public.recipe_lines recipe_line
      on recipe_line.organization_id = worksheet_line.organization_id
      and recipe_line.id = worksheet_line.recipe_line_id
    join public.ingredients ingredient
      on ingredient.organization_id = worksheet_line.organization_id
      and ingredient.id = worksheet_line.ingredient_id
    left join lateral (
      select coalesce(sum(source_usage.quantity
        - coalesce(correction.restored_quantity, 0)), 0) recorded_quantity
      from public.batch_worksheet_source_usages source_usage
      left join lateral (
        select coalesce(sum(entry.restored_quantity), 0) restored_quantity
        from public.batch_worksheet_usage_corrections entry
        where entry.usage_id = source_usage.id
      ) correction on true
      where source_usage.worksheet_line_id = worksheet_line.id
    ) usage on true
    where worksheet_line.execution_id = requested_execution_id
      and worksheet_line.organization_id = public.current_org()
      and worksheet_line.facility_id = public.current_facility()
  ),
  candidate_lines as (
    select expected.*
    from expected_lines expected
    where (exact_package.id is not null
        and expected.ingredient_id = exact_package.ingredient_id)
      or (exact_package.id is null and exists (
        select 1
        from public.serialized_unit_balances balance
        where balance.organization_id = public.current_org()
          and balance.facility_id = public.current_facility()
          and balance.ingredient_id = expected.ingredient_id
          and balance.uom = expected.uom
          and balance.availability = 'Available'
          and coalesce(balance.source_lot, '') <> ''
          and (position(lower(search_value) in lower(balance.internal_code)) > 0
            or position(lower(search_value)
              in lower(coalesce(balance.supplier_barcode, ''))) > 0
            or position(lower(search_value)
              in lower(balance.source_lot)) > 0)
      ))
  ),
  line_results as (
    select jsonb_build_object(
      'id', candidate.id,
      'ingredient_id', candidate.ingredient_id,
      'ingredient_name', candidate.ingredient_name,
      'display_measurement', candidate.display_measurement,
      'required_quantity', candidate.required_quantity,
      'recorded_quantity', candidate.recorded_quantity,
      'uom', candidate.uom,
      'sequence', candidate.sequence,
      'instruction', candidate.instruction,
      'complete', candidate.recorded_quantity >= candidate.required_quantity
    ) value, candidate.id, candidate.sequence
    from candidate_lines candidate
  ),
  package_results as (
    select
      jsonb_build_object(
        'worksheet_line_id', candidate.id,
        'id', balance.id,
        'internal_code', balance.internal_code,
        'supplier_barcode', balance.supplier_barcode,
        'source_lot', balance.source_lot,
        'remaining_quantity', balance.remaining_quantity,
        'uom', balance.uom,
        'availability', balance.availability,
        'expiration_date', balance.expiration_date
      ) value,
      candidate.id worksheet_line_id,
      balance.id,
      balance.expiration_date,
      balance.internal_code
    from candidate_lines candidate
    join public.serialized_unit_balances balance
      on balance.organization_id = public.current_org()
      and balance.facility_id = public.current_facility()
      and balance.ingredient_id = candidate.ingredient_id
      and balance.uom = candidate.uom
      and balance.availability = 'Available'
      and coalesce(balance.source_lot, '') <> ''
      and (
        (exact_package.id is not null and balance.id = exact_package.id)
        or (exact_package.id is null and (
          position(lower(search_value) in lower(balance.internal_code)) > 0
          or position(lower(search_value)
            in lower(coalesce(balance.supplier_barcode, ''))) > 0
          or position(lower(search_value) in lower(balance.source_lot)) > 0
        ))
      )
  )
  select jsonb_build_object(
    'worksheet_line', case when (select count(*) from line_results) = 1
      then (select value from line_results limit 1) else null end,
    'worksheet_lines', coalesce((
      select jsonb_agg(value order by sequence, id) from line_results
    ), '[]'::jsonb),
    'match', case when exact_package.id is not null
        and (select count(*) from line_results) = 1
      then jsonb_build_object(
        'worksheet_line_id', (select id from line_results limit 1),
        'id', exact_package.id,
        'internal_code', exact_package.internal_code,
        'supplier_barcode', exact_package.supplier_barcode,
        'source_lot', exact_package.source_lot,
        'remaining_quantity', exact_package.remaining_quantity,
        'uom', exact_package.uom,
        'availability', exact_package.availability,
        'expiration_date', exact_package.expiration_date
      ) else null end,
    'matches', coalesce((
      select jsonb_agg(value order by expiration_date nulls last,
        internal_code, worksheet_line_id)
      from (select * from package_results
        order by expiration_date nulls last, internal_code, worksheet_line_id
        limit 20) limited_packages
    ), '[]'::jsonb),
    'reason', case
      when exact_package.id is not null
        and not exists(select 1 from line_results)
        then 'unexpected_ingredient'
      when not exists(select 1 from line_results) then 'not_found'
      when (select count(*) from line_results) > 1 then 'ambiguous_ingredient'
      when exact_package.id is not null
        and (exact_package.uom is distinct from
            (select candidate.uom from candidate_lines candidate limit 1)
          or exact_package.availability <> 'Available'
          or coalesce(exact_package.source_lot, '') = '')
        then 'unavailable'
      else null
    end
  ) into result;

  return result;
end $$;

revoke all on function public.mobile_find_mixing_ingredient(jsonb)
  from public, anon, authenticated;
grant execute on function public.mobile_find_mixing_ingredient(jsonb)
  to authenticated;

comment on function public.mobile_find_mixing_ingredient(jsonb) is
  'Assignment-scoped batch-wide package, barcode and source-lot resolver for mobile ingredient preparation.';

notify pgrst, 'reload schema';

commit;
