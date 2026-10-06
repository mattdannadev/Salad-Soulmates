begin;

-- Preview is deterministic and read-only. Confirmation recomputes the proposal
-- under a facility lock, so a preview cannot silently become a different plan.
alter table public.workforce_schedule_events add column if not exists planned_batch_count numeric(10,2);
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.order_work_generations (
  order_id uuid primary key references public.customer_orders(id),
  fingerprint text not null,
  event_count integer not null,
  batch_count integer not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
revoke all on private.order_work_generations from public, anon, authenticated;

create function public.preview_order_production_work(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  order_row public.customer_orders%rowtype;
  facility public.facilities%rowtype;
  product public.products%rowtype;
  item jsonb;
  events jsonb := '[]';
  warnings jsonb := '["Work is created as unassigned draft work. Review staffing before publication.","Packaging is an all-day planning allowance, not a measured packaging duration. Production completes two calendar days before pickup.","The proposal uses Monday through Friday production days."]';
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
begin
  if auth.uid() is null or not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write')
    or not public.has_permission('inventory.read') or not public.has_permission('workforce.manage') then
    raise exception 'Order production planning permission required';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload - 'order_id' <> '{}'::jsonb
    or nullif(payload->>'order_id','') is null then raise exception 'Choose an order'; end if;
  select * into order_row from public.customer_orders where id=(payload->>'order_id')::uuid
    and organization_id=public.current_org() and facility_id=public.current_facility();
  if order_row.id is null then raise exception 'Order unavailable'; end if;
  select * into facility from public.facilities where id=order_row.facility_id;
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
  first_day := finish_day;
  for item in select value from jsonb_array_elements(order_row.items) order by value->>'product_id' loop
    select * into product from public.products where id=(item->>'product_id')::uuid and organization_id=order_row.organization_id;
    remaining := (item->>'batch_count')::integer;
    total_batches := total_batches + remaining;
    if remaining is null or remaining<1 or total_batches>10000 then raise exception 'Production planning supports 1 to 10000 batches'; end if;
    if product.ingredient_prep_minutes_per_batch is null or product.mixing_minutes_per_batch is null then
      valid:=false;
      warnings:=warnings||jsonb_build_array('Configure prep and mixing labor estimates for '||product.name||' before confirming.');
      continue;
    end if;
    mixing_day:=finish_day-greatest(1,facility.packaging_lead_days);
    while remaining>0 loop
      attempts:=attempts+1;
      if attempts>3660 then raise exception 'The order exceeds the supported planning horizon'; end if;
      if extract(isodow from mixing_day)>5 then mixing_day:=mixing_day-1; continue; end if;
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
      if daily_batches<1 then mixing_day:=mixing_day-1; continue; end if;
      prep_day:=mixing_day-facility.ingredient_prep_lead_days;
      while extract(isodow from prep_day)>5 loop prep_day:=prep_day-1; end loop;
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
      mixing_day:=mixing_day-1;
    end loop;
    events:=events||jsonb_build_array(jsonb_build_object('kind','packaging','product_id',product.id,'product_name',product.name,
      'title',left(product.name||' — Packaging',120),'work_on',finish_day,
      'start_at',finish_day::timestamp at time zone facility.timezone,'end_at',(finish_day+1)::timestamp at time zone facility.timezone,
      'all_day',true,'batch_count',(item->>'batch_count')::integer,'required_worker_count',1,'estimated_minutes',null));
  end loop;
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
    'total_batches',total_batches,'events',events,'warnings',warnings);
  return result||jsonb_build_object('fingerprint',md5(result::text));
end $$;

create function public.create_order_production_work(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare proposal jsonb; event jsonb; order_row public.customer_orders%rowtype;
  prior private.order_work_generations%rowtype; work_id uuid; created_ids uuid[]:='{}';
  predecessor record; successor record;
begin
  if auth.uid() is null or not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write')
    or not public.has_permission('inventory.read') or not public.has_permission('workforce.manage') then
    raise exception 'Order production planning permission required'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload-array['order_id','fingerprint']<>'{}'::jsonb
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
  proposal:=public.preview_order_production_work(jsonb_build_object('order_id',order_row.id));
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

-- Row ownership follows actual foreign keys, plus the scheduler's documented
-- polymorphic links. Catalog traversal prevents a newly added child FK from
-- being silently orphaned. Reference/master data is never traversed upwards.
create function private.order_delete_rows(order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; additions jsonb; relation record; fk record; predicate text;
  previous_count integer := -1; iterations integer:=0;
begin
  select jsonb_build_array(jsonb_build_object('table_name','material_plans','data',to_jsonb(p))) into result
    from public.material_plans p where p.id=order_id and p.organization_id=public.current_org() and p.facility_id=public.current_facility();
  if result is null then raise exception 'Order unavailable'; end if;
  while previous_count<>jsonb_array_length(result) loop
    previous_count:=jsonb_array_length(result); iterations:=iterations+1;
    if iterations>50 then raise exception 'Order dependencies exceed the supported deletion depth'; end if;
    for fk in select c.conrelid,child.relname child_name,parent.relname parent_name,c.conkey,c.confkey
      from pg_catalog.pg_constraint c join pg_catalog.pg_class child on child.oid=c.conrelid
      join pg_catalog.pg_namespace ns on ns.oid=child.relnamespace
      join pg_catalog.pg_class parent on parent.oid=c.confrelid
      where c.contype='f' and ns.nspname='public' and child.relname<>'audit_events'
        and exists(select 1 from jsonb_array_elements(result) r where r->>'table_name'=parent.relname)
      order by child.relname loop
      select string_agg(format('to_jsonb(child)->%L=target->''data''->%L',ca.attname,pa.attname),' and ')
        into predicate from unnest(fk.conkey,fk.confkey) keys(child_key,parent_key)
        join pg_catalog.pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=keys.child_key
        join pg_catalog.pg_constraint c on c.conrelid=fk.conrelid and c.conkey=fk.conkey and c.confkey=fk.confkey and c.contype='f'
        join pg_catalog.pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=keys.parent_key;
      execute format('select coalesce(jsonb_agg(distinct jsonb_build_object(''table_name'',%L,''data'',to_jsonb(child))),''[]''::jsonb)
        from public.%I child where exists(select 1 from jsonb_array_elements($1) target where target->>''table_name''=%L and %s)',
        fk.child_name,fk.child_name,fk.parent_name,predicate) into additions using result;
      result:=result||additions;
    end loop;
    -- Match type as well as UUID: an unrelated UUID in another entity namespace
    -- must never turn into an owned work item.
    for relation in select unnest(array['workforce_work_queue_items','workforce_schedule_events']) name loop
      execute format('select coalesce(jsonb_agg(jsonb_build_object(''table_name'',%L,''data'',to_jsonb(w))),''[]''::jsonb)
        from public.%I w where w.organization_id=public.current_org() and w.facility_id=public.current_facility()
        and exists(select 1 from jsonb_array_elements($1) r where r->''data''->>''id''=w.linked_task_id::text
          and r->>''table_name''=case w.linked_task_type when ''order'' then ''customer_orders'' when ''production_plan'' then ''order_production_plans''
          when ''planned_mixer_batch'' then ''planned_mixer_batches'' when ''planned_spice_preparation'' then ''planned_spice_preparations''
          when ''production_lot'' then ''production_lots'' when ''purchase_draft'' then ''purchase_drafts''
          when ''purchase_order'' then ''purchase_drafts'' when ''packaging_run'' then ''packaging_runs'' end)',relation.name,relation.name)
        into additions using result;
      result:=result||additions;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('table_name','workforce_published_events','data',to_jsonb(p))),'[]') into additions
      from public.workforce_published_events p where p.organization_id=public.current_org() and p.facility_id=public.current_facility()
        and (p.production_plan_id=order_id or exists(select 1 from jsonb_array_elements(result) r
          where r->>'table_name'='workforce_schedule_events' and r->'data'->>'id'=p.event_id::text));
    result:=result||additions;
    select coalesce(jsonb_agg(jsonb_build_object('table_name','inventory_receipts','data',to_jsonb(receipt))),'[]') into additions
      from public.inventory_receipts receipt where exists(select 1 from jsonb_array_elements(result) r where r->>'table_name'='inventory_receipt_lines'
        and r->'data'->>'receipt_id'=receipt.id::text)
        and not exists(select 1 from public.inventory_receipt_lines line where line.receipt_id=receipt.id and not exists(
          select 1 from jsonb_array_elements(result) r where r->>'table_name'='inventory_receipt_lines' and r->'data'->>'id'=line.id::text));
    result:=result||additions;
    -- Keep a shared recall lot/session: its independent identity is not owned by
    -- this order. Exclusive parents and their packaging outputs can be removed.
    select coalesce(jsonb_agg(jsonb_build_object('table_name','finished_recall_lots','data',to_jsonb(l))),'[]') into additions
      from public.finished_recall_lots l where exists(select 1 from jsonb_array_elements(result) r where r->>'table_name'='production_batches'
        and r->'data'->>'finished_recall_lot_id'=l.id::text)
        and not exists(select 1 from public.production_batches b where b.finished_recall_lot_id=l.id and not exists(
          select 1 from jsonb_array_elements(result) r where r->>'table_name'='production_batches' and r->'data'->>'id'=b.id::text));
    result:=result||additions;
    select coalesce(jsonb_agg(jsonb_build_object('table_name','holding_tank_sessions','data',to_jsonb(s))),'[]') into additions
      from public.holding_tank_sessions s where exists(select 1 from jsonb_array_elements(result) r where r->>'table_name'='production_batch_holding_tank_transfers'
        and r->'data'->>'holding_tank_session_id'=s.id::text)
        and not exists(select 1 from public.production_batch_holding_tank_transfers t where t.holding_tank_session_id=s.id and not exists(
          select 1 from jsonb_array_elements(result) r where r->>'table_name'='production_batch_holding_tank_transfers' and r->'data'->>'id'=t.id::text));
    result:=result||additions;
    select jsonb_agg(value order by value->>'table_name',value::text) into result from (select distinct value from jsonb_array_elements(result)) deduplicated;
  end loop;
  return result;
end $$;

create function public.preview_delete_customer_order(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare order_row public.customer_orders%rowtype; rows_json jsonb; counts jsonb;
  warnings jsonb:='["Permanently deletes this order and its owned production, scheduling, material, purchase, receipt and shipment records. This cannot be undone.","Customers, products, recipes, suppliers and audit history are retained."]';
  safe boolean:=true;
begin
  if auth.uid() is null or not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.write') or not public.has_permission('workforce.manage')
    or not public.has_permission('inventory.adjust') then
    raise exception 'Order deletion requires order, planning, workforce and inventory management permission'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload-'order_id'<>'{}'::jsonb then raise exception 'Choose an order'; end if;
  select * into order_row from public.customer_orders where id=(payload->>'order_id')::uuid
    and organization_id=public.current_org() and facility_id=public.current_facility();
  if order_row.id is null then raise exception 'Order unavailable'; end if;
  rows_json:=private.order_delete_rows(order_row.id);
  if exists(select 1 from jsonb_array_elements(rows_json) r where
    (r->'data' ? 'organization_id' and r->'data'->>'organization_id' is distinct from public.current_org()::text)
    or (r->'data' ? 'facility_id' and r->'data'->>'facility_id' is distinct from public.current_facility()::text)) then
    safe:=false; warnings:=warnings||jsonb_build_array('An associated record belongs to another facility. Resolve its ownership before deletion.'); end if;
  -- Removing one revision from a surviving unit's balance history would not
  -- safely restore stock. Refuse this case instead of corrupting inventory.
  if exists(select 1 from jsonb_array_elements(rows_json) r where r->>'table_name'='serialized_unit_events'
      and not exists(select 1 from jsonb_array_elements(rows_json) u where u->>'table_name'='serialized_units'
        and u->'data'->>'id'=r->'data'->>'unit_id')) then
    safe:=false; warnings:=warnings||jsonb_build_array('This order has consumed shared inventory. Its inventory history prevents permanent deletion.'); end if;
  if exists(select 1 from jsonb_array_elements(rows_json) r where r->>'table_name'='batch_worksheet_source_usages'
    and not exists(select 1 from jsonb_array_elements(rows_json) l where l->>'table_name'='batch_worksheet_lines'
      and l->'data'->>'id'=r->'data'->>'worksheet_line_id')) then
    safe:=false; warnings:=warnings||jsonb_build_array('Received stock from this order is used by another order. Shared inventory cannot be deleted.'); end if;
  if exists(select 1 from jsonb_array_elements(rows_json) r where r->>'table_name'='production_batch_preparation_allocations'
    and (not exists(select 1 from jsonb_array_elements(rows_json) b where b->>'table_name'='production_batches' and b->'data'->>'id'=r->'data'->>'production_batch_id')
      or not exists(select 1 from jsonb_array_elements(rows_json) p where p->>'table_name'='preparation_executions' and p->'data'->>'id'=r->'data'->>'preparation_execution_id'))) then
    safe:=false; warnings:=warnings||jsonb_build_array('Production is allocated across orders. Remove the shared allocation before deletion.'); end if;
  if exists(select 1 from jsonb_array_elements(rows_json) r where r->>'table_name'='production_batch_holding_tank_transfers'
    and not exists(select 1 from jsonb_array_elements(rows_json) s where s->>'table_name'='holding_tank_sessions'
      and s->'data'->>'id'=r->'data'->>'holding_tank_session_id')) then
    safe:=false; warnings:=warnings||jsonb_build_array('Production shares a holding tank with another order. Shared traceability cannot be deleted.'); end if;
  select jsonb_agg(jsonb_build_object('table_name',name,'count',amount) order by name) into counts from (
    select r->>'table_name' name,count(*) amount from jsonb_array_elements(rows_json) r group by r->>'table_name') grouped;
  return jsonb_build_object('order_id',order_row.id,'reference',order_row.reference,'fingerprint',md5(rows_json::text),
    'can_delete',safe,'counts',counts,'warnings',warnings);
end $$;

-- A private, transaction-bound capability allows only rows in the reviewed
-- purge to pass immutable identity guards. Callers cannot set or forge it.
create table private.order_purge_capabilities (
  transaction_id bigint not null,
  relation_name text not null,
  row_data jsonb not null
);
create index order_purge_capability_transaction on private.order_purge_capabilities(transaction_id,relation_name);
revoke all on private.order_purge_capabilities from public,anon,authenticated;
create table private.order_deletion_receipts (
  order_id uuid primary key,
  organization_id uuid not null,
  facility_id uuid not null,
  fingerprint text not null,
  confirmation text not null,
  deleted_records integer not null
);
revoke all on private.order_deletion_receipts from public,anon,authenticated;
create function private.order_purge_allowed(relation_name text,row_data jsonb) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from private.order_purge_capabilities c where c.transaction_id=txid_current()
    and c.relation_name=order_purge_allowed.relation_name and c.row_data=order_purge_allowed.row_data)
$$;

-- Preserve each existing guard verbatim, adding just the narrowly authorized
-- deletion branch. No session flags, trigger disabling, or constraint bypass.
do $$ declare function_name text; definition text; begin
  foreach function_name in array array['guard_finished_recall_lot_identity','guard_production_batch_identity',
    'guard_preparation_execution_identity','guard_production_batch_preparation_allocation','guard_holding_tank_genealogy'] loop
    -- Older hosted schemas do not necessarily have every traceability guard.
    -- Preserve and extend the guards that exist; absent guards do not need a
    -- bypass branch and must not prevent the entire reviewed order workflow.
    if to_regprocedure('public.' || function_name || '()') is null then
      continue;
    end if;
    definition:=pg_get_functiondef(('public.'||function_name||'()')::regprocedure);
    definition:=regexp_replace(definition,E'\\mbegin\\M',
      E'begin\n  if tg_op = ''DELETE'' and private.order_purge_allowed(tg_table_name,to_jsonb(old)) then return old; end if;', 'i');
    execute definition;
  end loop;
end $$;

create function public.delete_customer_order(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare preview jsonb; rows_json jsonb; remaining jsonb; target record; deleted_count integer;
  progress integer; affected integer; requested_order uuid:=(payload->>'order_id')::uuid;
  receipt private.order_deletion_receipts%rowtype;
begin
  if auth.uid() is null or not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.write') or not public.has_permission('workforce.manage')
    or not public.has_permission('inventory.adjust') then raise exception 'Order deletion permission required'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload-array['order_id','fingerprint','confirmation']<>'{}'::jsonb then
    raise exception 'Review and confirm order deletion'; end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_order::text,0));
  select * into receipt from private.order_deletion_receipts where order_id=requested_order
    and organization_id=public.current_org() and facility_id=public.current_facility();
  if receipt.order_id is not null and receipt.fingerprint=payload->>'fingerprint' and receipt.confirmation=payload->>'confirmation' then
    return jsonb_build_object('order_id',requested_order,'deleted',true,'deleted_records',receipt.deleted_records); end if;
  -- Table locks serialize all existing writers, including legacy paths that do
  -- not take an order advisory lock. Locks are released by this RPC transaction.
  for target in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname in (
      'material_plans','customer_orders','order_production_plans','planned_mixer_batches','planned_spice_preparations',
      'production_batches','preparation_executions','production_lots','finished_recall_lots','production_batch_preparation_allocations',
      'holding_tank_sessions','production_batch_holding_tank_transfers','packaging_runs','packaging_run_outputs',
      'workforce_schedule_events','workforce_work_queue_items','purchase_drafts','purchase_draft_lines','inventory_receipt_lines','inventory_receipts',
      'workforce_published_events','workforce_work_queue_claims','workforce_schedule_assignments',
      'work_order_dependencies','workforce_schedule_event_dependencies','shipping_drafts','inventory_events',
      'receipt_serializations','batch_worksheet_executions','batch_worksheet_lines','batch_worksheet_usage_corrections',
      'serialized_units','serialized_unit_events','batch_worksheet_source_usages','spice_preparation_consumptions') order by c.relname loop
    execute format('lock table public.%I in share row exclusive mode',target.relname);
  end loop;
  preview:=public.preview_delete_customer_order(jsonb_build_object('order_id',requested_order));
  if preview->>'fingerprint' is distinct from payload->>'fingerprint' then raise exception 'Order records changed; review deletion again'; end if;
  if preview->>'reference' is distinct from payload->>'confirmation' then raise exception 'Confirm the exact order reference'; end if;
  if not (preview->>'can_delete')::boolean then raise exception 'Resolve the shared-record warnings before deleting'; end if;
  rows_json:=private.order_delete_rows(requested_order); remaining:=rows_json; deleted_count:=jsonb_array_length(rows_json);
  insert into private.order_purge_capabilities(transaction_id,relation_name,row_data)
    select txid_current(),r->>'table_name',r->'data' from jsonb_array_elements(rows_json) r;
  delete from private.order_work_generations g where g.order_id=requested_order;
  while jsonb_array_length(remaining)>0 loop
    progress:=0;
    for target in select r->>'table_name' name,jsonb_agg(r->'data') data from jsonb_array_elements(remaining) r group by r->>'table_name' order by 1 loop
      begin
        execute format('delete from public.%I t where to_jsonb(t) in(select value from jsonb_array_elements($1))',target.name) using target.data;
        get diagnostics affected=row_count;
        progress:=progress+1;
        select coalesce(jsonb_agg(r),'[]') into remaining from jsonb_array_elements(remaining) r where r->>'table_name'<>target.name;
      exception when foreign_key_violation then
        -- Children may be listed after parents. Retry the parent after a pass;
        -- every other error propagates and rolls the entire operation back.
        null;
      end;
    end loop;
    if progress=0 then raise exception 'Order has unsupported shared dependencies; no records were deleted'; end if;
  end loop;
  insert into public.audit_events(organization_id,actor_user_id,entity_type,entity_id,event_type,before_data)
    values(public.current_org(),auth.uid(),'customer_orders',requested_order,'PERMANENT_DELETE',preview);
  insert into private.order_deletion_receipts(order_id,organization_id,facility_id,fingerprint,confirmation,deleted_records)
    values(requested_order,public.current_org(),public.current_facility(),payload->>'fingerprint',payload->>'confirmation',deleted_count);
  delete from private.order_purge_capabilities where transaction_id=txid_current();
  return jsonb_build_object('order_id',requested_order,'deleted',true,'deleted_records',deleted_count);
end $$;

revoke all on function private.order_delete_rows(uuid),private.order_purge_allowed(text,jsonb),
  public.preview_delete_customer_order(jsonb),public.delete_customer_order(jsonb) from public,anon,authenticated;
grant execute on function public.preview_delete_customer_order(jsonb),public.delete_customer_order(jsonb) to authenticated;
commit;
