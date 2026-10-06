begin;

-- Mobile preparation access is always derived from a published, facility-local
-- Work Order claimed by the current user. The helper is intentionally private;
-- callers use the JSON RPCs below rather than receiving table access.
create function public.mobile_mixing_prep_work_order(target_preparation_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  result uuid;
  actor public.profiles%rowtype;
  actor_facility public.facilities%rowtype;
begin
  select profile.* into actor
  from public.profiles profile
  where profile.id = auth.uid() and profile.active;
  if actor.id is null or not public.has_permission('production.mobile') then
    raise exception 'Active production worker profile required';
  end if;

  select facility.* into actor_facility
  from public.facilities facility
  where facility.organization_id = actor.organization_id
    and facility.id = actor.facility_id
    and facility.active;
  if actor_facility.id is null then raise exception 'Active facility required'; end if;

  select work.id into result
  from public.planned_spice_preparations preparation
  join public.planned_mixer_batches batch
    on batch.organization_id = preparation.organization_id
    and batch.facility_id = preparation.facility_id
    and batch.id = preparation.planned_mixer_batch_id
  join public.workforce_work_queue_items work
    on work.organization_id = preparation.organization_id
    and work.facility_id = preparation.facility_id
    and work.kind = 'ingredient_prep'
    and (
      (work.linked_task_type = 'planned_spice_preparation'
        and work.linked_task_id = preparation.id)
      or (work.linked_task_type = 'planned_mixer_batch'
        and work.linked_task_id = batch.id)
      or (work.linked_task_type = 'production_plan'
        and work.linked_task_id = batch.order_id)
    )
  join public.workforce_work_queue_claims claim
    on claim.organization_id = work.organization_id
    and claim.facility_id = work.facility_id
    and claim.queue_item_id = work.id
    and claim.worker_id = actor.id
  where preparation.id = target_preparation_id
    and preparation.organization_id = actor.organization_id
    and preparation.facility_id = actor.facility_id
    and work.work_on = (now() at time zone actor_facility.timezone)::date
    and work.publication_state = 'published'
    and work.status <> 'cancelled'
  order by case work.linked_task_type
    when 'planned_spice_preparation' then 1
    when 'planned_mixer_batch' then 2
    else 3 end, work.id
  limit 1;

  if result is null then raise exception 'Preparation is not assigned to you today'; end if;
  return result;
end $$;
revoke all on function public.mobile_mixing_prep_work_order(uuid)
  from public, anon, authenticated;

create function public.mobile_my_mixing_preps() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  actor_facility public.facilities%rowtype;
  work_date date;
begin
  select profile.* into actor
  from public.profiles profile
  where profile.id = auth.uid() and profile.active;
  if actor.id is null or not public.has_permission('production.mobile') then
    raise exception 'Active production worker profile required';
  end if;
  select facility.* into actor_facility
  from public.facilities facility
  where facility.organization_id = actor.organization_id
    and facility.id = actor.facility_id and facility.active;
  if actor_facility.id is null then raise exception 'Active facility required'; end if;
  work_date := (now() at time zone actor_facility.timezone)::date;

  return jsonb_build_object(
    'work_on', work_date,
    'timezone', actor_facility.timezone,
    'items', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.start_at nulls last,
        item.product_name, item.batch_sequence, item.planned_spice_preparation_id)
      from (
        select distinct on (preparation.id)
          work.id work_order_id,
          coalesce(nullif(trim(customer_order.reference), ''),
            customer_order.customer_name || ' · ' || customer_order.needed_on::text) order_reference,
          customer_order.customer_name,
          work.title,
          work.instructions,
          work.start_at,
          work.end_at,
          work.location_label,
          preparation.id planned_spice_preparation_id,
          batch.id planned_mixer_batch_id,
          batch.sequence batch_sequence,
          batch.target_gallons,
          product.id product_id,
          product.name product_name,
          execution.id execution_id,
          coalesce(execution.status, 'Not started') status,
          coalesce(progress.recorded_line_count, 0) recorded_line_count,
          coalesce(progress.required_line_count, 0) required_line_count
        from public.workforce_work_queue_claims claim
        join public.workforce_work_queue_items work
          on work.organization_id = claim.organization_id
          and work.facility_id = claim.facility_id
          and work.id = claim.queue_item_id
        join public.planned_mixer_batches batch
          on batch.organization_id = work.organization_id
          and batch.facility_id = work.facility_id
          and (
            (work.linked_task_type = 'planned_mixer_batch'
              and work.linked_task_id = batch.id)
            or (work.linked_task_type = 'production_plan'
              and work.linked_task_id = batch.order_id)
          )
        join public.planned_spice_preparations preparation
          on preparation.organization_id = batch.organization_id
          and preparation.facility_id = batch.facility_id
          and preparation.planned_mixer_batch_id = batch.id
        join public.products product
          on product.organization_id = batch.organization_id
          and product.id = batch.product_id
        join public.customer_orders customer_order
          on customer_order.organization_id = batch.organization_id
          and customer_order.facility_id = batch.facility_id
          and customer_order.id = batch.order_id
        left join public.batch_worksheet_executions execution
          on execution.organization_id = preparation.organization_id
          and execution.facility_id = preparation.facility_id
          and execution.planned_spice_preparation_id = preparation.id
        left join lateral (
          select count(*) required_line_count,
            count(*) filter (where coalesce(usage.recorded_quantity, 0) >= line.required_quantity)
              recorded_line_count
          from public.batch_worksheet_lines line
          left join lateral (
            select coalesce(sum(source_usage.quantity - coalesce(correction.restored, 0)), 0)
              recorded_quantity
            from public.batch_worksheet_source_usages source_usage
            left join lateral (
              select sum(entry.restored_quantity) restored
              from public.batch_worksheet_usage_corrections entry
              where entry.usage_id = source_usage.id
            ) correction on true
            where source_usage.worksheet_line_id = line.id
          ) usage on true
          where line.execution_id = execution.id
        ) progress on true
        where claim.organization_id = actor.organization_id
          and claim.facility_id = actor.facility_id
          and claim.worker_id = actor.id
          and work.kind = 'ingredient_prep'
          and work.work_on = work_date
          and work.publication_state = 'published'
          and work.status <> 'cancelled'
        union all
        select distinct on (preparation.id)
          work.id, coalesce(nullif(trim(customer_order.reference), ''),
            customer_order.customer_name || ' · ' || customer_order.needed_on::text),
          customer_order.customer_name,
          work.title, work.instructions, work.start_at, work.end_at,
          work.location_label, preparation.id, batch.id, batch.sequence,
          batch.target_gallons, product.id, product.name, execution.id,
          coalesce(execution.status, 'Not started'),
          coalesce(progress.recorded_line_count, 0),
          coalesce(progress.required_line_count, 0)
        from public.workforce_work_queue_claims claim
        join public.workforce_work_queue_items work
          on work.organization_id = claim.organization_id
          and work.facility_id = claim.facility_id
          and work.id = claim.queue_item_id
        join public.planned_spice_preparations preparation
          on preparation.organization_id = work.organization_id
          and preparation.facility_id = work.facility_id
          and work.linked_task_type = 'planned_spice_preparation'
          and work.linked_task_id = preparation.id
        join public.planned_mixer_batches batch
          on batch.organization_id = preparation.organization_id
          and batch.facility_id = preparation.facility_id
          and batch.id = preparation.planned_mixer_batch_id
        join public.products product
          on product.organization_id = batch.organization_id
          and product.id = batch.product_id
        join public.customer_orders customer_order
          on customer_order.organization_id = batch.organization_id
          and customer_order.facility_id = batch.facility_id
          and customer_order.id = batch.order_id
        left join public.batch_worksheet_executions execution
          on execution.organization_id = preparation.organization_id
          and execution.facility_id = preparation.facility_id
          and execution.planned_spice_preparation_id = preparation.id
        left join lateral (
          select count(*) required_line_count,
            count(*) filter (where coalesce(usage.recorded_quantity, 0) >= line.required_quantity)
              recorded_line_count
          from public.batch_worksheet_lines line
          left join lateral (
            select coalesce(sum(source_usage.quantity - coalesce(correction.restored, 0)), 0)
              recorded_quantity
            from public.batch_worksheet_source_usages source_usage
            left join lateral (
              select sum(entry.restored_quantity) restored
              from public.batch_worksheet_usage_corrections entry
              where entry.usage_id = source_usage.id
            ) correction on true
            where source_usage.worksheet_line_id = line.id
          ) usage on true
          where line.execution_id = execution.id
        ) progress on true
        where claim.organization_id = actor.organization_id
          and claim.facility_id = actor.facility_id
          and claim.worker_id = actor.id
          and work.kind = 'ingredient_prep'
          and work.work_on = work_date
          and work.publication_state = 'published'
          and work.status <> 'cancelled'
      ) item
    ), '[]'::jsonb)
  );
