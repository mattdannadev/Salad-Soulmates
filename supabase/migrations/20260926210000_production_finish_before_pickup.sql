begin;

-- Existing same-day plans keep their dates so operators can revise notes or
-- cancel them. New plans and date changes must finish before pickup.

create or replace function public.guard_order_production_plan() returns trigger
language plpgsql security invoker set search_path='' as $$
declare customer_order public.customer_orders%rowtype; material_status text;
begin
  if not public.has_permission('orders.read') or not public.has_permission('orders.write')
    or not public.has_permission('planning.read') or not public.has_permission('planning.write')
    or not public.has_permission('inventory.read') then raise exception 'Production planning permission required'; end if;
  -- Lock the same parent as order cancellation, before touching production rows.
  select status into material_status from public.material_plans where id=new.id for update;
  select * into customer_order from public.customer_orders where id=new.id;
  if not found or material_status is distinct from 'Active' then raise exception 'Choose an active customer order'; end if;
  if new.finish_on>=customer_order.needed_on then
    if tg_op='INSERT' then raise exception 'Production must finish before the customer pickup date'; end if;
    if new.status='Confirmed'
      or (new.start_on,new.finish_on) is distinct from (old.start_on,old.finish_on)
      or old.finish_on is distinct from customer_order.needed_on then
      raise exception 'Production must finish before the customer pickup date';
    end if;
  end if;
  if new.organization_id is distinct from customer_order.organization_id
    or new.facility_id is distinct from customer_order.facility_id then raise exception 'Invalid production scope'; end if;
  if (select sum((item->>'batch_count')::integer) from jsonb_array_elements(customer_order.items) item)>10000 then
    raise exception 'Production preparation supports at most 10000 batches per order'; end if;
  new.note := trim(new.note);
  new.shortage_reason := trim(new.shortage_reason);
  if tg_op='INSERT' then
    if new.status<>'Draft' or new.revision<>1 or new.created_by is distinct from auth.uid() then
      raise exception 'Save a production draft before confirming'; end if;
  else
    if (new.id,new.organization_id,new.facility_id,new.created_by,new.created_at)
      is distinct from (old.id,old.organization_id,old.facility_id,old.created_by,old.created_at)
      or new.revision<>old.revision+1 then raise exception 'Production plan changed; reload before trying again'; end if;
    if (new.start_on,new.finish_on) is distinct from (old.start_on,old.finish_on)
      and new.status<>'Draft' then raise exception 'Save changed dates as a draft before confirming'; end if;
    if new.status='Confirmed' and old.status<>'Draft' then raise exception 'Only a draft can be confirmed'; end if;
    if new.status='Cancelled' and old.status='Cancelled' then raise exception 'Production plan is already cancelled'; end if;
    if (new.status='Cancelled' or old.status in ('Confirmed','Cancelled')) and length(new.note)<3 then
      raise exception 'Enter a reason for cancelling or revising production'; end if;
  end if;
  if new.status='Confirmed' and exists(
    select 1 from jsonb_array_elements(public.material_requirements_at(new.id,new.start_on)) requirement
    where (requirement->>'shortage')::numeric>0
  ) and length(new.shortage_reason)<3 then raise exception 'Explain how ingredient shortages will be resolved before confirming'; end if;
  return new;
end $$;

commit;
