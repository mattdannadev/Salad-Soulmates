-- Local-only, disposable sample data. `supabase db reset` recreates it from scratch.
-- Never run this file against the linked/shared project.
begin;

create extension if not exists pgcrypto;

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
) values (
  '00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','sample.admin@saladsoulmates.test',
  crypt('LocalSampleOnly!',gen_salt('bf')),now(),
  '{"provider":"email","providers":["email"]}','{"display_name":"Sample Administrator"}',
  now(),now(),'','','',''
) on conflict(id) do nothing;

insert into auth.identities (
  id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at
) values (
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'sample.admin@saladsoulmates.test',
  '{"sub":"10000000-0000-4000-8000-000000000001","email":"sample.admin@saladsoulmates.test"}',
  'email',now(),now(),now()
) on conflict(provider_id,provider) do nothing;

insert into public.profiles(
  id,organization_id,facility_id,display_name,role,preferred_locale,active,access_profile_id,
  first_name,last_name,work_email
)
select '10000000-0000-4000-8000-000000000001',organization.id,facility.id,
  'Sample Administrator','admin','en',true,access_profile.id,'Sample','Administrator',
  'sample.admin@saladsoulmates.test'
from public.organizations organization
join public.facilities facility on facility.organization_id=organization.id and facility.name='Main facility'
join public.access_profiles access_profile on access_profile.organization_id=organization.id
  and access_profile.base_role='admin' and access_profile.is_system