end $$;

create function public.mobile_mixing_prep_detail(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  preparation_id uuid;
  assigned_work_order_id uuid;
  result jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ? 'planned_spice_preparation_id'
    or payload - 'planned_spice_preparation_id' <> '{}'::jsonb then
    raise exception 'Choose an assigned preparation';
  end if;
  preparation_id := (payload->>'planned_spice_preparation_id')::uuid;
  assigned_work_order_id := public.mobile_mixing_prep_work_order(preparation_id);

  select jsonb_build_object(
    'planned_spice_preparation_id', preparation.id,
    'planned_mixer_batch_id', batch.id,
    'batch_sequence', batch.sequence,
    'target_gallons', batch.target_gallons,
    'product', jsonb_build_object('id', product.id, 'name', product.name),
    'work_order_id', assigned_work_order_id,
    'instructions', (select work.instructions
      from public.workforce_work_queue_items work
      where work.id = assigned_work_order_id),
    'execution_id', execution.id,
    'status', coalesce(execution.status, 'Not started'),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', section.id,
        'name', section.name,
        'sequence', section.sequence,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'worksheet_line_id', worksheet_line.id,
            'recipe_line_id', recipe_line.id,
            'ingredient_id', ingredient.id,
            'ingredient_name', ingredient.name,
            'display_measurement', recipe_line.display_measurement,
            'required_quantity', recipe_line.normalized_quantity,
            'uom', recipe_line.normalized_uom,
            'sequence', recipe_line.sequence,
            'instruction', coalesce(recipe_line.operator_note, ''),
            'recorded_quantity', coalesce(usage.recorded_quantity, 0),
            'complete', coalesce(usage.recorded_quantity, 0) >= recipe_line.normalized_quantity
          ) order by recipe_line.sequence)
          from public.recipe_lines recipe_line
          join public.ingredients ingredient
            on ingredient.organization_id = recipe_line.organization_id
            and ingredient.id = recipe_line.ingredient_id
          left join public.batch_worksheet_lines worksheet_line
            on worksheet_line.organization_id = recipe_line.organization_id
            and worksheet_line.recipe_line_id = recipe_line.id
            and worksheet_line.execution_id = execution.id
          left join lateral (
            select coalesce(sum(source_usage.quantity - coalesce(correction.restored, 0)), 0)
              recorded_quantity
            from public.batch_worksheet_source_usages source_usage
            left join lateral (
              select sum(entry.restored_quantity) restored
              from public.batch_worksheet_usage_corrections entry
              where entry.usage_id = source_usage.id
            ) correction on true
            where source_usage.worksheet_line_id = worksheet_line.id
          ) usage on true
          where recipe_line.organization_id = batch.organization_id
            and recipe_line.recipe_version_id = batch.recipe_version_id
            and recipe_line.recipe_section_id = section.id
        ), '[]'::jsonb)
      ) order by section.sequence)
      from public.recipe_sections section
      where section.organization_id = batch.organization_id
        and section.recipe_version_id = batch.recipe_version_id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', issue.id,
        'category', issue.category,
        'note', issue.note,
        'worksheet_line_id', issue.worksheet_line_id,
        'serialized_unit_id', issue.serialized_unit_id,
        'created_at', issue.created_at
      ) order by issue.created_at, issue.id)
      from public.spice_preparation_issues issue
      where issue.execution_id = execution.id
        and issue.organization_id = batch.organization_id
        and issue.facility_id = batch.facility_id
    ), '[]'::jsonb)
  ) into result
  from public.planned_spice_preparations preparation
  join public.planned_mixer_batches batch
    on batch.organization_id = preparation.organization_id
    and batch.facility_id = preparation.facility_id
    and batch.id = preparation.planned_mixer_batch_id
  join public.products product
    on product.organization_id = batch.organization_id and product.id = batch.product_id
  left join public.batch_worksheet_executions execution
    on execution.organization_id = preparation.organization_id
    and execution.facility_id = preparation.facility_id
    and execution.planned_spice_preparation_id = preparation.id
  where preparation.id = preparation_id
    and preparation.organization_id = public.current_org()
    and preparation.facility_id = public.current_facility();
  if result is null then raise exception 'Choose an assigned preparation'; end if;
  return result;
