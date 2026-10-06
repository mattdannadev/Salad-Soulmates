begin;

-- Adjusted previews remain read-only. Confirmation recomputes the same inputs
-- under the existing facility/capacity locks and verifies the full fingerprint.
create or replace function public.preview_order_production_work(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  order_row public.customer_orders%rowtype;
  facility public.facilities%rowtype;
  product public.products%rowtype;
  item jsonb;
  events jsonb := '[]';
  warnings jsonb := '["Work is created as unassigned draft work. Review staffing before publication.","Packaging is an all-day planning allowance, not a measured packaging duration. Production must complete at least two calendar days before pickup.","The proposal uses Monday through Friday production days."]';
  finish_day date;
  mixing_day date;
  prep_day date;
  first_day date;
  remaining integer;
  daily_batches integer;
  allocated integer;
  total_batches integer := 0;
  used_minutes numeric;
  day_minutes numeric;
  prep_minutes numeric;
  mix_minutes numeric;
  starts timestamptz;
  ends timestamptz;
  existing boolean;
  valid boolean := true;
  result jsonb;
  attempts integer := 0;
  requested_start date;
  latest_finish date;
  requested_days integer;
  scheduled_days integer;
  product_finish date;
  last_mixing_day date;
  adjustment jsonb;
  product_days jsonb := '[]';
  normalized_days jsonb := '[]';
  direction integer := -1;
begin
  if auth.uid() is null or not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write')
    or not public.has_permission('inventory.read') or not public.has_permission('workforce.manage') then
    raise exception 'Order production planning permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload - array['order_id','production_start_on','product_days'] <> '{}'::jsonb
    or nullif(payload->>'order_id','') is null then raise exception 'Choose an order'; end if;
  select * into order_row from public.customer_orders where id=(payload->>'order_id')::uuid
    and organization_id=public.current_org() and facility_id=public.current_facility();
  if order_row.id is null then raise exception 'Order unavailable'; end if;
  select * into facility from public.facilities where id=order_row.facility_id;
  if payload ? 'production_start_on' then
    if jsonb_typeof(payload->'production_start_on') is distinct from 'string'
      or payload->>'production_start_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Choose a valid production start date';
    end if;
    requested_start := (payload->>'production_start_on')::date;
    if extract(isodow from requested_start)>5 then
      raise exception 'Choose a Monday through Friday production start date';
    end if;
    direction := 1;
  end if;
  if payload ? 'product_days' then
    if jsonb_typeof(payload->'product_days') is distinct from 'array' then
      raise exception 'Choose valid mixing workdays for each product';
    end if;
    for adjustment in select value from jsonb_array_elements(payload->'product_days') loop
      if jsonb_typeof(adjustment) is distinct from 'object'
        or adjustment-array['product_id','workdays']<>'{}'::jsonb
        or jsonb_typeof(adjustment->'product_id') is distinct from 'string'
        or jsonb_typeof(adjustment->'workdays') is distinct from 'number'
        or adjustment->>'workdays' !~ '^[1-9][0-9]{0,3}$' then
        raise exception 'Choose valid mixing workdays for each product';
      end if;
      if not exists(select 1 from jsonb_array_elements(order_row.items) i
        where (i->>'product_id')::uuid=(adjustment->>'product_id')::uuid) then
        raise exception 'Choose a product from this order';
      end if;
      if exists(select 1 from jsonb_array_elements(normalized_days) d
        where d->>'product_id'=((adjustment->>'product_id')::uuid)::text) then
        raise exception 'Choose mixing workdays only once per product';
      end if;
      if (adjustment->>'workdays')::integer > least(3660,(select sum((i->>'batch_count')::integer)
        from jsonb_array_elements(order_row.items) i where (i->>'product_id')::uuid=(adjustment->>'product_id')::uuid)) then
        raise exception 'Mixing workdays cannot exceed the product batch count or planning horizon';
      end if;
      normalized_days := normalized_days || jsonb_build_array(jsonb_build_object(
        'product_id',(adjustment->>'product_id')::uuid,'workdays',(adjustment->>'workdays')::integer));
    end loop;
  end if;
  select coalesce(jsonb_agg(value order by value->>'product_id'),'[]') into normalized_days
    from jsonb_array_elements(normalized_days);
  if not exists(select 1 from public.material_plans where id=order_row.id and status='Active') then
    raise exception 'Choose an active order'; end if;
  existing := exists(select 1 from public.order_production_plans where id=order_row.id)
    or exists(select 1 from public.workforce_work_queue_items where organization_id=order_row.organization_id
      and facility_id=order_row.facility_id and linked_task_id=order_row.id and linked_task_type in ('order','production_plan'))
    or exists(select 1 from public.workforce_schedule_events where organization_id=order_row.organization_id
      and facility_id=order_row.facility_id and (production_plan_id=order_row.id
        or (linked_task_id=order_row.id and linked_task_type in ('order','production_plan'))));
  if existing then warnings := warnings || jsonb_build_array('This order already has production work. Existing work will not be replaced.'); valid := false; end if;
  finish_day := order_row.needed_on - 2;
  while extract(isodow from finish_day)>5 loop finish_day:=finish_day-1; end loop;
  latest_finish := finish_day;
  if requested_start is not null then finish_day := requested_start; end if;
  first_day := coalesce(requested_start,finish_day);
  for item in select jsonb_build_object('product_id',value->>'product_id','batch_count',sum((value->>'batch_count')::integer))
    from jsonb_array_elements(order_row.items) group by value->>'product_id' order by value->>'product_id' loop
    select * into product from public.products where id=(item->>'product_id')::uuid and organization_id=order_row.organization_id;
    remaining := (item->>'batch_count')::integer;
    total_batches := total_batches + remaining;
    select (d->>'workdays')::integer into requested_days from jsonb_array_elements(normalized_days) d
      where d->>'product_id'=product.id::text;
    scheduled_days := 0;
    last_mixing_day := null;
    if remaining is null or remaining<1 or total_batches>10000 then raise exception 'Production planning supports 1 to 10000 batches'; end if;
    if product.ingredient_prep_minutes_per_batch is null or product.mixing_minutes_per_batch is null then
      valid:=false;
      warnings:=warnings||jsonb_build_array('Configure prep and mixing labor estimates for '||product.name||' before confirming.');
      product_days := product_days || jsonb_build_array(jsonb_build_object(
        'product_id',product.id,'product_name',product.name,'workdays',coalesce(requested_days,1)));
      continue;
    end if;
    mixing_day:=case when requested_start is null then finish_day-greatest(1,facility.packaging_lead_days)
      else requested_start+facility.ingredient_prep_lead_days end;
    while remaining>0 loop
      attempts:=attempts+1;
      if attempts>3660 then raise exception 'The order exceeds the supported planning horizon'; end if;
      if extract(isodow from mixing_day)>5 then mixing_day:=mixing_day+direction; continue; end if;
      select coalesce((select productive_mixing_hours*60 from public.plant_daily_capacity_overrides
        where facility_id=facility.id and organization_id=facility.organization_id and work_on=mixing_day),
        facility.productive_mixing_hours_per_day*60) into day_minutes;
      select coalesce(sum(minutes),0), coalesce(sum(batches),0)::integer into used_minutes,allocated from (
        select coalesce(w.estimated_minutes,extract(epoch from w.end_at-w.start_at)/60) minutes,
          coalesce(w.batch_quota,0) batches from public.workforce_work_queue_items w
          where w.facility_id=facility.id and w.organization_id=facility.organization_id and w.work_on=mixing_day
            and w.kind='mixing' and w.status<>'cancelled' and w.publication_state<>'cancelled'
        union all select case when e.all_day then coalesce(e.planned_batch_count*p.mixing_minutes_per_batch,day_minutes)
            else extract(epoch from e.end_at-e.start_at)/60 end,coalesce(e.planned_batch_count,0)
          from public.workforce_schedule_events e left join public.products p on p.id=e.product_id where e.facility_id=facility.id
            and e.organization_id=facility.organization_id and e.start_on=mixing_day and e.kind='mixing'
            and not exists(select 1 from public.workforce_work_queue_items w where w.id=e.id)
        union all select (e->>'estimated_minutes')::numeric,(e->>'batch_count')::numeric
          from jsonb_array_elements(events) e where e->>'kind'='mixing' and (e->>'work_on')::date=mixing_day
      ) occupied;
      daily_batches:=least(remaining,24-allocated,floor(greatest(0,day_minutes-used_minutes)/product.mixing_minutes_per_batch)::integer);
      if daily_batches<1 then mixing_day:=mixing_day+direction; continue; end if;
      -- Spread whole batches across the requested number of active mixing days.
      -- If capacity requires more days, show the full plan and block confirmation.
      if requested_days is not null and requested_days>scheduled_days then
        daily_batches:=least(daily_batches,ceil(remaining::numeric/(requested_days-scheduled_days))::integer);
      end if;
      scheduled_days:=scheduled_days+1;
      last_mixing_day:=greatest(last_mixing_day,mixing_day);
      prep_day:=mixing_day-facility.ingredient_prep_lead_days;
      while extract(isodow from prep_day)>5 loop prep_day:=prep_day-1; end loop;
      if requested_start is not null then prep_day:=greatest(prep_day,requested_start); end if;
      prep_minutes:=daily_batches*product.ingredient_prep_minutes_per_batch;
      mix_minutes:=daily_batches*product.mixing_minutes_per_batch;
      first_day:=least(first_day,prep_day);
      -- Day blocks express batch allocation without promising named-worker capacity.
      starts:=mixing_day::timestamp at time zone facility.timezone;
      ends:=(mixing_day+1)::timestamp at time zone facility.timezone;
      events:=events||jsonb_build_array(jsonb_build_object('kind','mixing','product_id',product.id,'product_name',product.name,
        'title',left(product.name||' — Mixing',120),'work_on',mixing_day,'start_at',starts,'end_at',ends,'all_day',true,
        'batch_count',daily_batches,'required_worker_count',product.mixing_crew_size,'estimated_minutes',mix_minutes),
        jsonb_build_object('kind','ingredient_prep','product_id',product.id,'product_name',product.name,
        'title',left(product.name||' — Prep',120),'work_on',prep_day,
        'start_at',prep_day::timestamp at time zone facility.timezone,'end_at',(prep_day+1)::timestamp at time zone facility.timezone,
        'all_day',true,'batch_count',daily_batches,'required_worker_count',product.ingredient_prep_crew_size,'estimated_minutes',prep_minutes));
      remaining:=remaining-daily_batches;
      mixing_day:=mixing_day+direction;
    end loop;
    product_days := product_days || jsonb_build_array(jsonb_build_object(
      'product_id',product.id,'product_name',product.name,'workdays',coalesce(requested_days,scheduled_days)));
    if requested_days is not null and scheduled_days<>requested_days then
      valid:=false;
      warnings:=warnings||jsonb_build_array(product.name||' needs '||scheduled_days||
        ' mixing workdays at the available capacity; increase its requested workdays from '||requested_days||'.');
    end if;
    product_finish:=finish_day;
    if requested_start is not null then
      product_finish:=last_mixing_day+greatest(1,facility.packaging_lead_days);
      while extract(isodow from product_finish)>5 loop product_finish:=product_finish+1; end loop;
      finish_day:=greatest(finish_day,product_finish);
    end if;
    events:=events||jsonb_build_array(jsonb_build_object('kind','packaging','product_id',product.id,'product_name',product.name,
      'title',left(product.name||' — Packaging',120),'work_on',product_finish,
      'start_at',product_finish::timestamp at time zone facility.timezone,'end_at',(product_finish+1)::timestamp at time zone facility.timezone,
      'all_day',true,'batch_count',(item->>'batch_count')::integer,'required_worker_count',1,'estimated_minutes',null));
  end loop;
  if finish_day>latest_finish then
    valid:=false;
    warnings:=warnings||jsonb_build_array('The adjusted plan finishes too late. Choose an earlier production start, reduce mixing workdays, or change pickup to preserve the two-day completion buffer.');
  end if;
  if first_day<(now() at time zone facility.timezone)::date then
    valid:=false; warnings:=warnings||jsonb_build_array('This order cannot fit before pickup without starting in the past. Change pickup or plant capacity.');
  end if;
  if exists(select 1 from jsonb_array_elements(public.material_requirements_at(order_row.id,first_day)) requirement
    where (requirement->>'shortage')::numeric>0) then
    warnings:=warnings||jsonb_build_array('Ingredients are short at the proposed prep date. Review material requirements and purchasing before confirming preparation for execution.');
  end if;
  select coalesce(jsonb_agg(value order by value->>'work_on',value->>'kind',value->>'product_id'),'[]') into events from jsonb_array_elements(events);
  result:=jsonb_build_object('order_id',order_row.id,'reference',order_row.reference,'pickup_on',order_row.needed_on,
    'start_on',first_day,'finish_on',finish_day,'timezone',facility.timezone,'can_confirm',valid,'existing_plan',existing,
    'total_batches',total_batches,'events',events,'warnings',warnings,
    'product_days',product_days,'production_start_on',requested_start,'adjustments',jsonb_build_object('production_start_on',requested_start,'product_days',normalized_days));
  return result||jsonb_build_object('fingerprint',md5(result::text));
end $$;

create or replace function public.create_order_production_work(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare proposal jsonb; event jsonb; order_row public.customer_orders%rowtype;
  prior private.order_work_generations%rowtype; work_id uuid; created_ids uuid[]:='{}';
  predecessor record; successor record;
begin
  if auth.uid() is null or not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write')
    or not public.has_permission('inventory.read') or not public.has_permission('workforce.manage') then
    raise exception 'Order production planning permission required'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload-array['order_id','fingerprint','production_start_on','product_days']<>'{}'::jsonb
    or nullif(payload->>'fingerprint','') is null then raise exception 'Review the production proposal before confirming'; end if;
  -- Serialize capacity reservations from this workflow within one facility.
  perform 1 from public.facilities where id=public.current_facility() and organization_id=public.current_org() for update;
  lock table public.workforce_work_queue_items,public.workforce_schedule_events,public.plant_daily_capacity_overrides in share row exclusive mode;
  select * into order_row from public.customer_orders where id=(payload->>'order_id')::uuid
    and organization_id=public.current_org() and facility_id=public.current_facility() for update;
  if order_row.id is null then raise exception 'Order unavailable'; end if;
  select * into prior from private.order_work_generations where order_id=order_row.id;
  if prior.order_id is not null and prior.fingerprint=payload->>'fingerprint' then
    return jsonb_build_object('order_id',prior.order_id,'created',false,'event_count',prior.event_count,'batch_count',prior.batch_count); end if;
  proposal:=public.preview_order_production_work(payload-'fingerprint');
  if proposal->>'fingerprint' is distinct from payload->>'fingerprint' then raise exception 'Production proposal changed; review a new proposal'; end if;
  if not (proposal->>'can_confirm')::boolean then raise exception 'Resolve the proposal warnings before confirming'; end if;
  perform public.save_order_production_plan(jsonb_build_object('id',order_row.id,'revision',0,'start_on',proposal->>'start_on',
    'finish_on',proposal->>'finish_on','status','Draft','note','Created from approved production proposal','shortage_reason',''));
  for event in select value from jsonb_array_elements(proposal->'events') loop
    work_id:=gen_random_uuid(); created_ids:=array_append(created_ids,work_id);
    insert into public.workforce_work_queue_items(id,organization_id,facility_id,work_on,kind,title,
      batch_quota,estimated_minutes,linked_task_type,linked_task_id,required_worker_count,start_at,end_at,all_day,timezone,product_id,customer_id)
    values(work_id,order_row.organization_id,order_row.facility_id,(event->>'work_on')::date,event->>'kind',event->>'title',
      case when event->>'kind'<>'packaging' then (event->>'batch_count')::integer end,(event->>'estimated_minutes')::numeric,
      'production_plan',order_row.id,(event->>'required_worker_count')::integer,(event->>'start_at')::timestamptz,
      (event->>'end_at')::timestamptz,true,proposal->>'timezone',(event->>'product_id')::uuid,order_row.customer_id);
    -- The planner still consumes the schedule projection. Shared identity keeps
    -- generation/deletion and dependency mappings unambiguous during migration.
    insert into public.workforce_schedule_events(id,organization_id,facility_id,start_on,end_on,start_at,end_at,all_day,timezone,
      kind,title,production_plan_id,linked_task_type,linked_task_id,product_id,customer_id,required_worker_count,planned_batch_count)
    values(work_id,order_row.organization_id,order_row.facility_id,(event->>'work_on')::date,(event->>'work_on')::date+1,
      (event->>'start_at')::timestamptz,(event->>'end_at')::timestamptz,true,proposal->>'timezone',event->>'kind',event->>'title',
      order_row.id,'production_plan',order_row.id,(event->>'product_id')::uuid,order_row.customer_id,
      (event->>'required_worker_count')::integer,(event->>'batch_count')::numeric);
  end loop;
  for successor in select * from public.workforce_work_queue_items where id=any(created_ids) loop
    for predecessor in select * from public.workforce_work_queue_items p where p.id=any(created_ids)
      and p.product_id=successor.product_id and (
        (successor.kind='mixing' and p.kind='ingredient_prep'
          and p.work_on=(select max(x.work_on) from public.workforce_work_queue_items x where x.id=any(created_ids)
            and x.product_id=p.product_id and x.kind='ingredient_prep' and x.work_on<=successor.work_on))
        or (successor.kind='packaging' and p.kind='mixing')) loop
      insert into public.work_order_dependencies(organization_id,facility_id,predecessor_id,successor_id)
        values(order_row.organization_id,order_row.facility_id,predecessor.id,successor.id);
      insert into public.workforce_schedule_event_dependencies(organization_id,facility_id,predecessor_id,successor_id)
        values(order_row.organization_id,order_row.facility_id,predecessor.id,successor.id);
    end loop;
  end loop;
  insert into private.order_work_generations(order_id,fingerprint,event_count,batch_count,created_by)
    values(order_row.id,payload->>'fingerprint',cardinality(created_ids),(proposal->>'total_batches')::integer,auth.uid());
  return jsonb_build_object('order_id',order_row.id,'created',true,'event_count',cardinality(created_ids),'batch_count',(proposal->>'total_batches')::integer);
end $$;

revoke all on function public.preview_order_production_work(jsonb),public.create_order_production_work(jsonb) from public,anon,authenticated;
grant execute on function public.preview_order_production_work(jsonb),public.create_order_production_work(jsonb) to authenticated;


notify pgrst, 'reload schema';
commit;
