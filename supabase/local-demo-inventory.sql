-- Local demo data reconciliation only. Do not run against the linked/shared project.
-- This is deliberately one statement so `supabase db query` executes it atomically.
with actor_context as (
  select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true) as configured
), active_demand as (
  select ingredient.id, coalesce(sum((requirement.value->>'required')::numeric), 0) as demand
  from public.ingredients ingredient
  left join public.material_plans plan on plan.status = 'Active'
  left join lateral jsonb_array_elements(plan.requirements) requirement
    on (requirement.value->>'ingredient_id')::uuid = ingredient.id
  where ingredient.active
  group by ingredient.id
), supplier_pack as (
  select ingredient.id, coalesce(min(pack.pack_quantity), case ingredient.category
    when 'Dry' then 25::numeric when 'Refrigerated' then 20::numeric else 50::numeric end) as quantity
  from public.ingredients ingredient
  left join public.supplier_items pack on pack.ingredient_id = ingredient.id and pack.active
  where ingredient.active
  group by ingredient.id, ingredient.category
), policy_base as (
  select ingredient.id, ingredient.internal_code, ingredient.default_uom, demand.demand, supplier_pack.quantity,
    case when demand.demand > 0 then ceil(demand.demand * 0.4 / supplier_pack.quantity) * supplier_pack.quantity
      else supplier_pack.quantity end as reorder_point,
    case when demand.demand > 0 then greatest(ceil(demand.demand * 1.2 / supplier_pack.quantity) * supplier_pack.quantity, supplier_pack.quantity * 2)
      else supplier_pack.quantity * 3 end as par_level
  from public.ingredients ingredient
  join active_demand demand on demand.id = ingredient.id
  join supplier_pack on supplier_pack.id = ingredient.id
), demo_inventory_snapshot as (
  select id, default_uom, reorder_point, par_level, greatest(par_level - reorder_point, quantity) as reorder_quantity,
    round(case
      when internal_code in ('soybean-oil', 'brown-mustard', 'garlic', 'yogurt') then reorder_point * 0.75
      when internal_code in ('white-vinegar', 'salt', 'mustard-flour', 'parm-romano-cheese') then reorder_point * 0.95
      when internal_code in ('water', 'sugar', 'honey', 'lemon-juice', 'apple-cider-vinegar', 'black-pepper', 'buttermilk-solids') then par_level * 1.1
      when demand > 0 then par_level * 0.85
      when internal_code in ('anchovy-paste', 'caramel-color', 'soy-sauce-gluten-free', 'worstershire-sauce',
        'potassium-sorbate', 'sodium-benzoate', 'xanthan-gum-8200', 'xanthan-gum-prehydrated', 'white-pepper') then quantity * 1.5
      else quantity * 2
    end, 4) as on_hand
  from policy_base
), updated_ingredients as (
  update public.ingredients ingredient
  set reorder_point = snapshot.reorder_point,
    par_level = snapshot.par_level,
    reorder_quantity = snapshot.reorder_quantity
  from demo_inventory_snapshot snapshot
  cross join actor_context
  where snapshot.id = ingredient.id
  returning ingredient.id
), balances as (
  select ingredient_id, sum(quantity_delta) as on_hand
  from public.inventory_events
  group by ingredient_id
), scope as (
  select organization_id, facility_id
  from public.profiles
  where id = '10000000-0000-4000-8000-000000000001'::uuid
), inserted_adjustments as (
  insert into public.inventory_events(
    organization_id, facility_id, ingredient_id, event_type, quantity_delta, uom,
    reason_note, created_by, request_id, effective_on
  )
  select scope.organization_id, scope.facility_id, snapshot.id, 'Adjustment',
    snapshot.on_hand - coalesce(balances.on_hand, 0), snapshot.default_uom,
    'Demand-and-pack based local demo inventory reset',
    '10000000-0000-4000-8000-000000000001'::uuid, gen_random_uuid(), current_date
  from demo_inventory_snapshot snapshot
  cross join scope
  cross join actor_context
  left join balances on balances.ingredient_id = snapshot.id
  where snapshot.on_hand <> coalesce(balances.on_hand, 0)
  returning ingredient_id
)
select
  (select count(*) from updated_ingredients) as ingredients_updated,
  (select count(*) from inserted_adjustments) as inventory_adjustments_added;