end $$;

create function public.mobile_start_mixing_prep(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare preparation_id uuid; batch_id uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ? 'planned_spice_preparation_id'
    or payload - 'planned_spice_preparation_id' <> '{}'::jsonb then
    raise exception 'Choose an assigned preparation';
  end if;
  preparation_id := (payload->>'planned_spice_preparation_id')::uuid;
  perform public.mobile_mixing_prep_work_order(preparation_id);
  select preparation.planned_mixer_batch_id into batch_id
  from public.planned_spice_preparations preparation
  where preparation.id = preparation_id
    and preparation.organization_id = public.current_org()
    and preparation.facility_id = public.current_facility();
  return public.open_batch_worksheet(batch_id);
end $$;

create function public.mobile_resolve_mixing_ingredient(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requested_execution_id uuid;
  line_id uuid;
  search_value text;
  expected_ingredient_id uuid;
  expected_uom text;
  preparation_id uuid;
  exact_match public.serialized_unit_balances%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['execution_id', 'worksheet_line_id', 'identifier']
    or payload - array['execution_id', 'worksheet_line_id', 'identifier'] <> '{}'::jsonb then
    raise exception 'Scan or enter an ingredient package';
  end if;
  requested_execution_id := (payload->>'execution_id')::uuid;
  line_id := (payload->>'worksheet_line_id')::uuid;
  search_value := trim(coalesce(payload->>'identifier', ''));
  if length(search_value) not between 1 and 120 then
    raise exception 'Scan or enter an ingredient package';
  end if;
  select worksheet_line.ingredient_id, worksheet_line.uom,
    execution.planned_spice_preparation_id
    into expected_ingredient_id, expected_uom, preparation_id
  from public.batch_worksheet_lines worksheet_line
  join public.batch_worksheet_executions execution
    on execution.organization_id = worksheet_line.organization_id
    and execution.facility_id = worksheet_line.facility_id
    and execution.id = worksheet_line.execution_id
  where worksheet_line.id = line_id
    and worksheet_line.execution_id = requested_execution_id
    and worksheet_line.organization_id = public.current_org()
    and worksheet_line.facility_id = public.current_facility();
  if expected_ingredient_id is null then raise exception 'Choose an expected ingredient'; end if;
  perform public.mobile_mixing_prep_work_order(preparation_id);

  select balance.* into exact_match
  from public.serialized_unit_balances balance
  where balance.organization_id = public.current_org()
    and balance.facility_id = public.current_facility()
    and (balance.internal_code = upper(search_value)
      or balance.supplier_barcode = search_value)
  limit 1;
  if exact_match.id is not null and exact_match.ingredient_id <> expected_ingredient_id then
    return jsonb_build_object('match', null, 'matches', '[]'::jsonb,
      'reason', 'unexpected_ingredient');
  end if;

  return jsonb_build_object(
    'match', case when exact_match.id is not null then jsonb_build_object(
      'id', exact_match.id,
      'internal_code', exact_match.internal_code,
      'supplier_barcode', exact_match.supplier_barcode,
      'source_lot', exact_match.source_lot,
      'remaining_quantity', exact_match.remaining_quantity,
      'uom', exact_match.uom,
      'availability', exact_match.availability
    ) else null end,
    'matches', coalesce((
      select jsonb_agg(to_jsonb(match) order by match.expiration_date nulls last,
        match.internal_code)
      from (
        select balance.id, balance.internal_code, balance.supplier_barcode,
          balance.source_lot, balance.remaining_quantity, balance.uom,
          balance.availability, balance.expiration_date
        from public.serialized_unit_balances balance
        where exact_match.id is null
          and balance.organization_id = public.current_org()
          and balance.facility_id = public.current_facility()
          and balance.ingredient_id = expected_ingredient_id
          and balance.uom = expected_uom
          and balance.availability = 'Available'
          and balance.source_lot <> ''
          and (position(lower(search_value) in lower(balance.internal_code)) > 0
            or position(lower(search_value) in lower(coalesce(balance.supplier_barcode, ''))) > 0
            or position(lower(search_value) in lower(balance.source_lot)) > 0)
        limit 20
      ) match
    ), '[]'::jsonb),
    'reason', case when exact_match.id is not null
      and (exact_match.uom <> expected_uom or exact_match.availability <> 'Available'
        or exact_match.source_lot = '') then 'unavailable' else null end
  );
end $$;

create function public.mobile_record_mixing_ingredient(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare preparation_id uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['id', 'worksheet_line_id', 'serialized_unit_id', 'quantity']
    or payload - array['id', 'worksheet_line_id', 'serialized_unit_id', 'quantity'] <> '{}'::jsonb then
    raise exception 'Enter a valid ingredient package and quantity';
  end if;
  select execution.planned_spice_preparation_id into preparation_id
  from public.batch_worksheet_lines line
  join public.batch_worksheet_executions execution
    on execution.organization_id = line.organization_id
    and execution.facility_id = line.facility_id
    and execution.id = line.execution_id
  where line.id = (payload->>'worksheet_line_id')::uuid
    and line.organization_id = public.current_org()
    and line.facility_id = public.current_facility();
  if preparation_id is null then raise exception 'Choose an expected ingredient'; end if;
  perform public.mobile_mixing_prep_work_order(preparation_id);
  return public.record_batch_worksheet_usage(payload);
end $$;

create function public.mobile_report_mixing_prep(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare preparation_id uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ?& array['id', 'execution_id', 'category', 'note']
    or payload - array['id', 'execution_id', 'worksheet_line_id',
      'serialized_unit_id', 'category', 'note'] <> '{}'::jsonb then
    raise exception 'Enter a preparation note or problem';
  end if;
  select execution.planned_spice_preparation_id into preparation_id
  from public.batch_worksheet_executions execution
  where execution.id = (payload->>'execution_id')::uuid
    and execution.organization_id = public.current_org()
    and execution.facility_id = public.current_facility();
  if preparation_id is null then raise exception 'Choose an open spice preparation'; end if;
  perform public.mobile_mixing_prep_work_order(preparation_id);
  return public.report_spice_preparation_issue(payload);
end $$;

create function public.mobile_complete_mixing_prep(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare requested_execution_id uuid; preparation_id uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or not payload ? 'execution_id'
    or payload - 'execution_id' <> '{}'::jsonb then
    raise exception 'Choose an open spice preparation';
  end if;
  requested_execution_id := (payload->>'execution_id')::uuid;
  select execution.planned_spice_preparation_id into preparation_id
  from public.batch_worksheet_executions execution
  where execution.id = requested_execution_id
    and execution.organization_id = public.current_org()
    and execution.facility_id = public.current_facility();
  if preparation_id is null then raise exception 'Choose an open spice preparation'; end if;
  perform public.mobile_mixing_prep_work_order(preparation_id);
  return public.complete_batch_worksheet(requested_execution_id);
end $$;

revoke all on function public.mobile_my_mixing_preps() from public, anon;
revoke all on function public.mobile_mixing_prep_detail(jsonb) from public, anon;
revoke all on function public.mobile_start_mixing_prep(jsonb) from public, anon;
revoke all on function public.mobile_resolve_mixing_ingredient(jsonb) from public, anon;
revoke all on function public.mobile_record_mixing_ingredient(jsonb) from public, anon;
revoke all on function public.mobile_report_mixing_prep(jsonb) from public, anon;
revoke all on function public.mobile_complete_mixing_prep(jsonb) from public, anon;
grant execute on function public.mobile_my_mixing_preps() to authenticated;
grant execute on function public.mobile_mixing_prep_detail(jsonb) to authenticated;
grant execute on function public.mobile_start_mixing_prep(jsonb) to authenticated;
grant execute on function public.mobile_resolve_mixing_ingredient(jsonb) to authenticated;
grant execute on function public.mobile_record_mixing_ingredient(jsonb) to authenticated;
grant execute on function public.mobile_report_mixing_prep(jsonb) to authenticated;
grant execute on function public.mobile_complete_mixing_prep(jsonb) to authenticated;

-- Preserve administrator operations while preventing a production worker from
-- bypassing the assignment-scoped facade through the historic RPC names.
alter function public.worker_spice_preparations() rename to worker_spice_preparations_unscoped_impl;
alter function public.open_batch_worksheet(uuid) rename to open_batch_worksheet_unscoped_impl;
alter function public.record_batch_worksheet_usage(jsonb) rename to record_batch_worksheet_usage_unscoped_impl;
alter function public.correct_batch_worksheet_usage(jsonb) rename to correct_batch_worksheet_usage_unscoped_impl;
alter function public.report_spice_preparation_issue(jsonb) rename to report_spice_preparation_issue_unscoped_impl;
alter function public.complete_batch_worksheet(uuid) rename to complete_batch_worksheet_unscoped_impl;
revoke all on function public.worker_spice_preparations_unscoped_impl() from public, anon, authenticated;
revoke all on function public.open_batch_worksheet_unscoped_impl(uuid) from public, anon, authenticated;
revoke all on function public.record_batch_worksheet_usage_unscoped_impl(jsonb) from public, anon, authenticated;
revoke all on function public.correct_batch_worksheet_usage_unscoped_impl(jsonb) from public, anon, authenticated;
revoke all on function public.report_spice_preparation_issue_unscoped_impl(jsonb) from public, anon, authenticated;
revoke all on function public.complete_batch_worksheet_unscoped_impl(uuid) from public, anon, authenticated;

create function public.open_batch_worksheet(batch_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare preparation_id uuid;
begin
  if public.current_role() <> 'admin' then
    select preparation.id into preparation_id
    from public.planned_spice_preparations preparation
    where preparation.planned_mixer_batch_id = batch_id
      and preparation.organization_id = public.current_org()
      and preparation.facility_id = public.current_facility();
    if preparation_id is null then raise exception 'Choose an assigned production batch'; end if;
    perform public.mobile_mixing_prep_work_order(preparation_id);
  end if;
  return public.open_batch_worksheet_unscoped_impl(batch_id);
end $$;

create function public.record_batch_worksheet_usage(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare preparation_id uuid;
begin
  if public.current_role() <> 'admin' then
    select execution.planned_spice_preparation_id into preparation_id
    from public.batch_worksheet_lines line
    join public.batch_worksheet_executions execution on execution.id = line.execution_id
    where line.id = (payload->>'worksheet_line_id')::uuid
      and line.organization_id = public.current_org()
      and line.facility_id = public.current_facility();
    if preparation_id is null then raise exception 'Choose an open worksheet line'; end if;
    perform public.mobile_mixing_prep_work_order(preparation_id);
  end if;
  return public.record_batch_worksheet_usage_unscoped_impl(payload);
end $$;

create function public.correct_batch_worksheet_usage(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare preparation_id uuid;
begin
  if public.current_role() <> 'admin' then
    select execution.planned_spice_preparation_id into preparation_id
    from public.batch_worksheet_source_usages source_usage
    join public.batch_worksheet_lines line on line.id = source_usage.worksheet_line_id
    join public.batch_worksheet_executions execution on execution.id = line.execution_id
    where source_usage.id = (payload->>'usage_id')::uuid
      and source_usage.organization_id = public.current_org()
      and source_usage.facility_id = public.current_facility();
    if preparation_id is null then raise exception 'Choose an open worksheet usage'; end if;
    perform public.mobile_mixing_prep_work_order(preparation_id);
  end if;
  return public.correct_batch_worksheet_usage_unscoped_impl(payload);
end $$;

create function public.report_spice_preparation_issue(payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare preparation_id uuid;
begin
  if public.current_role() <> 'admin' then
    select execution.planned_spice_preparation_id into preparation_id
    from public.batch_worksheet_executions execution
    where execution.id = (payload->>'execution_id')::uuid
      and execution.organization_id = public.current_org()
      and execution.facility_id = public.current_facility();
    if preparation_id is null then raise exception 'Choose an open spice preparation'; end if;
    perform public.mobile_mixing_prep_work_order(preparation_id);
  end if;
  return public.report_spice_preparation_issue_unscoped_impl(payload);
end $$;

create function public.complete_batch_worksheet(execution_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare preparation_id uuid; requested_execution_id uuid := execution_id;
begin
  if public.current_role() <> 'admin' then
    select execution.planned_spice_preparation_id into preparation_id
    from public.batch_worksheet_executions execution
    where execution.id = requested_execution_id
      and execution.organization_id = public.current_org()
      and execution.facility_id = public.current_facility();
    if preparation_id is null then raise exception 'Choose an open worksheet'; end if;
    perform public.mobile_mixing_prep_work_order(preparation_id);
  end if;
  return public.complete_batch_worksheet_unscoped_impl(requested_execution_id);
end $$;

create function public.worker_spice_preparations() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_role() <> 'admin' then
    raise exception 'Use the assigned mobile preparation API';
  end if;
  return public.worker_spice_preparations_unscoped_impl();
end $$;

revoke all on function public.open_batch_worksheet(uuid) from public, anon;
revoke all on function public.record_batch_worksheet_usage(jsonb) from public, anon;
revoke all on function public.correct_batch_worksheet_usage(jsonb) from public, anon;
revoke all on function public.report_spice_preparation_issue(jsonb) from public, anon;
revoke all on function public.complete_batch_worksheet(uuid) from public, anon;
revoke all on function public.worker_spice_preparations() from public, anon;
grant execute on function public.open_batch_worksheet(uuid) to authenticated;
grant execute on function public.record_batch_worksheet_usage(jsonb) to authenticated;
grant execute on function public.correct_batch_worksheet_usage(jsonb) to authenticated;
grant execute on function public.report_spice_preparation_issue(jsonb) to authenticated;
grant execute on function public.complete_batch_worksheet(uuid) to authenticated;
grant execute on function public.worker_spice_preparations() to authenticated;

comment on function public.mobile_my_mixing_preps() is
  'Today-only, assignment-scoped preparation list with a non-empty order_reference for the authenticated mobile worker.';
comment on function public.mobile_mixing_prep_detail(jsonb) is
  'Assigned preparation recipe, progress, instructions, notes and problems.';

commit;
