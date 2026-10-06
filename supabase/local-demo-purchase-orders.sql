-- Local demo data only. Do not run against a linked or shared project.
-- This is one statement so `supabase db query --local --file` executes it atomically.
-- These are quote-pending draft POs: quantities are the exact supplier-pack
-- rounding of current material-plan shortages. They do not adjust on-hand stock.
with actor_context as (
  select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true) as configured
), requested_purchases(id, label, payload) as (
  values
    (
      '10000000-0000-4000-8000-000000000901'::uuid,
      'Dry goods · JFM-PO-77831',
      jsonb_build_object(
        'id', '10000000-0000-4000-8000-000000000901',
        'kind', 'order',
        'material_plan_id', '10000000-0000-4000-8000-000000000622',
        'supplier_id', 'd0f60000-0000-4000-8000-000000000104',
        'expected_on', '2026-10-06',
        'lines', jsonb_build_array(jsonb_build_object(
          'ingredient_id', 'cd150bb9-c879-5898-b756-9a4e60d97efc',
          'supplier_item_id', '023c0854-b6c0-4706-8858-45b1af111725',
          'purchase_units', 23
        ))
      )
    ),
    (
      '10000000-0000-4000-8000-000000000902'::uuid,
      'Sauces & seasonings · JFM-PO-77831',
      jsonb_build_object(
        'id', '10000000-0000-4000-8000-000000000902',
        'kind', 'order',
        'material_plan_id', '10000000-0000-4000-8000-000000000622',
        'supplier_id', 'd0f60000-0000-4000-8000-000000000105',
        'expected_on', '2026-10-07',
        'lines', jsonb_build_array(jsonb_build_object(
          'ingredient_id', 'aa1ffab7-22a8-5402-9d8c-830ab40e29df',
          'supplier_item_id', '09693420-caf6-4f8f-a1c5-c67e462dab41',
          'purchase_units', 28
        ))
      )
    ),
    (
      '10000000-0000-4000-8000-000000000903'::uuid,
      'Dairy ingredients · JDL-PO-10482',
      jsonb_build_object(
        'id', '10000000-0000-4000-8000-000000000903',
        'kind', 'order',
        'material_plan_id', '10000000-0000-4000-8000-000000000621',
        'supplier_id', 'd0f60000-0000-4000-8000-000000000103',
        'expected_on', '2026-10-07',
        'lines', jsonb_build_array(jsonb_build_object(
          'ingredient_id', '83f5cd85-5422-5440-ab7d-bd8a78e88bc2',
          'supplier_item_id', 'd0f60000-0000-4000-8000-000000000114',
          'purchase_units', 47
        ))
      )
    ),
    (
      '10000000-0000-4000-8000-000000000904'::uuid,
      'Acid & citrus · JDL-PO-10482',
      jsonb_build_object(
        'id', '10000000-0000-4000-8000-000000000904',
        'kind', 'order',
        'material_plan_id', '10000000-0000-4000-8000-000000000621',
        'supplier_id', 'd0f60000-0000-4000-8000-000000000102',
        'expected_on', '2026-10-08',
        'lines', jsonb_build_array(jsonb_build_object(
          'ingredient_id', 'c69f54ee-a0ae-50db-bd6e-c0c880ca5ca7',
          'supplier_item_id', 'd0f60000-0000-4000-8000-000000000113',
          'purchase_units', 37
        ))
      )
    ),
    (
      '10000000-0000-4000-8000-000000000905'::uuid,
      'Bulk oils · JDL-PO-10482',
      jsonb_build_object(
        'id', '10000000-0000-4000-8000-000000000905',
        'kind', 'order',
        'material_plan_id', '10000000-0000-4000-8000-000000000621',
        'supplier_id', 'd0f60000-0000-4000-8000-000000000101',
        'expected_on', '2026-10-06',
        'lines', jsonb_build_array(jsonb_build_object(
          'ingredient_id', 'b0aab304-1059-5b12-b916-1a9eeb0ec20b',
          'supplier_item_id', 'd0f60000-0000-4000-8000-000000000111',
          'purchase_units', 13
        ))
      )
    )
), created_purchases as (
  select
    requested.id,
    requested.label,
    case
      when existing.id is not null then existing.id
      when actor_context.configured is not null then public.create_purchase_draft(requested.payload)
    end as purchase_id,
    existing.id is null as created
  from requested_purchases requested
  cross join actor_context
  left join public.purchase_drafts existing on existing.id = requested.id
)
select id, label, purchase_id, created
from created_purchases
order by id;
