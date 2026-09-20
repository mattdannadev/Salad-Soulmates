begin;

-- All panels and generation share this single snapshot calculation. Shared supply is
-- allocated once, cumulatively by production date (pickup date until scheduled).
create function public.demand_coverage() returns jsonb
language sql stable security invoker set search_path='' as $$
  with samples as (
    select p.id, coalesce(o.start_on,p.needed_on) needed_on, r.value
    from public.material_plans p
    left join public.order_production_plans o on o.id=p.id and o.status<>'Cancelled'
    cross join lateral jsonb_array_elements(public.material_requirements(p.id)) r
    where p.status='Active' and public.has_permission('orders.read')
      and public.has_permission('planning.read') and public.has_permission('inventory.read')
      and public.has_permission('master_data.read') and public.has_permission('products.read')
  ), points as (
    select value->>'ingredient_id' ingredient_id, min(value->>'ingredient_name') name,
      min(value->>'uom') uom, needed_on, min(id::text) plan_id,
      sum((value->>'required')::numeric) required,
      min((value->>'on_hand')::numeric) usable,
      min((value->>'confirmed_inbound')::numeric) inbound
    from samples group by value->>'ingredient_id',needed_on
  ), cumulative as (
    select *, sum(required) over(partition by ingredient_id order by needed_on) demand_by_date,
      sum(required) over(partition by ingredient_id) demand from points
  ), gaps as (
    select *, greatest(0,demand_by_date-usable-inbound) shortage from cumulative
  ), ranked as (
    select *, row_number() over(partition by ingredient_id order by shortage desc,needed_on desc) priority,
      min(needed_on) filter(where shortage>0) over(partition by ingredient_id) first_shortage
    from gaps
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'ingredientId',ingredient_id,'name',name,'uom',uom,'demand',demand,
    'usable',usable,'inbound',inbound,'shortage',shortage,
    'neededOn',coalesce(first_shortage,needed_on),'planId',plan_id,
    'demandByDate',demand_by_date,'supplyDate',needed_on)
    order by (shortage>0) desc,coalesce(first_shortage,needed_on),name),'[]'::jsonb)
  from ranked where priority=1;
$$;

-- Immutable per-user request receipts make a lost response safe to retry even
-- after a generated draft is subsequently confirmed or cancelled.
create table public.demand_purchase_requests (
  id uuid primary key,
  organization_id uuid not null default public.current_org(),
  facility_id uuid not null default public.current_facility(),
  created_by uuid not null default auth.uid() references auth.users,
  result jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(organization_id,facility_id) references public.facilities(organization_id,id)
);
alter table public.demand_purchase_requests enable row level security;
revoke all on public.demand_purchase_requests from public,anon,authenticated;
grant select,insert on public.demand_purchase_requests to authenticated;
create policy request_read on public.demand_purchase_requests for select to authenticated using
  (organization_id=public.current_org() and facility_id=public.current_facility()
   and created_by=auth.uid() and public.has_permission('planning.write'));
create policy request_insert on public.demand_purchase_requests for insert to authenticated with check
  (organization_id=public.current_org() and facility_id=public.current_facility()
   and created_by=auth.uid() and public.has_permission('planning.write'));

create function public.generate_demand_purchases(request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved jsonb; line jsonb; pack public.supplier_items%rowtype;
  eligible jsonb := '[]'; skipped jsonb := '[]'; created jsonb := '[]';
  candidates integer; preferred integer; reason text; group_row record; draft_id uuid;
begin
  if request_id is null then raise exception 'Request ID required'; end if;
  if not (public.has_permission('planning.write') and public.has_permission('planning.read')
    and public.has_permission('orders.read') and public.has_permission('inventory.read')
    and public.has_permission('master_data.read') and public.has_permission('products.read')) then
    raise exception 'Purchasing permissions required';
  end if;
  -- Serializes bulk generation with every ordinary draft insert/status change.
  -- It is intentionally brief for this small facility; no supplier network calls.
  lock table public.purchase_drafts in share row exclusive mode;
  select result into saved from public.demand_purchase_requests where id=request_id;
  if found then return saved; end if;
  for line in select value from jsonb_array_elements(public.demand_coverage())
    where (value->>'shortage')::numeric>0 loop
    reason := null;
    if exists(select 1 from public.purchase_draft_lines l join public.purchase_drafts d
      on d.id=l.purchase_draft_id where d.status='Draft'
      and l.ingredient_id=(line->>'ingredientId')::uuid) then
      reason := 'Review existing draft';
    else
      select count(*),count(*) filter(where i.is_preferred) into candidates,preferred
      from public.supplier_items i join public.suppliers s on s.id=i.supplier_id and s.active
      where i.ingredient_id=(line->>'ingredientId')::uuid and i.active;
      if not (preferred=1 or (preferred=0 and candidates=1)) then
        reason := 'Choose a preferred supplier pack';
      else
        select i.* into pack from public.supplier_items i
        join public.suppliers s on s.id=i.supplier_id and s.active
        where i.ingredient_id=(line->>'ingredientId')::uuid and i.active
          and (preferred=0 or i.is_preferred);
        if pack.pack_quantity_uom<>line->>'uom' or pack.pack_quantity<=0 then
          reason := 'Validate the supplier pack unit';
        elsif ceil((line->>'shortage')::numeric/pack.pack_quantity)>1000000
          or ceil((line->>'shortage')::numeric/pack.pack_quantity)*pack.pack_quantity>1000000000 then
          reason := 'Purchase quantity exceeds supported limit';
        elsif exists(select 1 from public.purchase_drafts where status='Draft'
          and material_plan_id=(line->>'planId')::uuid and supplier_id=pack.supplier_id) then
          reason := 'Review existing supplier draft for this order';
        else
          eligible := eligible || jsonb_build_array(line || jsonb_build_object(
            'supplierId',pack.supplier_id,'supplierItemId',pack.id,
            'units',ceil((line->>'shortage')::numeric/pack.pack_quantity)));
        end if;
      end if;
    end if;
    if reason is not null then
      skipped := skipped || jsonb_build_array(jsonb_build_object('ingredient',line->>'name','reason',reason));
    end if;
  end loop;
  for group_row in select value->>'planId' plan_id,value->>'supplierId' supplier_id,
    min(value->>'neededOn') needed_on,
    jsonb_agg(jsonb_build_object('ingredient_id',value->>'ingredientId',
      'supplier_item_id',value->>'supplierItemId','purchase_units',(value->>'units')::integer,
      'override_reason','Cumulative dated demand across active orders; rounded to whole supplier packs')) lines
    from jsonb_array_elements(eligible) group by value->>'planId',value->>'supplierId'
    order by value->>'planId',value->>'supplierId' loop
    draft_id := public.create_purchase_draft(jsonb_build_object('id',gen_random_uuid(),
      'material_plan_id',group_row.plan_id,'supplier_id',group_row.supplier_id,
      'expected_on',group_row.needed_on,'lines',group_row.lines));
    created := created || to_jsonb(draft_id);
  end loop;
  saved := jsonb_build_object('created',created,'skipped',skipped);
  insert into public.demand_purchase_requests(id,result) values(request_id,saved);
  return saved;
end $$;
revoke all on function public.demand_coverage(),public.generate_demand_purchases(uuid) from public,anon;
grant execute on function public.demand_coverage(),public.generate_demand_purchases(uuid) to authenticated;
commit;