where organization.slug='salad-soulmates'
on conflict(id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

-- One facility-local anchor keeps receipts in the recent past, production
-- current, and customer commitments in the near future on every regeneration.
create temp table sample_dates on commit drop as
select
  local_today - 8 as purchase_one,
  local_today - 7 as receipt_one,
  local_today - 7 as purchase_two,
  local_today - 6 as receipt_two,
  local_today as production_start,
  local_today + 2 as ranch_finish,
  local_today + 4 as italian_finish,
  local_today + 14 as ranch_pickup,
  local_today + 21 as italian_pickup,
  local_today + 365 as dry_expiration,
  local_today + 540 as liquid_expiration
from (
  select (now() at time zone facility.timezone)::date as local_today
  from public.profiles profile
  join public.facilities facility on facility.id=profile.facility_id
  where profile.id=auth.uid()
) clock;

insert into public.ingredients(
 id,name,internal_code,category,default_uom,description,storage_notes,traceability_mode,
 reorder_point,par_level,reorder_quantity
)
values
 ('10000000-0000-4000-8000-000000000101','High-oleic canola oil','RM-OIL-CAN','Liquid','gal','Neutral oil for dressing production.','Ambient; keep sealed and away from heat.','future_required',220,660,440),
 ('10000000-0000-4000-8000-000000000102','Cultured buttermilk ranch blend','RM-RANCH-BLD','Dry','lb','Commercial buttermilk, herb and spice blend.','Cool, dry allergen-controlled storage.','future_required',75,225,150),
 ('10000000-0000-4000-8000-000000000103','Red wine vinegar','RM-VIN-RW','Liquid','gal','5% acidity red wine vinegar for vinaigrette.','Ambient in closed food-grade container.','future_required',40,120,80),
 ('10000000-0000-4000-8000-000000000104','Italian herb and spice blend','RM-ITAL-BLD','Dry','lb','Commercial garlic, onion and Italian herb blend.','Cool, dry storage.','future_required',60,180,120);

insert into public.ingredient_translations(ingredient_id,display_name) values
 ('10000000-0000-4000-8000-000000000101','Aceite de canola alto oleico'),
 ('10000000-0000-4000-8000-000000000102','Mezcla de rancho con suero de leche'),
 ('10000000-0000-4000-8000-000000000103','Vinagre de vino tinto'),
 ('10000000-0000-4000-8000-000000000104','Mezcla italiana de hierbas y especias');
insert into public.allergens(id,name) values
 ('10000000-0000-4000-8000-000000000111','Milk'),
 ('10000000-0000-4000-8000-000000000112','Sulfites');
insert into public.ingredient_allergens(ingredient_id,allergen_id) values
 ('10000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000111'),
 ('10000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000112');

insert into public.suppliers(id,name,contact_name,email,phone,lead_time_days)
values
 ('10000000-0000-4000-8000-000000000201','Heartland Food Oils','Morgan Lee','orders@heartland-oils.test','312-555-0142',7),
 ('10000000-0000-4000-8000-000000000202','Midwest Flavor & Spice','Riley Chen','service@midwest-flavor.test','630-555-0188',10);

insert into public.supplier_items(id,supplier_id,ingredient_id,supplier_sku,purchase_uom,pack_quantity,pack_quantity_uom,is_preferred,notes)
values
 ('10000000-0000-4000-8000-000000000211','10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000101','CAN-HO-55','each',55,'gal',true,'55-gallon food-grade drum'),
 ('10000000-0000-4000-8000-000000000212','10000000-0000-4000-8000-000000000202','10000000-0000-4000-8000-000000000102','RANCH-25','bag',25,'lb',true,'25 lb lined bag'),
 ('10000000-0000-4000-8000-000000000213','10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000103','RWV-5','pail',5,'gal',true,'5-gallon pail'),
 ('10000000-0000-4000-8000-000000000214','10000000-0000-4000-8000-000000000202','10000000-0000-4000-8000-000000000104','ITAL-20','bag',20,'lb',true,'20 lb lined bag');

insert into public.products(id,product_code,name,standard_batch_gallons,bag_size_gallons,bags_per_case,approved_ingredient_statement)
values
 ('10000000-0000-4000-8000-000000000301','SS-RANCH-1G','Creamy Buttermilk Ranch',40,1,4,'Canola oil, cultured buttermilk ranch blend, red wine vinegar and water.'),
 ('10000000-0000-4000-8000-000000000302','SS-ITALIAN-1G','Classic Italian Vinaigrette',40,1,4,'Canola oil, red wine vinegar, Italian herbs and spices, and water.');

insert into public.recipes(id,product_id,name) values
 ('10000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000301','Creamy Buttermilk Ranch – 40 gallon'),
 ('10000000-0000-4000-8000-000000000402','10000000-0000-4000-8000-000000000302','Classic Italian Vinaigrette – 40 gallon');
insert into public.recipe_versions(id,recipe_id,version_number,status,target_yield_gallons,source_metadata) values
 ('10000000-0000-4000-8000-000000000411','10000000-0000-4000-8000-000000000401',1,'Draft',40,'{"sample":true}'),
 ('10000000-0000-4000-8000-000000000412','10000000-0000-4000-8000-000000000402',1,'Draft',40,'{"sample":true}');
insert into public.recipe_sections(id,recipe_version_id,name,sequence) values
 ('10000000-0000-4000-8000-000000000421','10000000-0000-4000-8000-000000000411','Blend',1),
 ('10000000-0000-4000-8000-000000000422','10000000-0000-4000-8000-000000000412','Blend',1);
insert into public.recipe_lines(id,recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom,operator_note)
values
 ('10000000-0000-4000-8000-000000000431','10000000-0000-4000-8000-000000000411','10000000-0000-4000-8000-000000000421','10000000-0000-4000-8000-000000000101','sample-ranch-oil',1,'24 gal',24,'gal','Sample formulation; validate before production use.'),
 ('10000000-0000-4000-8000-000000000432','10000000-0000-4000-8000-000000000411','10000000-0000-4000-8000-000000000421','10000000-0000-4000-8000-000000000102','sample-ranch-blend',2,'8 lb',8,'lb','Sample formulation; validate before production use.'),
 ('10000000-0000-4000-8000-000000000435','10000000-0000-4000-8000-000000000411','10000000-0000-4000-8000-000000000421','10000000-0000-4000-8000-000000000103','sample-ranch-vinegar',3,'4 gal',4,'gal','Add potable process water to final yield. Sample formulation; validate before production use.'),
 ('10000000-0000-4000-8000-000000000433','10000000-0000-4000-8000-000000000412','10000000-0000-4000-8000-000000000422','10000000-0000-4000-8000-000000000101','sample-italian-oil',1,'20 gal',20,'gal','Sample formulation; validate before production use.'),
 ('10000000-0000-4000-8000-000000000434','10000000-0000-4000-8000-000000000412','10000000-0000-4000-8000-000000000422','10000000-0000-4000-8000-000000000103','sample-italian-vinegar',2,'5 gal',5,'gal','Sample formulation; validate before production use.'),
 ('10000000-0000-4000-8000-000000000436','10000000-0000-4000-8000-000000000412','10000000-0000-4000-8000-000000000422','10000000-0000-4000-8000-000000000104','sample-italian-herbs',3,'4 lb',4,'lb','Add potable process water to final yield. Sample formulation; validate before production use.');
insert into public.recipe_qc_rules(id,recipe_version_id,name,min_value,max_value,uom,instructions,source_text,sequence) values
 ('10000000-0000-4000-8000-000000000441','10000000-0000-4000-8000-000000000411','Finished pH',3.8,4.2,'pH','Test a representative finished-batch sample before release.','Local sample-data specification; owner validation required.',1),
 ('10000000-0000-4000-8000-000000000442','10000000-0000-4000-8000-000000000412','Finished pH',3.4,3.8,'pH','Test a representative finished-batch sample before release.','Local sample-data specification; owner validation required.',1);
update public.recipe_versions set status='Released',released_by='10000000-0000-4000-8000-000000000001'
where id in ('10000000-0000-4000-8000-000000000411','10000000-0000-4000-8000-000000000412');
update public.recipes set active_version_id=case id
 when '10000000-0000-4000-8000-000000000401' then '10000000-0000-4000-8000-000000000411'::uuid
 else '10000000-0000-4000-8000-000000000412'::uuid end;

insert into public.inventory_events(id,ingredient_id,event_type,quantity_delta,uom,reason_note,request_id) values
 ('10000000-0000-4000-8000-000000000501','10000000-0000-4000-8000-000000000101','OpeningBalance',825,'gal','Sample opening balance: fifteen sealed 55-gallon drums.','10000000-0000-4000-8000-000000000511'),
 ('10000000-0000-4000-8000-000000000502','10000000-0000-4000-8000-000000000102','OpeningBalance',300,'lb','Sample opening balance: twelve sealed 25-pound bags.','10000000-0000-4000-8000-000000000512'),
 ('10000000-0000-4000-8000-000000000503','10000000-0000-4000-8000-000000000103','OpeningBalance',180,'gal','Sample opening balance: thirty-six sealed 5-gallon pails.','10000000-0000-4000-8000-000000000513'),
 ('10000000-0000-4000-8000-000000000504','10000000-0000-4000-8000-000000000104','OpeningBalance',200,'lb','Sample opening balance: ten sealed 20-pound bags.','10000000-0000-4000-8000-000000000514');

select public.save_customer_master('{"id":"10000000-0000-4000-8000-000000000601","revision":0,"name":"Lakeshore University Dining","contact_name":"Avery Johnson","email":"purchasing@lakeshore-dining.test","phone":"773-555-0114","address":"1200 Campus Drive, Chicago, IL 60612","notes":"Weekly dining-service pickup."}');
select public.save_customer_master('{"id":"10000000-0000-4000-8000-000000000602","revision":0,"name":"Prairie Fresh Markets","contact_name":"Jordan Patel","email":"category@prairie-fresh.test","phone":"847-555-0162","address":"860 Distribution Way, Schaumburg, IL 60173","notes":"Regional grocery distribution customer."}');
select public.save_customer_product_option('{"id":"10000000-0000-4000-8000-000000000611","revision":0,"customer_name":"Lakeshore University Dining","product_id":"10000000-0000-4000-8000-000000000301","label":"4 x 1-gallon foodservice case","packaging_mode":"product_default","unit_name":"case","gallons_per_unit":4,"unit_price":78.00,"currency":"USD","active":true}');
select public.save_customer_product_option('{"id":"10000000-0000-4000-8000-000000000612","revision":0,"customer_name":"Prairie Fresh Markets","product_id":"10000000-0000-4000-8000-000000000302","label":"4 x 1-gallon retail case","packaging_mode":"product_default","unit_name":"case","gallons_per_unit":4,"unit_price":82.00,"currency":"USD","active":true}');
select public.save_customer_order(jsonb_set('{"id":"10000000-0000-4000-8000-000000000621","customer_name":"Lakeshore University Dining","reference":"LUD-PO-10482","products":[{"product_id":"10000000-0000-4000-8000-000000000301","batch_count":2,"customer_product_option_id":"10000000-0000-4000-8000-000000000611"}]}'::jsonb,'{needed_on}',to_jsonb((select ranch_pickup from sample_dates))));
select public.save_customer_order(jsonb_set('{"id":"10000000-0000-4000-8000-000000000622","customer_name":"Prairie Fresh Markets","reference":"PFM-PO-77831","products":[{"product_id":"10000000-0000-4000-8000-000000000302","batch_count":3,"customer_product_option_id":"10000000-0000-4000-8000-000000000612"}]}'::jsonb,'{needed_on}',to_jsonb((select italian_pickup from sample_dates))));

-- Two confirmed replenishment POs, followed by two partial deliveries. The
-- receipt RPC records immutable source-lot evidence and creates physical units.
select public.create_purchase_draft(jsonb_set('{"id":"10000000-0000-4000-8000-000000000631","kind":"standalone","supplier_id":"10000000-0000-4000-8000-000000000201","lines":[{"ingredient_id":"10000000-0000-4000-8000-000000000101","supplier_item_id":"10000000-0000-4000-8000-000000000211","purchase_units":2,"override_reason":""},{"ingredient_id":"10000000-0000-4000-8000-000000000103","supplier_item_id":"10000000-0000-4000-8000-000000000213","purchase_units":12,"override_reason":""}]}'::jsonb,'{expected_on}',to_jsonb((select purchase_one from sample_dates))));
select public.create_purchase_draft(jsonb_set('{"id":"10000000-0000-4000-8000-000000000632","kind":"standalone","supplier_id":"10000000-0000-4000-8000-000000000202","lines":[{"ingredient_id":"10000000-0000-4000-8000-000000000102","supplier_item_id":"10000000-0000-4000-8000-000000000212","purchase_units":4,"override_reason":""},{"ingredient_id":"10000000-0000-4000-8000-000000000104","supplier_item_id":"10000000-0000-4000-8000-000000000214","purchase_units":5,"override_reason":""}]}'::jsonb,'{expected_on}',to_jsonb((select purchase_two from sample_dates))));

select public.receive_purchase_delivery(jsonb_build_object(
  'request_id','10000000-0000-4000-8000-000000000641',
  'supplier_id','10000000-0000-4000-8000-000000000201',
  'received_on',(select receipt_one from sample_dates),'supplier_reference','BOL-HFO-SAMPLE-01',
  'note','Partial delivery for October production.',
  'lines',jsonb_build_array(
    jsonb_build_object('id','10000000-0000-4000-8000-000000000651',
      'purchase_draft_line_id',(select id from public.purchase_draft_lines where purchase_draft_id='10000000-0000-4000-8000-000000000631' and ingredient_id='10000000-0000-4000-8000-000000000101'),
      'quantity',55,'supplier_lot','HFO-CAN-SAMPLE-A','expiration_date',(select liquid_expiration from sample_dates),
      'packages',jsonb_build_array(jsonb_build_object('quantity',55,'supplier_barcode','HFO260921D01'))),
    jsonb_build_object('id','10000000-0000-4000-8000-000000000652',
      'purchase_draft_line_id',(select id from public.purchase_draft_lines where purchase_draft_id='10000000-0000-4000-8000-000000000631' and ingredient_id='10000000-0000-4000-8000-000000000103'),
      'quantity',10,'supplier_lot','HFO-RWV-SAMPLE-B','expiration_date',(select liquid_expiration from sample_dates),
      'packages',jsonb_build_array(
        jsonb_build_object('quantity',5,'supplier_barcode','HFORWVSAMPLEP01'),
        jsonb_build_object('quantity',5,'supplier_barcode','HFORWVSAMPLEP02')))
  )
));
select public.receive_purchase_delivery(jsonb_build_object(
  'request_id','10000000-0000-4000-8000-000000000642',
  'supplier_id','10000000-0000-4000-8000-000000000202',
  'received_on',(select receipt_two from sample_dates),'supplier_reference','BOL-MFS-SAMPLE-02',
  'note','Partial dry-blend delivery for scheduled batches.',
  'lines',jsonb_build_array(
    jsonb_build_object('id','10000000-0000-4000-8000-000000000653',
      'purchase_draft_line_id',(select id from public.purchase_draft_lines where purchase_draft_id='10000000-0000-4000-8000-000000000632' and ingredient_id='10000000-0000-4000-8000-000000000102'),
      'quantity',25,'supplier_lot','MFS-RAN-SAMPLE-A','expiration_date',(select dry_expiration from sample_dates),
      'packages',jsonb_build_array(jsonb_build_object('quantity',25,'supplier_barcode','MFSRAN260930A'))),
    jsonb_build_object('id','10000000-0000-4000-8000-000000000654',
      'purchase_draft_line_id',(select id from public.purchase_draft_lines where purchase_draft_id='10000000-0000-4000-8000-000000000632' and ingredient_id='10000000-0000-4000-8000-000000000104'),
      'quantity',20,'supplier_lot','MFS-ITA-SAMPLE-B','expiration_date',(select dry_expiration from sample_dates),
      'packages',jsonb_build_array(jsonb_build_object('quantity',20,'supplier_barcode','MFSITA260929B')))
  )
));

select public.save_packaging_profile('{"id":"10000000-0000-4000-8000-000000000701","product_id":"10000000-0000-4000-8000-000000000301","expected_version":0,"status":"Approved","bag_size_gallons":1,"bags_per_case":4,"label_width_inches":3,"label_height_inches":5,"display_name":"Creamy Buttermilk Ranch","ingredient_statement":"Canola oil, cultured buttermilk ranch blend, red wine vinegar and water."}');
select public.save_packaging_profile('{"id":"10000000-0000-4000-8000-000000000702","product_id":"10000000-0000-4000-8000-000000000302","expected_version":0,"status":"Approved","bag_size_gallons":1,"bags_per_case":4,"label_width_inches":3,"label_height_inches":5,"display_name":"Classic Italian Vinaigrette","ingredient_statement":"Canola oil, red wine vinegar, Italian herbs and spices, and water."}');

select public.save_order_production_plan(jsonb_build_object('id','10000000-0000-4000-8000-000000000621','revision',0,'start_on',(select production_start from sample_dates),'finish_on',(select ranch_finish from sample_dates),'status','Draft','note','Two ranch batches for campus dining pickup.','shortage_reason',''));
select public.save_order_production_plan(jsonb_build_object('id','10000000-0000-4000-8000-000000000622','revision',0,'start_on',(select production_start from sample_dates),'finish_on',(select italian_finish from sample_dates),'status','Draft','note','Three Italian batches for grocery distribution.','shortage_reason',''));

select public.assign_production_lot(jsonb_build_object('order_id','10000000-0000-4000-8000-000000000621','product_id','10000000-0000-4000-8000-000000000301','assigned_on',(select production_start from sample_dates)));
select public.assign_production_lot(jsonb_build_object('order_id','10000000-0000-4000-8000-000000000622','product_id','10000000-0000-4000-8000-000000000302','assigned_on',(select production_start from sample_dates)));
select public.save_order_production_plan(jsonb_build_object('id','10000000-0000-4000-8000-000000000621','revision',1,'start_on',(select production_start from sample_dates),'finish_on',(select ranch_finish from sample_dates),'status','Confirmed','note','Two ranch batches for campus dining pickup.','shortage_reason',''));
select public.save_order_production_plan(jsonb_build_object('id','10000000-0000-4000-8000-000000000622','revision',1,'start_on',(select production_start from sample_dates),'finish_on',(select italian_finish from sample_dates),'status','Confirmed','note','Three Italian batches for grocery distribution.','shortage_reason',''));

-- Complete one representative mixer batch for each customer order. Remaining
-- planned batches stay ready for testing the worker's not-started state.
select public.open_batch_worksheet((select id from public.planned_mixer_batches where order_id='10000000-0000-4000-8000-000000000621' order by sequence limit 1));
select public.open_batch_worksheet((select id from public.planned_mixer_batches where order_id='10000000-0000-4000-8000-000000000622' order by sequence limit 1));

select public.record_batch_worksheet_usage(jsonb_build_object(
  'id','10000000-0000-4000-8000-000000000901','worksheet_line_id',
  (select line.id from public.batch_worksheet_lines line join public.batch_worksheet_executions execution on execution.id=line.execution_id join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id where batch.order_id='10000000-0000-4000-8000-000000000621' and line.ingredient_id='10000000-0000-4000-8000-000000000101' order by batch.sequence limit 1),
  'serialized_unit_id',(select id from public.serialized_unit_balances where ingredient_id='10000000-0000-4000-8000-000000000101' and availability='Available' and remaining_quantity >= 24 order by created_at,id limit 1),'quantity',24));
select public.record_batch_worksheet_usage(jsonb_build_object(
  'id','10000000-0000-4000-8000-000000000902','worksheet_line_id',
  (select line.id from public.batch_worksheet_lines line join public.batch_worksheet_executions execution on execution.id=line.execution_id join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id where batch.order_id='10000000-0000-4000-8000-000000000621' and line.ingredient_id='10000000-0000-4000-8000-000000000102' order by batch.sequence limit 1),
  'serialized_unit_id',(select id from public.serialized_unit_balances where ingredient_id='10000000-0000-4000-8000-000000000102' and availability='Available' and remaining_quantity >= 8 order by created_at,id limit 1),'quantity',8));
select public.record_batch_worksheet_usage(jsonb_build_object(
  'id','10000000-0000-4000-8000-000000000906','worksheet_line_id',
  (select line.id from public.batch_worksheet_lines line join public.batch_worksheet_executions execution on execution.id=line.execution_id join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id where batch.order_id='10000000-0000-4000-8000-000000000621' and line.ingredient_id='10000000-0000-4000-8000-000000000103' order by batch.sequence limit 1),
  'serialized_unit_id',(select id from public.serialized_unit_balances where ingredient_id='10000000-0000-4000-8000-000000000103' and availability='Available' and remaining_quantity >= 4 order by created_at,id limit 1),'quantity',4));
select public.complete_batch_worksheet((select execution.id from public.batch_worksheet_executions execution join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id where batch.order_id='10000000-0000-4000-8000-000000000621' order by batch.sequence limit 1));

select public.record_batch_worksheet_usage(jsonb_build_object(
  'id','10000000-0000-4000-8000-000000000903','worksheet_line_id',
  (select line.id from public.batch_worksheet_lines line join public.batch_worksheet_executions execution on execution.id=line.execution_id join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id where batch.order_id='10000000-0000-4000-8000-000000000622' and line.ingredient_id='10000000-0000-4000-8000-000000000101' order by batch.sequence limit 1),
  'serialized_unit_id',(select id from public.serialized_unit_balances where ingredient_id='10000000-0000-4000-8000-000000000101' and availability='Available' and remaining_quantity >= 20 order by created_at,id limit 1),'quantity',20));
select public.record_batch_worksheet_usage(jsonb_build_object(
  'id','10000000-0000-4000-8000-000000000904','worksheet_line_id',
  (select line.id from public.batch_worksheet_lines line join public.batch_worksheet_executions execution on execution.id=line.execution_id join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id where batch.order_id='10000000-0000-4000-8000-000000000622' and line.ingredient_id='10000000-0000-4000-8000-000000000103' order by batch.sequence limit 1),
  'serialized_unit_id',(select id from public.serialized_unit_balances where ingredient_id='10000000-0000-4000-8000-000000000103' and availability='Available' and remaining_quantity >= 5 order by created_at,id limit 1),'quantity',5));
select public.record_batch_worksheet_usage(jsonb_build_object(
  'id','10000000-0000-4000-8000-000000000905','worksheet_line_id',
  (select line.id from public.batch_worksheet_lines line join public.batch_worksheet_executions execution on execution.id=line.execution_id join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id where batch.order_id='10000000-0000-4000-8000-000000000622' and line.ingredient_id='10000000-0000-4000-8000-000000000104' order by batch.sequence limit 1),
  'serialized_unit_id',(select id from public.serialized_unit_balances where ingredient_id='10000000-0000-4000-8000-000000000104' and availability='Available' and remaining_quantity >= 4 order by created_at,id limit 1),'quantity',4));
select public.complete_batch_worksheet((select execution.id from public.batch_worksheet_executions execution join public.planned_mixer_batches batch on batch.id=execution.planned_mixer_batch_id where batch.order_id='10000000-0000-4000-8000-000000000622' order by batch.sequence limit 1));

select public.save_shipping_draft(jsonb_set('{"id":"10000000-0000-4000-8000-000000000801","order_id":"10000000-0000-4000-8000-000000000621","method":"Pickup","note":"Customer refrigerated truck at dock 2.","lines":[{"product_id":"10000000-0000-4000-8000-000000000301","quantity":20}]}'::jsonb,'{planned_on}',to_jsonb((select ranch_pickup from sample_dates))));
select public.save_shipping_draft(jsonb_set('{"id":"10000000-0000-4000-8000-000000000802","order_id":"10000000-0000-4000-8000-000000000622","method":"Shipment","note":"Palletize 30 cases; regional LTL delivery.","lines":[{"product_id":"10000000-0000-4000-8000-000000000302","quantity":30}]}'::jsonb,'{planned_on}',to_jsonb((select italian_pickup from sample_dates))));

reset role;
commit;
