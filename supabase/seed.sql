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

-- Six local-only plant employees cover both orders' concurrent prep, mixing,
-- packaging, and pickup work independently.
-- They deliberately use .test addresses, which cannot receive real email.
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
) values
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000002',
   'authenticated','authenticated','jordan.rivera@saladsoulmates.test',
   crypt('LocalSampleOnly!',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}','{"display_name":"Jordan Rivera"}',
   now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000003',
   'authenticated','authenticated','taylor.morgan@saladsoulmates.test',
   crypt('LocalSampleOnly!',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}','{"display_name":"Taylor Morgan"}',
   now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000004',
   'authenticated','authenticated','avery.chen@saladsoulmates.test',
   crypt('LocalSampleOnly!',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}','{"display_name":"Avery Chen"}',
   now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000005',
   'authenticated','authenticated','morgan.lee@saladsoulmates.test',
   crypt('LocalSampleOnly!',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}','{"display_name":"Morgan Lee"}',
   now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000006',
   'authenticated','authenticated','cameron.brooks@saladsoulmates.test',
   crypt('LocalSampleOnly!',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}','{"display_name":"Cameron Brooks"}',
   now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000007',
   'authenticated','authenticated','riley.harper@saladsoulmates.test',
   crypt('LocalSampleOnly!',gen_salt('bf')),now(),
   '{"provider":"email","providers":["email"]}','{"display_name":"Riley Harper"}',
   now(),now(),'','','','')
on conflict(id) do nothing;

insert into auth.identities (
  id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at
) values
  ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
   'jordan.rivera@saladsoulmates.test',
   '{"sub":"10000000-0000-4000-8000-000000000002","email":"jordan.rivera@saladsoulmates.test"}',
   'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',
   'taylor.morgan@saladsoulmates.test',
   '{"sub":"10000000-0000-4000-8000-000000000003","email":"taylor.morgan@saladsoulmates.test"}',
   'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
   'avery.chen@saladsoulmates.test',
   '{"sub":"10000000-0000-4000-8000-000000000004","email":"avery.chen@saladsoulmates.test"}',
   'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005',
   'morgan.lee@saladsoulmates.test',
   '{"sub":"10000000-0000-4000-8000-000000000005","email":"morgan.lee@saladsoulmates.test"}',
   'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006',
   'cameron.brooks@saladsoulmates.test',
   '{"sub":"10000000-0000-4000-8000-000000000006","email":"cameron.brooks@saladsoulmates.test"}',
   'email',now(),now(),now()),
  ('10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007',
   'riley.harper@saladsoulmates.test',
   '{"sub":"10000000-0000-4000-8000-000000000007","email":"riley.harper@saladsoulmates.test"}',
   'email',now(),now(),now())
on conflict(provider_id,provider) do nothing;

insert into public.profiles(
  id,organization_id,facility_id,display_name,role,preferred_locale,active,access_profile_id,
  first_name,last_name,work_email
)
select employee.id, organization.id, facility.id, employee.display_name, 'worker', 'en', true,
  access_profile.id, employee.first_name, employee.last_name, employee.email
from (values
  ('10000000-0000-4000-8000-000000000002'::uuid, 'Jordan Rivera', 'Jordan', 'Rivera', 'jordan.rivera@saladsoulmates.test'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'Taylor Morgan', 'Taylor', 'Morgan', 'taylor.morgan@saladsoulmates.test'),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'Avery Chen', 'Avery', 'Chen', 'avery.chen@saladsoulmates.test'),
  ('10000000-0000-4000-8000-000000000005'::uuid, 'Morgan Lee', 'Morgan', 'Lee', 'morgan.lee@saladsoulmates.test'),
  ('10000000-0000-4000-8000-000000000006'::uuid, 'Cameron Brooks', 'Cameron', 'Brooks', 'cameron.brooks@saladsoulmates.test'),
  ('10000000-0000-4000-8000-000000000007'::uuid, 'Riley Harper', 'Riley', 'Harper', 'riley.harper@saladsoulmates.test')
) as employee(id,display_name,first_name,last_name,email)
join public.organizations organization on organization.slug='salad-soulmates'
join public.facilities facility on facility.organization_id=organization.id and facility.name='Main facility'
join public.access_profiles access_profile on access_profile.organization_id=organization.id
  and access_profile.base_role='worker' and access_profile.is_system
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
  working_days[1] as production_start,
  working_days[7] as ranch_finish,
  working_days[7] as italian_finish,
  working_days[8] as ranch_pickup,
  working_days[8] as italian_pickup,
  local_today + 365 as dry_expiration,
  local_today + 540 as liquid_expiration
from (
  select (now() at time zone facility.timezone)::date as local_today
  from public.profiles profile
  join public.facilities facility on facility.id=profile.facility_id
  where profile.id=auth.uid()
) clock
cross join lateral (
  select array_agg(day_on::date order by day_on) as working_days
  from generate_series(clock.local_today::timestamp, (clock.local_today + 14)::timestamp, interval '1 day') day_on
  where extract(isodow from day_on) between 1 and 5
) work_calendar;

-- The local demo deliberately reuses the production master-data snapshot. Its
-- orders, production plans, and work queue below are still local-only samples.
-- Production master-data snapshot for the disposable local demo.
-- Source: linked production project, captured 2026-10-02. No production transaction data is included.
-- Keep this file local-only; the seed uses the local organization and demo administrator.

insert into public.allergens (id,name)
select id,name from jsonb_to_recordset($production_master$[{"id":"0da54890-3672-588c-b852-706049c6574d","name":"Egg"},{"id":"23803f26-ecab-5f67-b31d-9ae8156aea2f","name":"Fish"},{"id":"40f0a478-dab8-5a3a-a3db-59b6a2054ad2","name":"Milk"},{"id":"fa7ac20a-2ac8-5e73-948f-38d7196d4c87","name":"Soy"}]$production_master$::jsonb)
  as source(id uuid,name text);

insert into public.ingredients (id,name,internal_code,category,default_uom,description,storage_notes,traceability_mode,active,reorder_point,par_level,reorder_quantity)
select id,name,internal_code,category,default_uom,description,storage_notes,traceability_mode,active,reorder_point,par_level,reorder_quantity from jsonb_to_recordset($production_master$[{"id":"2989e9ad-fb99-50c0-8c52-f3e193f51352","name":"Anchovy Paste","internal_code":"anchovy-paste","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"94c02d07-a4ca-5995-a832-1c7b7a2e6182","name":"Apple Cider Vinegar","internal_code":"apple-cider-vinegar","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"836a6200-7cde-5eb7-8e36-5dc7c36aea9f","name":"Balsamic Vinegar","internal_code":"balsamic-vinegar","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"faab9faa-b890-579f-8837-f2ca0330ece2","name":"Black Pepper","internal_code":"black-pepper","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"275a8b25-e590-5bb6-9815-fc50664f9ecd","name":"Bleu Cheese Crumbles","internal_code":"bleu-cheese-crumbles","category":"Refrigerated","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: inventory_reference_only. No recipe is created for this inventory-only item.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"62e893ae-7d4f-5cbe-bb6b-2a261929cd7c","name":"Borden's LF Buttermilk","internal_code":"borden-s-lf-buttermilk","category":"Refrigerated","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"aa1ffab7-22a8-5402-9d8c-830ab40e29df","name":"Brown Mustard","internal_code":"brown-mustard","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"e1ee6a49-b305-5848-ac15-465bcf081031","name":"Brown Sugar","internal_code":"brown-sugar","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"457c443c-b7be-5f7d-887f-3a726eda55af","name":"Buttermilk Solids","internal_code":"buttermilk-solids","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":"60.0000","par_level":"100.0000","reorder_quantity":"80.0000"},{"id":"10da5098-749a-5af2-9b8a-cd546a722b23","name":"Caramel Color","internal_code":"caramel-color","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"d80800d5-384f-53be-a6e6-6f441153bf64","name":"Dried Egg","internal_code":"dried-egg","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe. Kept separate from Dried Eggs, the distinct printed Caesar label; no same-SKU equivalence has been assumed.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"af51d4b5-fa24-54d7-bb3f-f06a5efc02fc","name":"Dried Eggs","internal_code":"dried-eggs","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe. Kept separate from Dried Egg, the distinct printed Honey Mustard label; no same-SKU equivalence has been assumed.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"8519e7d4-833c-5828-ad4e-95c6465e17fd","name":"Garlic","internal_code":"garlic","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"da585f78-5e67-5298-8dc3-38bd61476dc2","name":"Hidden Valley Ranch Mix","internal_code":"hidden-valley-ranch-mix","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"064c4e84-016d-531e-bceb-758c0f1d97b8","name":"Honey","internal_code":"honey","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"fd00eeef-730c-56cf-a8af-861a14627365","name":"Kraft Mayonnaise--HD","internal_code":"kraft-mayonnaise-hd","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"63abea6c-8b56-5f57-9c4a-dacd4bfb260e","name":"Lemon Juice","internal_code":"lemon-juice","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":"500.0000","par_level":"700.0000","reorder_quantity":"600.0000"},{"id":"ad49548a-e8b6-50a2-a4d1-d2de35442b28","name":"Maltodextrin","internal_code":"maltodextrin","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"cd150bb9-c879-5898-b756-9a4e60d97efc","name":"Mustard Flour","internal_code":"mustard-flour","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"993cef4f-a8cc-5111-bfc0-02e4301f191e","name":"Onion Powder","internal_code":"onion-powder","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"0c917c16-63c6-5bec-a8b2-214569cbb539","name":"OP Ranch Mix","internal_code":"op-ranch-mix","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"b404ea2e-1cca-59b2-8af4-677e8b78234e","name":"Oregano","internal_code":"oregano","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"83f5cd85-5422-5440-ab7d-bd8a78e88bc2","name":"Parm/Romano Cheese","internal_code":"parm-romano-cheese","category":"Refrigerated","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":"450.0000","par_level":"600.0000","reorder_quantity":"500.0000"},{"id":"8d7c38b2-f8af-5004-b3c9-3cc25d195700","name":"Paroma Cheese","internal_code":"paroma-cheese","category":"Refrigerated","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"d213b524-ca17-5a01-85f4-a10004a6c224","name":"Parsley","internal_code":"parsley","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"1f0f6c52-8df8-5c75-8e12-44952d0a8b2a","name":"Potassium Sorbate","internal_code":"potassium-sorbate","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"ed113870-296b-5b41-9b07-b857b990b3c0","name":"Red Cayenne Pepper","internal_code":"red-cayenne-pepper","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"768c56e6-c37f-5227-9a65-41f219738a00","name":"Red Pepper","internal_code":"red-pepper","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"04656fa5-0ab4-5b4b-81c3-29f9e0a41879","name":"Salt","internal_code":"salt","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"aedcb19b-e242-5b68-95cd-2ab60a2bb2b2","name":"Sodium Benzoate","internal_code":"sodium-benzoate","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"e69ba501-abab-5045-86ee-e6a64b24a1bc","name":"Soy Sauce (gluten free)","internal_code":"soy-sauce-gluten-free","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"b0aab304-1059-5b12-b916-1a9eeb0ec20b","name":"Soybean Oil","internal_code":"soybean-oil","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":"2500.0000","par_level":"3000.0000","reorder_quantity":"2000.0000"},{"id":"681ae7df-bdf1-522b-9f97-f52db6546eed","name":"Sugar","internal_code":"sugar","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"001ff33b-15ac-53e7-bf3e-117b7f11c672","name":"Sweet Basil","internal_code":"sweet-basil","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"805b843f-473a-57e2-a2b3-7f46d23bfce8","name":"Vegetable Oil","internal_code":"vegetable-oil","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"16192f9e-de41-5ea5-b8ae-280d5f128462","name":"Water","internal_code":"water","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"4be03f79-aeb8-5c48-8d80-27feab940fea","name":"West Creek Mayonnaise--HD","internal_code":"west-creek-mayonnaise-hd","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"f791398e-5a8d-5177-96ad-b7c0b7dbceb7","name":"White Pepper","internal_code":"white-pepper","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"f2046814-1f63-5cfb-af13-9894ae8d6ed2","name":"White Sugar","internal_code":"white-sugar","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: inventory_reference_only. No recipe is created for this inventory-only item. Not silently merged with Sugar from the recipe sheets.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"c69f54ee-a0ae-50db-bd6e-c0c880ca5ca7","name":"White Vinegar","internal_code":"white-vinegar","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":"700.0000","par_level":"900.0000","reorder_quantity":"700.0000"},{"id":"bd3b9f10-18e3-539d-b7e5-4be0640cd85f","name":"Worstershire Sauce","internal_code":"worstershire-sauce","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe. Batch worksheet spelling retained. Inventory worksheet uses WORCESTERSHIRE SAUCE.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"46bdc7d5-fe62-5626-8cc9-04625f3c94d6","name":"Xanthan Gum (8200)","internal_code":"xanthan-gum-8200","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"c1471f51-c612-50fb-9611-aba1b9b8fb9f","name":"Xanthan Gum (prehydrated)","internal_code":"xanthan-gum-prehydrated","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"be2b1c15-625a-556c-9473-5a500fde1bfb","name":"Xanthan Gum (TIC)","internal_code":"xanthan-gum-tic","category":"Dry","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"5c43efc8-0a0b-55c7-aba6-c86fa302dd0b","name":"Yellow Mustard","internal_code":"yellow-mustard","category":"Liquid","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null},{"id":"8e883e06-cc52-5bcd-ab93-24a4b5be8b76","name":"Yogurt","internal_code":"yogurt","category":"Refrigerated","default_uom":"lb","description":"Approved worksheet import. Calculation unit lb follows the printed LBS. column; category is an initial application classification, not a source storage instruction. Source scope: recipe.","storage_notes":"","traceability_mode":"future_required","active":true,"reorder_point":null,"par_level":null,"reorder_quantity":null}]$production_master$::jsonb)
  as source(id uuid,name text,internal_code text,category text,default_uom text,description text,storage_notes text,traceability_mode text,active boolean,reorder_point numeric,par_level numeric,reorder_quantity numeric);

insert into public.suppliers (id,name,contact_name,email,phone,lead_time_days,active)
select id,name,contact_name,email,phone,lead_time_days,active from jsonb_to_recordset($production_master$[{"id":"d0f60000-0000-4000-8000-000000000102","name":"Demo Acid & Citrus","contact_name":"Cameron Citrus","email":"orders@demo-acid-citrus.test","phone":"817-555-0202","lead_time_days":4,"active":true},{"id":"d0f60000-0000-4000-8000-000000000101","name":"Demo Bulk Oils","contact_name":"Avery Oil","email":"orders@demo-bulk-oils.test","phone":"817-555-0201","lead_time_days":5,"active":true},{"id":"d0f60000-0000-4000-8000-000000000103","name":"Demo Dairy Ingredients","contact_name":"Riley Dairy","email":"orders@demo-dairy.test","phone":"817-555-0203","lead_time_days":7,"active":true},{"id":"e548e8e3-4d15-422e-b164-1c586ee60d0a","name":"Jamie's Spices","contact_name":"Jamie","email":"jamie@jamies.com","phone":"","lead_time_days":0,"active":true},{"id":"ef51be7c-6cfe-4df4-8834-73a6ae377771","name":"Seth Supplier Spices","contact_name":"Seth","email":"sdanna@saladsoulmates.com","phone":"23423","lead_time_days":0,"active":true}]$production_master$::jsonb)
  as source(id uuid,name text,contact_name text,email text,phone text,lead_time_days integer,active boolean);

insert into public.products (id,product_code,name,standard_batch_gallons,bag_size_gallons,bags_per_case,approved_ingredient_statement,active,production_lot_identifier,ingredient_prep_minutes_per_batch,ingredient_prep_crew_size,mixing_minutes_per_batch,mixing_crew_size)
select id,product_code,name,standard_batch_gallons,bag_size_gallons,bags_per_case,approved_ingredient_statement,active,production_lot_identifier,ingredient_prep_minutes_per_batch,ingredient_prep_crew_size,mixing_minutes_per_batch,mixing_crew_size from jsonb_to_recordset($production_master$[{"id":"f8e15e9b-ac65-4dcd-b3af-54f2e1dba3ae","product_code":"balsamic-vinaigrette","name":"Balsamic Vinaigrette","standard_batch_gallons":"40","bag_size_gallons":"1","bags_per_case":4,"approved_ingredient_statement":null,"active":true,"production_lot_identifier":"BALSAMICVINAIGRETTE","ingredient_prep_minutes_per_batch":null,"ingredient_prep_crew_size":null,"mixing_minutes_per_batch":null,"mixing_crew_size":null},{"id":"7073e6e5-4471-4782-8309-987ca99f5eaa","product_code":"creamy-caesar","name":"Creamy Caesar","standard_batch_gallons":"40","bag_size_gallons":"1","bags_per_case":4,"approved_ingredient_statement":null,"active":true,"production_lot_identifier":"CREAMYCAESAR","ingredient_prep_minutes_per_batch":null,"ingredient_prep_crew_size":null,"mixing_minutes_per_batch":null,"mixing_crew_size":null},{"id":"b5a9f5d5-19a5-5ca7-a41f-aed5c92961ac","product_code":"gumbys-ranch","name":"Gumby's Ranch Dressing","standard_batch_gallons":"40","bag_size_gallons":"1","bags_per_case":4,"approved_ingredient_statement":null,"active":true,"production_lot_identifier":"GUMBYSRANCH","ingredient_prep_minutes_per_batch":null,"ingredient_prep_crew_size":null,"mixing_minutes_per_batch":null,"mixing_crew_size":null},{"id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","product_code":"honey-mustard","name":"Honey Mustard","standard_batch_gallons":"40","bag_size_gallons":"1","bags_per_case":4,"approved_ingredient_statement":null,"active":true,"production_lot_identifier":"HONEYMUSTARD","ingredient_prep_minutes_per_batch":"8.00","ingredient_prep_crew_size":1,"mixing_minutes_per_batch":"40.00","mixing_crew_size":2},{"id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","product_code":"leos-italian","name":"Leo's Select Italian","standard_batch_gallons":"40","bag_size_gallons":"1","bags_per_case":4,"approved_ingredient_statement":null,"active":true,"production_lot_identifier":"LEOSITALIAN","ingredient_prep_minutes_per_batch":"8.00","ingredient_prep_crew_size":1,"mixing_minutes_per_batch":"23.00","mixing_crew_size":2},{"id":"e669369b-24df-4ae4-a930-f63cefbcdd07","product_code":"wnm-ranch","name":"WNM Ranch Dressing","standard_batch_gallons":"40","bag_size_gallons":"1","bags_per_case":4,"approved_ingredient_statement":null,"active":true,"production_lot_identifier":"WNMRANCH","ingredient_prep_minutes_per_batch":null,"ingredient_prep_crew_size":null,"mixing_minutes_per_batch":null,"mixing_crew_size":null}]$production_master$::jsonb)
  as source(id uuid,product_code text,name text,standard_batch_gallons numeric,bag_size_gallons numeric,bags_per_case integer,approved_ingredient_statement text,active boolean,production_lot_identifier text,ingredient_prep_minutes_per_batch numeric,ingredient_prep_crew_size integer,mixing_minutes_per_batch numeric,mixing_crew_size integer);

insert into public.customers (id,name,contact_name,email,phone,address,notes,revision)
select id,name,contact_name,email,phone,address,notes,revision from jsonb_to_recordset($production_master$[{"id":"b1f3fab4-fdd4-459a-b07e-f9bdea21e268","name":"Jason's Deli","contact_name":"","email":"","phone":"","address":"","notes":"","revision":0},{"id":"d0f60000-0000-4000-8000-000000000001","name":"Jason's Family Market","contact_name":"Jason Miller","email":"orders@jasons-family-market.test","phone":"817-555-0198","address":"2700 Demo Parkway, Fort Worth, TX 76102","notes":"Demo customer for two-week production planning.","revision":0}]$production_master$::jsonb)
  as source(id uuid,name text,contact_name text,email text,phone text,address text,notes text,revision integer);

-- Recipe shells precede their released versions; the full source rows later in
-- this file are idempotent so the production active-version mapping can follow.
insert into public.recipes (id,product_id,name) values
  ('6be36d26-a6c1-428d-904a-07188d763b93','f8e15e9b-ac65-4dcd-b3af-54f2e1dba3ae','Balsamic Vinaigrette Recipe'),
  ('cc4b0e43-3a5f-4322-a4b8-dc5beab4dd65','7073e6e5-4471-4782-8309-987ca99f5eaa','Creamy Caesar Recipe'),
  ('cf4aaefa-e029-5ad7-91c5-21bd26cf3075','b5a9f5d5-19a5-5ca7-a41f-aed5c92961ac','Gumby''s Ranch Dressing Recipe'),
  ('7ffe8eea-bba3-4505-a541-fc2941e26d46','abbdd137-b52c-44ed-b677-a4a2e87a5598','Honey Mustard Recipe'),
  ('e614f2c2-56a5-41a8-8461-7afbe09c1b1c','498601a9-c0d3-496d-b485-36fbc2d64a2e','Leo''s Select Italian Recipe'),
  ('f8be9698-c8f0-4b48-8471-8e668d365fd6','e669369b-24df-4ae4-a930-f63cefbcdd07','WNM Ranch Dressing Recipe');

insert into public.recipe_versions (id,recipe_id,version_number,status,target_yield_gallons,source_metadata,released_at)
select id,recipe_id,version_number,'Draft'::text,target_yield_gallons,source_metadata,null::timestamptz from jsonb_to_recordset($production_master$[{"id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_id":"6be36d26-a6c1-428d-904a-07188d763b93","version_number":1,"status":"Released","target_yield_gallons":"40","source_metadata":{"business_approval":{"basis":"User approved worksheet formulas and brand names","confirmed_at":"2026-09-19T04:38:55Z"},"source_document_key":"source-07","source_revision_text":"UPDATED 2/2024"},"released_at":"2026-09-19 06:02:57.578123+00"},{"id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_id":"7ffe8eea-bba3-4505-a541-fc2941e26d46","version_number":1,"status":"Released","target_yield_gallons":"40","source_metadata":{"business_approval":{"basis":"User approved worksheet formulas and brand names","confirmed_at":"2026-09-19T04:38:55Z"},"source_document_key":"source-04","source_revision_text":"2/16/2023"},"released_at":"2026-09-19 06:02:19.179045+00"},{"id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_id":"cc4b0e43-3a5f-4322-a4b8-dc5beab4dd65","version_number":1,"status":"Released","target_yield_gallons":"40","source_metadata":{"business_approval":{"basis":"User approved worksheet formulas and brand names","confirmed_at":"2026-09-19T04:38:55Z"},"source_document_key":"source-08","source_revision_text":"updated 2/2024"},"released_at":"2026-09-19 06:02:59.651132+00"},{"id":"c1435753-2236-5cfd-be4f-5826f768c270","recipe_id":"cf4aaefa-e029-5ad7-91c5-21bd26cf3075","version_number":1,"status":"Released","target_yield_gallons":"40","source_metadata":{"yield_basis":"Previously confirmed standard mixer batch; not a filled yield value on the photographed worksheet.","section_policy":"Only table/block boundaries are interpreted as sections. Blank spacer rows and allergen callout rows are not ingredient additions. Blocks have neutral ordinal names because the source gives no stage names.","source_document":{"key":"source-03","file":"source_documents/03_Batch_Worksheet_Log_Gumbys_Ranch_Dressing.jpeg","type":"batch_worksheet","sha256":"80e0b0543239c9c25f08be1a9e5cff6650502a0a63055be361344997ef25b132","original_attachment":"image2.jpeg","source_email_subject":"Salad soulmates screenshots","source_email_message_id":"1a0b5395030bc55c","source_email_received_at":"2026-09-18T10:53:15-05:00"},"business_approval":{"basis":"User instruction: assume the source recipes are validated and preserve specific names.","confirmed_at":"2026-09-19T04:38:55Z"},"source_document_key":"source-03","normalization_policy":"Printed LBS. column supplies calculation quantity in lb, without recomputing cup/volume-to-mass equivalents. All display measurements and original pounds text are retained. One cropped LBS. cell uses an explicitly labeled conversion from a complete 5 oz. measurement.","source_revision_text":"updated 2/2024"},"released_at":"2026-09-19 06:00:59.749254+00"},{"id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_id":"e614f2c2-56a5-41a8-8461-7afbe09c1b1c","version_number":1,"status":"Released","target_yield_gallons":"40","source_metadata":{"business_approval":{"basis":"User approved worksheet formulas and brand names","confirmed_at":"2026-09-19T04:38:55Z"},"source_document_key":"source-06","source_revision_text":"updated 2/2024"},"released_at":"2026-09-19 06:02:55.167189+00"},{"id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","recipe_id":"f8be9698-c8f0-4b48-8471-8e668d365fd6","version_number":1,"status":"Released","target_yield_gallons":"40","source_metadata":{"business_approval":{"basis":"User approved worksheet formulas and brand names","confirmed_at":"2026-09-19T04:38:55Z"},"source_document_key":"source-05","source_revision_text":"updated 2/2024"},"released_at":"2026-09-19 06:02:52.98948+00"}]$production_master$::jsonb)
  as source(id uuid,recipe_id uuid,version_number integer,status text,target_yield_gallons numeric,source_metadata jsonb,released_at timestamptz);

insert into public.recipe_sections (id,recipe_version_id,name,sequence,source_heading)
select id,recipe_version_id,name,sequence,source_heading from jsonb_to_recordset($production_master$[{"id":"d0a244ab-120f-49f9-a8a3-48da02ec24de","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","name":"Worksheet block 1","sequence":1,"source_heading":null},{"id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","name":"Worksheet block 2","sequence":2,"source_heading":null},{"id":"89e14613-671e-496c-bc44-454b5c316b9b","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","name":"Worksheet block 1","sequence":1,"source_heading":null},{"id":"5d85cde3-5a70-41c9-9f50-8e79452f5511","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","name":"Worksheet block 2","sequence":2,"source_heading":null},{"id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","name":"Worksheet block 1","sequence":1,"source_heading":null},{"id":"8d32c2d0-41a3-46bc-89dd-ba9cf061de65","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","name":"Worksheet block 2","sequence":2,"source_heading":null},{"id":"f1b7fdf7-17c5-5605-89c1-c00bd7e1e3e7","recipe_version_id":"c1435753-2236-5cfd-be4f-5826f768c270","name":"Worksheet block 1","sequence":1,"source_heading":null},{"id":"db6333d5-5a59-4f9e-b3e3-5a2713cb2074","recipe_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","name":"Worksheet block 1","sequence":1,"source_heading":null},{"id":"accabe06-94d2-4885-8860-2f360539bd42","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","name":"Worksheet block 1","sequence":1,"source_heading":null},{"id":"78f915e5-286d-418b-b1ff-d33a6fe8d818","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","name":"Worksheet block 2","sequence":2,"source_heading":null}]$production_master$::jsonb)
  as source(id uuid,recipe_version_id uuid,name text,sequence integer,source_heading text);

insert into public.recipe_lines (id,recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom,pounds_equivalent,operator_note,source_metadata)
select id,recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom,pounds_equivalent,operator_note,source_metadata from jsonb_to_recordset($production_master$[{"id":"961b19b5-d111-4c53-a5cf-0f9761d7363e","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"d0a244ab-120f-49f9-a8a3-48da02ec24de","ingredient_id":"b0aab304-1059-5b12-b916-1a9eeb0ec20b","source_line_key":"leos-italian-s1-l01","sequence":1,"display_measurement":"35 lbs. cont. 2 +","normalized_quantity":"90","normalized_uom":"lb","pounds_equivalent":"90","operator_note":null,"source_metadata":{}},{"id":"18203f96-e461-4a95-9985-a6597f2a11cd","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"d0a244ab-120f-49f9-a8a3-48da02ec24de","ingredient_id":"c69f54ee-a0ae-50db-bd6e-c0c880ca5ca7","source_line_key":"leos-italian-s1-l02","sequence":2,"display_measurement":"3 GALLONS","normalized_quantity":"24","normalized_uom":"lb","pounds_equivalent":"24","operator_note":null,"source_metadata":{}},{"id":"55d9be89-4d81-43f2-98a6-4c976b626ed9","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"d0a244ab-120f-49f9-a8a3-48da02ec24de","ingredient_id":"63abea6c-8b56-5f57-9c4a-dacd4bfb260e","source_line_key":"leos-italian-s1-l03","sequence":3,"display_measurement":"2 GALLONS","normalized_quantity":"16.66","normalized_uom":"lb","pounds_equivalent":"16.66","operator_note":null,"source_metadata":{}},{"id":"3fb3e3ab-f60c-48f5-a0af-8395240d7004","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"d0a244ab-120f-49f9-a8a3-48da02ec24de","ingredient_id":"16192f9e-de41-5ea5-b8ae-280d5f128462","source_line_key":"leos-italian-s1-l04","sequence":4,"display_measurement":"19.5 GALLONS","normalized_quantity":"162.4","normalized_uom":"lb","pounds_equivalent":"162.4","operator_note":null,"source_metadata":{}},{"id":"feeaf38b-1496-441c-9486-2162a285d6ea","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"8519e7d4-833c-5828-ad4e-95c6465e17fd","source_line_key":"leos-italian-s2-l01","sequence":5,"display_measurement":"10 LBS., 12 OZ.","normalized_quantity":"10.75","normalized_uom":"lb","pounds_equivalent":"10.75","operator_note":null,"source_metadata":{}},{"id":"90d4eefe-9899-4242-8dd1-ab493f8e8444","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"993cef4f-a8cc-5111-bfc0-02e4301f191e","source_line_key":"leos-italian-s2-l02","sequence":6,"display_measurement":"1.4 OZ.","normalized_quantity":"0.09","normalized_uom":"lb","pounds_equivalent":"0.09","operator_note":null,"source_metadata":{}},{"id":"62c65c08-0a21-4464-8f05-4669f685c303","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"04656fa5-0ab4-5b4b-81c3-29f9e0a41879","source_line_key":"leos-italian-s2-l03","sequence":7,"display_measurement":"7 cups","normalized_quantity":"5.3","normalized_uom":"lb","pounds_equivalent":"5.3","operator_note":null,"source_metadata":{}},{"id":"32df2680-0994-4a9e-8902-26288dee6e93","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"768c56e6-c37f-5227-9a65-41f219738a00","source_line_key":"leos-italian-s2-l04","sequence":8,"display_measurement":"9.12 OZ.","normalized_quantity":"0.57","normalized_uom":"lb","pounds_equivalent":"0.57","operator_note":null,"source_metadata":{}},{"id":"111bc8a8-0498-416d-bfb9-b34b1ea06f0d","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"faab9faa-b890-579f-8837-f2ca0330ece2","source_line_key":"leos-italian-s2-l05","sequence":9,"display_measurement":"6 CUPS---24 OZ.","normalized_quantity":"1.5","normalized_uom":"lb","pounds_equivalent":"1.5","operator_note":null,"source_metadata":{}},{"id":"fab210b4-0673-4fa4-a200-4225b1098fd8","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"be2b1c15-625a-556c-9473-5a500fde1bfb","source_line_key":"leos-italian-s2-l06","sequence":10,"display_measurement":"3 CUPS---10.5 OZ.","normalized_quantity":"0.656","normalized_uom":"lb","pounds_equivalent":"0.656","operator_note":null,"source_metadata":{}},{"id":"9e55c422-83d6-4ce4-83e8-d45b628e87d3","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"457c443c-b7be-5f7d-887f-3a726eda55af","source_line_key":"leos-italian-s2-l07","sequence":11,"display_measurement":"6 CUPS---28 OZ.","normalized_quantity":"1.75","normalized_uom":"lb","pounds_equivalent":"1.75","operator_note":null,"source_metadata":{}},{"id":"7b4f169d-3a57-48a4-b4dd-8d738bff7517","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"83f5cd85-5422-5440-ab7d-bd8a78e88bc2","source_line_key":"leos-italian-s2-l08","sequence":12,"display_measurement":"15 LBS.---3 BAGS","normalized_quantity":"15","normalized_uom":"lb","pounds_equivalent":"15","operator_note":null,"source_metadata":{}},{"id":"c8a3b785-0a8a-42da-ac70-0f5832398614","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"d213b524-ca17-5a01-85f4-a10004a6c224","source_line_key":"leos-italian-s2-l09","sequence":13,"display_measurement":"1 GALLON---8 OZ.","normalized_quantity":"0.5","normalized_uom":"lb","pounds_equivalent":"0.5","operator_note":null,"source_metadata":{}},{"id":"141d8b48-fe7f-4fc4-b9fb-fdb2135cd752","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"001ff33b-15ac-53e7-bf3e-117b7f11c672","source_line_key":"leos-italian-s2-l10","sequence":14,"display_measurement":"1 CUP---1.5 OZ.","normalized_quantity":"0.09","normalized_uom":"lb","pounds_equivalent":"0.09","operator_note":null,"source_metadata":{}},{"id":"ccb669ca-fa14-46e4-829a-6ebaf5c55c2b","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","recipe_section_id":"2a1e6763-14b5-4bfe-b5f1-1f9d7b31213f","ingredient_id":"b404ea2e-1cca-59b2-8af4-677e8b78234e","source_line_key":"leos-italian-s2-l11","sequence":15,"display_measurement":"1/3 CUP---.4 OZ.","normalized_quantity":"0.025","normalized_uom":"lb","pounds_equivalent":"0.025","operator_note":null,"source_metadata":{}},{"id":"c63e18e6-c6bb-4f77-91d7-b63dc7239567","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"89e14613-671e-496c-bc44-454b5c316b9b","ingredient_id":"8519e7d4-833c-5828-ad4e-95c6465e17fd","source_line_key":"balsamic-vinaigrette-s1-l01","sequence":1,"display_measurement":"1 CAN - 4 LBS. 4 OZ.","normalized_quantity":"4.25","normalized_uom":"lb","pounds_equivalent":"4.25","operator_note":null,"source_metadata":{}},{"id":"68ad8b25-49f5-4e49-b742-4a1b9e14d949","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"89e14613-671e-496c-bc44-454b5c316b9b","ingredient_id":"be2b1c15-625a-556c-9473-5a500fde1bfb","source_line_key":"balsamic-vinaigrette-s1-l02","sequence":2,"display_measurement":"3 CUPS - 10.5 OZ.","normalized_quantity":"0.66","normalized_uom":"lb","pounds_equivalent":"0.66","operator_note":null,"source_metadata":{}},{"id":"fa03b298-e983-475f-9745-9bcc1373e63e","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"89e14613-671e-496c-bc44-454b5c316b9b","ingredient_id":"f791398e-5a8d-5177-96ad-b7c0b7dbceb7","source_line_key":"balsamic-vinaigrette-s1-l03","sequence":3,"display_measurement":"2 CUPS - 10.8 OZ.","normalized_quantity":"0.68","normalized_uom":"lb","pounds_equivalent":"0.68","operator_note":null,"source_metadata":{}},{"id":"70985ebd-f6ea-4cff-8a36-74241bb21f76","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"89e14613-671e-496c-bc44-454b5c316b9b","ingredient_id":"768c56e6-c37f-5227-9a65-41f219738a00","source_line_key":"balsamic-vinaigrette-s1-l04","sequence":4,"display_measurement":"1/2 CUP - 2.2 OZ.","normalized_quantity":"0.14","normalized_uom":"lb","pounds_equivalent":"0.14","operator_note":null,"source_metadata":{}},{"id":"acb97f8b-bc39-4d03-9df4-9aad8cf2926d","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"89e14613-671e-496c-bc44-454b5c316b9b","ingredient_id":"993cef4f-a8cc-5111-bfc0-02e4301f191e","source_line_key":"balsamic-vinaigrette-s1-l05","sequence":5,"display_measurement":"1/4 CUP - 1.2 OZ.","normalized_quantity":"0.09","normalized_uom":"lb","pounds_equivalent":"0.09","operator_note":null,"source_metadata":{}},{"id":"27f5dbd0-6532-43fc-9240-d7e4617122d8","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"89e14613-671e-496c-bc44-454b5c316b9b","ingredient_id":"836a6200-7cde-5eb7-8e36-5dc7c36aea9f","source_line_key":"balsamic-vinaigrette-s1-l06","sequence":6,"display_measurement":"1 GALLON","normalized_quantity":"9.3","normalized_uom":"lb","pounds_equivalent":"9.3","operator_note":null,"source_metadata":{}},{"id":"8b3eea6c-fe16-4602-bb7d-c746c1abb708","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"89e14613-671e-496c-bc44-454b5c316b9b","ingredient_id":"e69ba501-abab-5045-86ee-e6a64b24a1bc","source_line_key":"balsamic-vinaigrette-s1-l07","sequence":7,"display_measurement":"125.7 OZ.","normalized_quantity":"7.85","normalized_uom":"lb","pounds_equivalent":"7.85","operator_note":null,"source_metadata":{}},{"id":"6b9fbfee-6c45-4109-9145-65df54e38ee9","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"89e14613-671e-496c-bc44-454b5c316b9b","ingredient_id":"e1ee6a49-b305-5848-ac15-465bcf081031","source_line_key":"balsamic-vinaigrette-s1-l08","sequence":8,"display_measurement":"16 LBS.","normalized_quantity":"16","normalized_uom":"lb","pounds_equivalent":"16","operator_note":null,"source_metadata":{}},{"id":"29edd7a6-3bc2-4b56-9f72-1da63ed6c2eb","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"5d85cde3-5a70-41c9-9f50-8e79452f5511","ingredient_id":"805b843f-473a-57e2-a2b3-7f46d23bfce8","source_line_key":"balsamic-vinaigrette-s2-l01","sequence":9,"display_measurement":"60 lbs.","normalized_quantity":"60","normalized_uom":"lb","pounds_equivalent":"60","operator_note":null,"source_metadata":{}},{"id":"2df50116-a3e5-47cd-9217-0b9c4ad9558c","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"5d85cde3-5a70-41c9-9f50-8e79452f5511","ingredient_id":"836a6200-7cde-5eb7-8e36-5dc7c36aea9f","source_line_key":"balsamic-vinaigrette-s2-l02","sequence":10,"display_measurement":"5.28 GAL./20 LTRS.+.50\n5.78 gls.","normalized_quantity":"53.87","normalized_uom":"lb","pounds_equivalent":"53.87","operator_note":null,"source_metadata":{}},{"id":"c2ffe626-d326-48bf-8c05-8dc0d4e4c443","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"5d85cde3-5a70-41c9-9f50-8e79452f5511","ingredient_id":"04656fa5-0ab4-5b4b-81c3-29f9e0a41879","source_line_key":"balsamic-vinaigrette-s2-l03","sequence":11,"display_measurement":"7 CUPS--71.75 OZ.","normalized_quantity":"4.48","normalized_uom":"lb","pounds_equivalent":"4.48","operator_note":null,"source_metadata":{}},{"id":"10493be2-18ce-4bf0-8e2e-7a3e7e9d13e4","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","recipe_section_id":"5d85cde3-5a70-41c9-9f50-8e79452f5511","ingredient_id":"16192f9e-de41-5ea5-b8ae-280d5f128462","source_line_key":"balsamic-vinaigrette-s2-l04","sequence":12,"display_measurement":"21.5 GALLONS","normalized_quantity":"179.1","normalized_uom":"lb","pounds_equivalent":"179.1","operator_note":null,"source_metadata":{}},{"id":"e1827599-e49e-42d5-aedb-b98a74334cef","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"8519e7d4-833c-5828-ad4e-95c6465e17fd","source_line_key":"creamy-caesar-s1-l01","sequence":1,"display_measurement":"10.5 LBS.","normalized_quantity":"10.5","normalized_uom":"lb","pounds_equivalent":"10.5","operator_note":null,"source_metadata":{}},{"id":"cf391271-0dd4-4d96-9175-0b0e091d42fd","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"04656fa5-0ab4-5b4b-81c3-29f9e0a41879","source_line_key":"creamy-caesar-s1-l02","sequence":2,"display_measurement":"7 CUPS--71.75 OZ.","normalized_quantity":"4.97","normalized_uom":"lb","pounds_equivalent":"4.97","operator_note":null,"source_metadata":{}},{"id":"7e752f76-dce8-4a9c-838b-ff731be1554a","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"faab9faa-b890-579f-8837-f2ca0330ece2","source_line_key":"creamy-caesar-s1-l03","sequence":3,"display_measurement":"3 CUPS--11.7 OZ.","normalized_quantity":"0.73","normalized_uom":"lb","pounds_equivalent":"0.73","operator_note":null,"source_metadata":{}},{"id":"d866a977-4cfa-484a-a289-476be23a5696","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"f791398e-5a8d-5177-96ad-b7c0b7dbceb7","source_line_key":"creamy-caesar-s1-l04","sequence":4,"display_measurement":"2 CUPS--11.1 OZ.","normalized_quantity":"0.7","normalized_uom":"lb","pounds_equivalent":"0.7","operator_note":null,"source_metadata":{}},{"id":"7b59aeba-bb5e-48c7-bfe7-e337fd8c3f8d","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"993cef4f-a8cc-5111-bfc0-02e4301f191e","source_line_key":"creamy-caesar-s1-l05","sequence":5,"display_measurement":"1/4 CUP--1.4 OZ.","normalized_quantity":"0.09","normalized_uom":"lb","pounds_equivalent":"0.09","operator_note":null,"source_metadata":{}},{"id":"9c4b63df-293f-4d30-b6c7-15b59dd6cff7","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"681ae7df-bdf1-522b-9f97-f52db6546eed","source_line_key":"creamy-caesar-s1-l06","sequence":6,"display_measurement":"5 CUPS--33.5 OZ.","normalized_quantity":"2.1","normalized_uom":"lb","pounds_equivalent":"2.1","operator_note":null,"source_metadata":{}},{"id":"3843d80a-b94d-406e-90a6-decd95d5786e","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"c1471f51-c612-50fb-9611-aba1b9b8fb9f","source_line_key":"creamy-caesar-s1-l07","sequence":7,"display_measurement":"15.2 OZ.","normalized_quantity":"0.95","normalized_uom":"lb","pounds_equivalent":"0.95","operator_note":null,"source_metadata":{}},{"id":"98626b22-8e0f-428f-9d09-1ca91ede6ee1","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"ad49548a-e8b6-50a2-a4d1-d2de35442b28","source_line_key":"creamy-caesar-s1-l08","sequence":8,"display_measurement":"25.45 OZ.","normalized_quantity":"1.59","normalized_uom":"lb","pounds_equivalent":"1.59","operator_note":null,"source_metadata":{}},{"id":"ae95582c-54a4-420f-84e3-fb86877e3de7","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"457c443c-b7be-5f7d-887f-3a726eda55af","source_line_key":"creamy-caesar-s1-l09","sequence":9,"display_measurement":"5 CUPS--23.7 OZ.","normalized_quantity":"1.49","normalized_uom":"lb","pounds_equivalent":"1.49","operator_note":null,"source_metadata":{}},{"id":"25082347-2195-481c-acce-01e9c49f1b0f","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"af51d4b5-fa24-54d7-bb3f-f06a5efc02fc","source_line_key":"creamy-caesar-s1-l10","sequence":10,"display_measurement":"8 CUPS--26.6 OZ.","normalized_quantity":"1.67","normalized_uom":"lb","pounds_equivalent":"1.67","operator_note":null,"source_metadata":{}},{"id":"4340ff1d-3f14-45f3-999b-48fc24096bef","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"8d7c38b2-f8af-5004-b3c9-3cc25d195700","source_line_key":"creamy-caesar-s1-l11","sequence":11,"display_measurement":"30 LBS.","normalized_quantity":"30","normalized_uom":"lb","pounds_equivalent":"30","operator_note":null,"source_metadata":{}},{"id":"5a17bee0-a1c1-47b4-95f7-a0860ebecb8e","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"001ff33b-15ac-53e7-bf3e-117b7f11c672","source_line_key":"creamy-caesar-s1-l12","sequence":12,"display_measurement":"2 CUPS--2.9 OZ.","normalized_quantity":"0.18","normalized_uom":"lb","pounds_equivalent":"0.18","operator_note":null,"source_metadata":{}},{"id":"b7215e40-dd61-417f-9d88-9383d49c48ec","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"b404ea2e-1cca-59b2-8af4-677e8b78234e","source_line_key":"creamy-caesar-s1-l13","sequence":13,"display_measurement":"1/2 CUP--1.15 OZ.","normalized_quantity":"0.06","normalized_uom":"lb","pounds_equivalent":"0.06","operator_note":null,"source_metadata":{}},{"id":"39db7a37-bd1c-4f66-97c5-6c09476bbb0c","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"2989e9ad-fb99-50c0-8c52-f3e193f51352","source_line_key":"creamy-caesar-s1-l14","sequence":14,"display_measurement":"4 LBS.","normalized_quantity":"4","normalized_uom":"lb","pounds_equivalent":"4","operator_note":null,"source_metadata":{}},{"id":"f50b372c-cd36-454e-999a-c40a89088811","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"b2561f68-1304-4f06-9f51-d0a1fbd4106b","ingredient_id":"bd3b9f10-18e3-539d-b7e5-4be0640cd85f","source_line_key":"creamy-caesar-s1-l15","sequence":15,"display_measurement":"8.75 CUPS","normalized_quantity":"4.75","normalized_uom":"lb","pounds_equivalent":"4.75","operator_note":null,"source_metadata":{}},{"id":"433e2966-2688-4b21-87ce-7a045073ed31","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"8d32c2d0-41a3-46bc-89dd-ba9cf061de65","ingredient_id":"b0aab304-1059-5b12-b916-1a9eeb0ec20b","source_line_key":"creamy-caesar-s2-l01","sequence":16,"display_measurement":"105 LBS.","normalized_quantity":"105","normalized_uom":"lb","pounds_equivalent":"105","operator_note":null,"source_metadata":{}},{"id":"60cbc886-6092-419e-bd11-1d2cb4cee214","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"8d32c2d0-41a3-46bc-89dd-ba9cf061de65","ingredient_id":"c69f54ee-a0ae-50db-bd6e-c0c880ca5ca7","source_line_key":"creamy-caesar-s2-l02","sequence":17,"display_measurement":"2 GALLONS","normalized_quantity":"16","normalized_uom":"lb","pounds_equivalent":"16","operator_note":null,"source_metadata":{}},{"id":"34565b6c-8790-463d-a3cb-a643445a89fc","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"8d32c2d0-41a3-46bc-89dd-ba9cf061de65","ingredient_id":"63abea6c-8b56-5f57-9c4a-dacd4bfb260e","source_line_key":"creamy-caesar-s2-l03","sequence":18,"display_measurement":"2 GALLONS","normalized_quantity":"16.66","normalized_uom":"lb","pounds_equivalent":"16.66","operator_note":null,"source_metadata":{}},{"id":"d8a120d3-6b49-42b8-9776-c96582582bcc","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"8d32c2d0-41a3-46bc-89dd-ba9cf061de65","ingredient_id":"16192f9e-de41-5ea5-b8ae-280d5f128462","source_line_key":"creamy-caesar-s2-l04","sequence":19,"display_measurement":"14.5 GALLONS","normalized_quantity":"118","normalized_uom":"lb","pounds_equivalent":"118","operator_note":null,"source_metadata":{}},{"id":"7a32eaa3-1c8b-4870-9a80-133c6d931f73","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"8d32c2d0-41a3-46bc-89dd-ba9cf061de65","ingredient_id":"5c43efc8-0a0b-55c7-aba6-c86fa302dd0b","source_line_key":"creamy-caesar-s2-l05","sequence":20,"display_measurement":"2 CUPS","normalized_quantity":"1","normalized_uom":"lb","pounds_equivalent":"1","operator_note":null,"source_metadata":{}},{"id":"c5a8973b-d56e-49e8-a0e5-978b3ea7a0e9","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","recipe_section_id":"8d32c2d0-41a3-46bc-89dd-ba9cf061de65","ingredient_id":"10da5098-749a-5af2-9b8a-cd546a722b23","source_line_key":"creamy-caesar-s2-l06","sequence":21,"display_measurement":"7.56 OZ.","normalized_quantity":"0.472","normalized_uom":"lb","pounds_equivalent":"0.472","operator_note":null,"source_metadata":{}},{"id":"ffb0a9e3-7ba8-5f9a-8033-e0c5a12769f8","recipe_version_id":"c1435753-2236-5cfd-be4f-5826f768c270","recipe_section_id":"f1b7fdf7-17c5-5605-89c1-c00bd7e1e3e7","ingredient_id":"62e893ae-7d4f-5cbe-bb6b-2a261929cd7c","source_line_key":"gumbys-ranch-s1-l01","sequence":1,"display_measurement":"20 gls.","normalized_quantity":"160","normalized_uom":"lb","pounds_equivalent":"160","operator_note":null,"source_metadata":{"notes":[],"section_sequence":1,"source_reference":"source-03: block 1, ingredient row 1","source_pounds_text":"160","normalization_basis":"printed_lbs_column","source_ingredient_text":"BORDEN'S LF BUTTERMILK","source_allergen_callouts":["Milk"]}},{"id":"e1109b95-4c94-53a5-9c41-d6628b17e84e","recipe_version_id":"c1435753-2236-5cfd-be4f-5826f768c270","recipe_section_id":"f1b7fdf7-17c5-5605-89c1-c00bd7e1e3e7","ingredient_id":"4be03f79-aeb8-5c48-8d80-27feab940fea","source_line_key":"gumbys-ranch-s1-l02","sequence":2,"display_measurement":"5 cs. + 10 lbs.","normalized_quantity":"160","normalized_uom":"lb","pounds_equivalent":"160","operator_note":null,"source_metadata":{"notes":[],"section_sequence":2,"source_reference":"source-03: block 1, ingredient row 2","source_pounds_text":"160","normalization_basis":"printed_lbs_column","source_ingredient_text":"WEST CREEK MAYONNAISE--HD","source_allergen_callouts":["Egg","Soy"]}},{"id":"cd73b9b4-6287-5bdb-ae66-178c4267ae64","recipe_version_id":"c1435753-2236-5cfd-be4f-5826f768c270","recipe_section_id":"f1b7fdf7-17c5-5605-89c1-c00bd7e1e3e7","ingredient_id":"da585f78-5e67-5298-8dc3-38bd61476dc2","source_line_key":"gumbys-ranch-s1-l03","sequence":3,"display_measurement":"30 pkgs.   (3.2oz)","normalized_quantity":"6","normalized_uom":"lb","pounds_equivalent":"6","operator_note":null,"source_metadata":{"notes":[],"section_sequence":3,"source_reference":"source-03: block 1, ingredient row 3","source_pounds_text":"6","normalization_basis":"printed_lbs_column","source_ingredient_text":"HIDDEN VALLEY RANCH MIX","source_allergen_callouts":[]}},{"id":"880f95df-8cd8-592c-a994-201f75508da3","recipe_version_id":"c1435753-2236-5cfd-be4f-5826f768c270","recipe_section_id":"f1b7fdf7-17c5-5605-89c1-c00bd7e1e3e7","ingredient_id":"1f0f6c52-8df8-5c75-8e12-44952d0a8b2a","source_line_key":"gumbys-ranch-s1-l04","sequence":4,"display_measurement":"5 oz.","normalized_quantity":"0.3125","normalized_uom":"lb","pounds_equivalent":"0.3125","operator_note":null,"source_metadata":{"notes":[],"section_sequence":4,"source_reference":"source-03: block 1, ingredient row 4","source_pounds_text":"0.3125","normalization_basis":"printed_lbs_column","source_ingredient_text":"POTASSIUM SORBATE","source_allergen_callouts":[]}},{"id":"9bc2a67f-656b-5e8b-8cb2-c5afb974cb9a","recipe_version_id":"c1435753-2236-5cfd-be4f-5826f768c270","recipe_section_id":"f1b7fdf7-17c5-5605-89c1-c00bd7e1e3e7","ingredient_id":"aedcb19b-e242-5b68-95cd-2ab60a2bb2b2","source_line_key":"gumbys-ranch-s1-l05","sequence":5,"display_measurement":"5 oz.","normalized_quantity":"0.3125","normalized_uom":"lb","pounds_equivalent":"0.3125","operator_note":"The right edge of the last digit is close to the image edge; the value reads 0.3125.","source_metadata":{"notes":["The right edge of the last digit is close to the image edge; the value reads 0.3125."],"section_sequence":5,"source_reference":"source-03: block 1, ingredient row 5","source_pounds_text":"0.3125","normalization_basis":"printed_lbs_column","source_ingredient_text":"SODIUM BENZOATE","source_allergen_callouts":[]}},{"id":"af9860e2-ce65-51ab-bf27-b80d806e4111","recipe_version_id":"c1435753-2236-5cfd-be4f-5826f768c270","recipe_section_id":"f1b7fdf7-17c5-5605-89c1-c00bd7e1e3e7","ingredient_id":"46bdc7d5-fe62-5626-8cc9-04625f3c94d6","source_line_key":"gumbys-ranch-s1-l06","sequence":6,"display_measurement":"5 oz.","normalized_quantity":"0.3125","normalized_uom":"lb","pounds_equivalent":null,"operator_note":"The image cuts off the end of the LBS. cell. Visible text begins 0.312. The complete 5 oz. measurement is retained.","source_metadata":{"notes":["The image cuts off the end of the LBS. cell. Visible text begins 0.312. The complete 5 oz. measurement is retained."],"explicit_mass_oz":"5","section_sequence":6,"source_reference":"source-03: block 1, ingredient row 6","source_pounds_text":"0.312… [image edge cropped]","normalization_basis":"explicit_mass_conversion: 5 oz / 16 = 0.3125 lb","source_pounds_status":"cropped","source_ingredient_text":"XANTHAN GUM (8200)","source_allergen_callouts":[]}},{"id":"54e80214-516a-4ec1-a1e2-8e1305bf5a11","recipe_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","recipe_section_id":"db6333d5-5a59-4f9e-b3e3-5a2713cb2074","ingredient_id":"62e893ae-7d4f-5cbe-bb6b-2a261929cd7c","source_line_key":"wnm-ranch-s1-l01","sequence":1,"display_measurement":"20 gls.","normalized_quantity":"160","normalized_uom":"lb","pounds_equivalent":"160","operator_note":null,"source_metadata":{}},{"id":"f3d99ecb-77b9-463e-909b-cead34e67595","recipe_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","recipe_section_id":"db6333d5-5a59-4f9e-b3e3-5a2713cb2074","ingredient_id":"fd00eeef-730c-56cf-a8af-861a14627365","source_line_key":"wnm-ranch-s1-l02","sequence":2,"display_measurement":"5 cs. + 10 lbs.","normalized_quantity":"160","normalized_uom":"lb","pounds_equivalent":"160","operator_note":null,"source_metadata":{}},{"id":"38ca814b-fbb4-4721-b340-fe4b97b7c7d1","recipe_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","recipe_section_id":"db6333d5-5a59-4f9e-b3e3-5a2713cb2074","ingredient_id":"0c917c16-63c6-5bec-a8b2-214569cbb539","source_line_key":"wnm-ranch-s1-l03","sequence":3,"display_measurement":"10 pkgs.","normalized_quantity":"8","normalized_uom":"lb","pounds_equivalent":"8","operator_note":null,"source_metadata":{}},{"id":"00fac44d-7615-485e-b0b4-988460971259","recipe_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","recipe_section_id":"db6333d5-5a59-4f9e-b3e3-5a2713cb2074","ingredient_id":"1f0f6c52-8df8-5c75-8e12-44952d0a8b2a","source_line_key":"wnm-ranch-s1-l04","sequence":4,"display_measurement":"5 oz.","normalized_quantity":"0.3125","normalized_uom":"lb","pounds_equivalent":"0.3125","operator_note":null,"source_metadata":{}},{"id":"9b48741e-ee33-4567-afd7-28c344fc112e","recipe_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","recipe_section_id":"db6333d5-5a59-4f9e-b3e3-5a2713cb2074","ingredient_id":"aedcb19b-e242-5b68-95cd-2ab60a2bb2b2","source_line_key":"wnm-ranch-s1-l05","sequence":5,"display_measurement":"5 oz.","normalized_quantity":"0.3125","normalized_uom":"lb","pounds_equivalent":"0.3125","operator_note":null,"source_metadata":{}},{"id":"14914a2b-343a-49f1-a93e-1af70ebaf822","recipe_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","recipe_section_id":"db6333d5-5a59-4f9e-b3e3-5a2713cb2074","ingredient_id":"46bdc7d5-fe62-5626-8cc9-04625f3c94d6","source_line_key":"wnm-ranch-s1-l06","sequence":6,"display_measurement":"10 oz.","normalized_quantity":"0.625","normalized_uom":"lb","pounds_equivalent":"0.625","operator_note":null,"source_metadata":{}},{"id":"df392564-a6ae-4e70-abdb-ef0289ed2382","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"8519e7d4-833c-5828-ad4e-95c6465e17fd","source_line_key":"honey-mustard-s1-l01","sequence":1,"display_measurement":"20 OZ.","normalized_quantity":"1.25","normalized_uom":"lb","pounds_equivalent":"1.25","operator_note":null,"source_metadata":{}},{"id":"5c02ebba-739f-41a9-a8ce-c63dc37e1f1e","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"be2b1c15-625a-556c-9473-5a500fde1bfb","source_line_key":"honey-mustard-s1-l02","sequence":2,"display_measurement":"12 OZ.","normalized_quantity":"0.75","normalized_uom":"lb","pounds_equivalent":"0.75","operator_note":null,"source_metadata":{}},{"id":"bd9e9170-b70b-4a0e-914d-3a20c4b0bc27","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"46bdc7d5-fe62-5626-8cc9-04625f3c94d6","source_line_key":"honey-mustard-s1-l03","sequence":3,"display_measurement":"4 OZ.","normalized_quantity":"0.25","normalized_uom":"lb","pounds_equivalent":"0.25","operator_note":null,"source_metadata":{}},{"id":"98f6a499-e948-4a17-998c-097de8fabef9","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"ed113870-296b-5b41-9b07-b857b990b3c0","source_line_key":"honey-mustard-s1-l04","sequence":4,"display_measurement":"4 OZ.","normalized_quantity":"0.25","normalized_uom":"lb","pounds_equivalent":"0.25","operator_note":null,"source_metadata":{}},{"id":"3895dc00-236f-432f-ae66-8bda0ef6e3e4","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"681ae7df-bdf1-522b-9f97-f52db6546eed","source_line_key":"honey-mustard-s1-l05","sequence":5,"display_measurement":"32 LBS.","normalized_quantity":"32","normalized_uom":"lb","pounds_equivalent":"32","operator_note":null,"source_metadata":{}},{"id":"e0a0fcd2-0ec8-45a2-8e96-4b81285361ff","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"d80800d5-384f-53be-a6e6-6f441153bf64","source_line_key":"honey-mustard-s1-l06","sequence":6,"display_measurement":"2 OZ.","normalized_quantity":"0.13","normalized_uom":"lb","pounds_equivalent":"0.13","operator_note":null,"source_metadata":{}},{"id":"e7d66170-d327-4f21-9f47-41a1c1e20322","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"cd150bb9-c879-5898-b756-9a4e60d97efc","source_line_key":"honey-mustard-s1-l07","sequence":7,"display_measurement":"7.5 LBS.","normalized_quantity":"7.5","normalized_uom":"lb","pounds_equivalent":"7.5","operator_note":null,"source_metadata":{}},{"id":"28af81e0-f0cc-4a50-8e86-d62da671ccd2","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"aa1ffab7-22a8-5402-9d8c-830ab40e29df","source_line_key":"honey-mustard-s1-l08","sequence":8,"display_measurement":"2 GALLONS","normalized_quantity":"16","normalized_uom":"lb","pounds_equivalent":"16","operator_note":null,"source_metadata":{}},{"id":"a8af9e07-9dd2-4fbd-a216-81aa94cf99a3","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"accabe06-94d2-4885-8860-2f360539bd42","ingredient_id":"5c43efc8-0a0b-55c7-aba6-c86fa302dd0b","source_line_key":"honey-mustard-s1-l09","sequence":9,"display_measurement":"1 QUART","normalized_quantity":"2","normalized_uom":"lb","pounds_equivalent":"2","operator_note":null,"source_metadata":{}},{"id":"e993ffee-ecdf-4efc-b69a-5888c004eba1","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"78f915e5-286d-418b-b1ff-d33a6fe8d818","ingredient_id":"b0aab304-1059-5b12-b916-1a9eeb0ec20b","source_line_key":"honey-mustard-s2-l01","sequence":10,"display_measurement":"7 GAL.","normalized_quantity":"56","normalized_uom":"lb","pounds_equivalent":"56","operator_note":null,"source_metadata":{}},{"id":"0ba1b67a-3d87-4d44-aaa3-7153a1681bb2","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"78f915e5-286d-418b-b1ff-d33a6fe8d818","ingredient_id":"16192f9e-de41-5ea5-b8ae-280d5f128462","source_line_key":"honey-mustard-s2-l02","sequence":11,"display_measurement":"11 GAL.","normalized_quantity":"74.97","normalized_uom":"lb","pounds_equivalent":"74.97","operator_note":null,"source_metadata":{}},{"id":"6e54a864-cb4e-4839-8da2-997d51feb6fe","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"78f915e5-286d-418b-b1ff-d33a6fe8d818","ingredient_id":"94c02d07-a4ca-5995-a832-1c7b7a2e6182","source_line_key":"honey-mustard-s2-l03","sequence":12,"display_measurement":"1 GALLON","normalized_quantity":"8","normalized_uom":"lb","pounds_equivalent":"8","operator_note":null,"source_metadata":{}},{"id":"52eb8d9f-2b26-4e94-9feb-1334829ab228","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"78f915e5-286d-418b-b1ff-d33a6fe8d818","ingredient_id":"064c4e84-016d-531e-bceb-758c0f1d97b8","source_line_key":"honey-mustard-s2-l04","sequence":13,"display_measurement":"30 LBS.","normalized_quantity":"30","normalized_uom":"lb","pounds_equivalent":"30","operator_note":null,"source_metadata":{}},{"id":"d33273ad-700d-45af-9aee-f6cd45062992","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"78f915e5-286d-418b-b1ff-d33a6fe8d818","ingredient_id":"8e883e06-cc52-5bcd-ab93-24a4b5be8b76","source_line_key":"honey-mustard-s2-l05","sequence":14,"display_measurement":"90 LBS.","normalized_quantity":"90","normalized_uom":"lb","pounds_equivalent":"90","operator_note":null,"source_metadata":{}},{"id":"52a74690-b760-42d0-a9f7-82cb71036923","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","recipe_section_id":"78f915e5-286d-418b-b1ff-d33a6fe8d818","ingredient_id":"04656fa5-0ab4-5b4b-81c3-29f9e0a41879","source_line_key":"honey-mustard-s2-l06","sequence":15,"display_measurement":"7 CUPS--71.75 OZ.","normalized_quantity":"4.48","normalized_uom":"lb","pounds_equivalent":"4.48","operator_note":null,"source_metadata":{}}]$production_master$::jsonb)
  as source(id uuid,recipe_version_id uuid,recipe_section_id uuid,ingredient_id uuid,source_line_key text,sequence integer,display_measurement text,normalized_quantity numeric,normalized_uom text,pounds_equivalent numeric,operator_note text,source_metadata jsonb);

insert into public.recipe_qc_rules (id,recipe_version_id,name,min_value,max_value,uom,instructions,source_text,sequence)
select id,recipe_version_id,name,min_value,max_value,uom,instructions,source_text,sequence from jsonb_to_recordset($production_master$[{"id":"07b9befb-378b-4d38-afc0-894d7074c54d","recipe_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73","name":"Printed worksheet weight range","min_value":"132","max_value":"136","uom":"oz","instructions":"Reference only; no production/QC execution is created by this seed.","source_text":"Range 132 oz. – 136 oz.","sequence":1},{"id":"518b6048-f3f0-4f32-bc10-e82efb2053a7","recipe_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20","name":"Printed worksheet weight range","min_value":"134","max_value":"138","uom":"oz","instructions":"Reference only; no production/QC execution is created by this seed.","source_text":"Range 134 oz. – 138 oz.","sequence":1},{"id":"a12b084f-fec4-4bed-9282-549497e0c482","recipe_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1","name":"Printed worksheet weight range","min_value":"129","max_value":"133","uom":"oz","instructions":"Reference only; no production/QC execution is created by this seed.","source_text":"Range 129--133 oz.","sequence":1},{"id":"28406fb8-f904-5170-ab82-239248295fd8","recipe_version_id":"c1435753-2236-5cfd-be4f-5826f768c270","name":"Printed worksheet weight range","min_value":"39.5","max_value":"40.5","uom":"lb","instructions":"Reference only; no production/QC execution is created by this seed.","source_text":"Range 39.5 – 40.5 lbs.","sequence":1},{"id":"415cd76a-c1d6-404c-84d7-0820712acfc8","recipe_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e","name":"Printed worksheet weight range","min_value":"32","max_value":"36","uom":"lb","instructions":"Reference only; no production/QC execution is created by this seed.","source_text":"Range 32 – 36 lbs.","sequence":1},{"id":"31f0bdad-7585-45f4-98ea-d52f9f32658d","recipe_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d","name":"Printed worksheet weight range","min_value":"142","max_value":"146","uom":"oz","instructions":"Reference only; no production/QC execution is created by this seed.","source_text":"Range 142 oz. – 146 oz.","sequence":1}]$production_master$::jsonb)
  as source(id uuid,recipe_version_id uuid,name text,min_value numeric,max_value numeric,uom text,instructions text,source_text text,sequence integer);

insert into public.supplier_items (id,supplier_id,ingredient_id,supplier_sku,purchase_uom,pack_quantity,pack_quantity_uom,is_preferred,active,notes)
select id,supplier_id,ingredient_id,supplier_sku,purchase_uom,pack_quantity,pack_quantity_uom,is_preferred,active,notes from jsonb_to_recordset($production_master$[{"id":"d0f60000-0000-4000-8000-000000000111","supplier_id":"d0f60000-0000-4000-8000-000000000101","ingredient_id":"b0aab304-1059-5b12-b916-1a9eeb0ec20b","supplier_sku":"DEMO-OIL-1000","purchase_uom":"each","pack_quantity":"1000.0000","pack_quantity_uom":"lb","is_preferred":true,"active":true,"notes":"1,000 lb tote"},{"id":"d0f60000-0000-4000-8000-000000000112","supplier_id":"d0f60000-0000-4000-8000-000000000102","ingredient_id":"63abea6c-8b56-5f57-9c4a-dacd4bfb260e","supplier_sku":"DEMO-LEMON-50","purchase_uom":"pail","pack_quantity":"50.0000","pack_quantity_uom":"lb","is_preferred":true,"active":true,"notes":"50 lb pail"},{"id":"d0f60000-0000-4000-8000-000000000113","supplier_id":"d0f60000-0000-4000-8000-000000000102","ingredient_id":"c69f54ee-a0ae-50db-bd6e-c0c880ca5ca7","supplier_sku":"DEMO-VINEGAR-50","purchase_uom":"pail","pack_quantity":"50.0000","pack_quantity_uom":"lb","is_preferred":true,"active":true,"notes":"50 lb pail"},{"id":"d0f60000-0000-4000-8000-000000000114","supplier_id":"d0f60000-0000-4000-8000-000000000103","ingredient_id":"83f5cd85-5422-5440-ab7d-bd8a78e88bc2","supplier_sku":"DEMO-CHEESE-25","purchase_uom":"bag","pack_quantity":"25.0000","pack_quantity_uom":"lb","is_preferred":true,"active":true,"notes":"25 lb bag"},{"id":"d0f60000-0000-4000-8000-000000000115","supplier_id":"d0f60000-0000-4000-8000-000000000103","ingredient_id":"457c443c-b7be-5f7d-887f-3a726eda55af","supplier_sku":"DEMO-BUTTERMILK-25","purchase_uom":"bag","pack_quantity":"25.0000","pack_quantity_uom":"lb","is_preferred":true,"active":true,"notes":"25 lb bag"},{"id":"ff3b1c82-997a-4b7e-91cb-a7c69b244640","supplier_id":"ef51be7c-6cfe-4df4-8834-73a6ae377771","ingredient_id":"2989e9ad-fb99-50c0-8c52-f3e193f51352","supplier_sku":"12345","purchase_uom":"bag","pack_quantity":"10.0000","pack_quantity_uom":"lb","is_preferred":true,"active":true,"notes":""}]$production_master$::jsonb)
  as source(id uuid,supplier_id uuid,ingredient_id uuid,supplier_sku text,purchase_uom text,pack_quantity numeric,pack_quantity_uom text,is_preferred boolean,active boolean,notes text);

-- Local-only supplier catalog: category-specific defaults give every active
-- material a sensible orderable pack while retaining the curated packs above.
insert into public.suppliers (id,name,contact_name,email,phone,lead_time_days,active) values
  ('d0f60000-0000-4000-8000-000000000104','Demo Dry Goods','Parker Pantry','orders@demo-dry-goods.test','817-555-0204',5,true),
  ('d0f60000-0000-4000-8000-000000000105','Demo Sauces & Seasonings','Sage Seasoning','orders@demo-sauces.test','817-555-0205',4,true),
  ('d0f60000-0000-4000-8000-000000000106','Demo Cold Storage','Drew Dairy','orders@demo-cold-storage.test','817-555-0206',6,true);

insert into public.supplier_items (supplier_id,ingredient_id,supplier_sku,purchase_uom,pack_quantity,pack_quantity_uom,is_preferred,active,notes)
select case ingredient.category
  when 'Dry' then 'd0f60000-0000-4000-8000-000000000104'::uuid
  when 'Refrigerated' then 'd0f60000-0000-4000-8000-000000000106'::uuid
  else 'd0f60000-0000-4000-8000-000000000105'::uuid end,
  ingredient.id,
  'DEMO-' || upper(replace(ingredient.internal_code, '-', '_')),
  case ingredient.category when 'Dry' then 'bag' when 'Refrigerated' then 'case' else 'pail' end,
  case ingredient.category when 'Dry' then 25::numeric when 'Refrigerated' then 20::numeric else 50::numeric end,
  ingredient.default_uom,
  true,
  true,
  case ingredient.category when 'Dry' then '25 lb dry-goods bag' when 'Refrigerated' then '20 lb cold-storage case' else '50 lb sauce or liquid pail' end
from public.ingredients ingredient
where ingredient.active
  and not exists (
    select 1 from public.supplier_items pack
    where pack.ingredient_id = ingredient.id and pack.active
  );

insert into public.ingredient_allergens (ingredient_id,allergen_id)
select ingredient_id,allergen_id from jsonb_to_recordset($production_master$[{"ingredient_id":"2989e9ad-fb99-50c0-8c52-f3e193f51352","allergen_id":"23803f26-ecab-5f67-b31d-9ae8156aea2f"},{"ingredient_id":"457c443c-b7be-5f7d-887f-3a726eda55af","allergen_id":"40f0a478-dab8-5a3a-a3db-59b6a2054ad2"},{"ingredient_id":"4be03f79-aeb8-5c48-8d80-27feab940fea","allergen_id":"0da54890-3672-588c-b852-706049c6574d"},{"ingredient_id":"4be03f79-aeb8-5c48-8d80-27feab940fea","allergen_id":"fa7ac20a-2ac8-5e73-948f-38d7196d4c87"},{"ingredient_id":"62e893ae-7d4f-5cbe-bb6b-2a261929cd7c","allergen_id":"40f0a478-dab8-5a3a-a3db-59b6a2054ad2"},{"ingredient_id":"805b843f-473a-57e2-a2b3-7f46d23bfce8","allergen_id":"fa7ac20a-2ac8-5e73-948f-38d7196d4c87"},{"ingredient_id":"83f5cd85-5422-5440-ab7d-bd8a78e88bc2","allergen_id":"40f0a478-dab8-5a3a-a3db-59b6a2054ad2"},{"ingredient_id":"8d7c38b2-f8af-5004-b3c9-3cc25d195700","allergen_id":"40f0a478-dab8-5a3a-a3db-59b6a2054ad2"},{"ingredient_id":"8e883e06-cc52-5bcd-ab93-24a4b5be8b76","allergen_id":"40f0a478-dab8-5a3a-a3db-59b6a2054ad2"},{"ingredient_id":"af51d4b5-fa24-54d7-bb3f-f06a5efc02fc","allergen_id":"0da54890-3672-588c-b852-706049c6574d"},{"ingredient_id":"b0aab304-1059-5b12-b916-1a9eeb0ec20b","allergen_id":"fa7ac20a-2ac8-5e73-948f-38d7196d4c87"},{"ingredient_id":"d80800d5-384f-53be-a6e6-6f441153bf64","allergen_id":"0da54890-3672-588c-b852-706049c6574d"},{"ingredient_id":"fd00eeef-730c-56cf-a8af-861a14627365","allergen_id":"0da54890-3672-588c-b852-706049c6574d"},{"ingredient_id":"fd00eeef-730c-56cf-a8af-861a14627365","allergen_id":"fa7ac20a-2ac8-5e73-948f-38d7196d4c87"}]$production_master$::jsonb)
  as source(ingredient_id uuid,allergen_id uuid);

insert into public.recipes (id,product_id,name)
select id,product_id,name from jsonb_to_recordset($production_master$[{"id":"6be36d26-a6c1-428d-904a-07188d763b93","product_id":"f8e15e9b-ac65-4dcd-b3af-54f2e1dba3ae","name":"Balsamic Vinaigrette Recipe","active_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20"},{"id":"cc4b0e43-3a5f-4322-a4b8-dc5beab4dd65","product_id":"7073e6e5-4471-4782-8309-987ca99f5eaa","name":"Creamy Caesar Recipe","active_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1"},{"id":"cf4aaefa-e029-5ad7-91c5-21bd26cf3075","product_id":"b5a9f5d5-19a5-5ca7-a41f-aed5c92961ac","name":"Gumby's Ranch Dressing Recipe","active_version_id":"c1435753-2236-5cfd-be4f-5826f768c270"},{"id":"7ffe8eea-bba3-4505-a541-fc2941e26d46","product_id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","name":"Honey Mustard Recipe","active_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d"},{"id":"e614f2c2-56a5-41a8-8461-7afbe09c1b1c","product_id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","name":"Leo's Select Italian Recipe","active_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73"},{"id":"f8be9698-c8f0-4b48-8471-8e668d365fd6","product_id":"e669369b-24df-4ae4-a930-f63cefbcdd07","name":"WNM Ranch Dressing Recipe","active_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e"}]$production_master$::jsonb)
  as source(id uuid,product_id uuid,name text,active_version_id uuid)
on conflict (id) do nothing;

update public.recipe_versions
set status='Released', released_at=now(), released_by='10000000-0000-4000-8000-000000000001'
where id in (
  '839a29bf-99b2-4d5e-9d2b-813715040c20',
  'e7cb640d-1a42-45dd-8af8-18843fddc61d',
  'b3cfae88-db55-41d5-bdb2-ce9e0a815db1',
  'c1435753-2236-5cfd-be4f-5826f768c270',
  '389a39a2-754e-461c-b9ba-5425a6f52f73',
  'dffd1245-0a1e-42d6-b46b-ed6ee7b7582e'
);

update public.recipes recipe
set active_version_id = source.active_version_id
from jsonb_to_recordset($production_master$[{"id":"6be36d26-a6c1-428d-904a-07188d763b93","product_id":"f8e15e9b-ac65-4dcd-b3af-54f2e1dba3ae","name":"Balsamic Vinaigrette Recipe","active_version_id":"839a29bf-99b2-4d5e-9d2b-813715040c20"},{"id":"cc4b0e43-3a5f-4322-a4b8-dc5beab4dd65","product_id":"7073e6e5-4471-4782-8309-987ca99f5eaa","name":"Creamy Caesar Recipe","active_version_id":"b3cfae88-db55-41d5-bdb2-ce9e0a815db1"},{"id":"cf4aaefa-e029-5ad7-91c5-21bd26cf3075","product_id":"b5a9f5d5-19a5-5ca7-a41f-aed5c92961ac","name":"Gumby's Ranch Dressing Recipe","active_version_id":"c1435753-2236-5cfd-be4f-5826f768c270"},{"id":"7ffe8eea-bba3-4505-a541-fc2941e26d46","product_id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","name":"Honey Mustard Recipe","active_version_id":"e7cb640d-1a42-45dd-8af8-18843fddc61d"},{"id":"e614f2c2-56a5-41a8-8461-7afbe09c1b1c","product_id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","name":"Leo's Select Italian Recipe","active_version_id":"389a39a2-754e-461c-b9ba-5425a6f52f73"},{"id":"f8be9698-c8f0-4b48-8471-8e668d365fd6","product_id":"e669369b-24df-4ae4-a930-f63cefbcdd07","name":"WNM Ranch Dressing Recipe","active_version_id":"dffd1245-0a1e-42d6-b46b-ed6ee7b7582e"}]$production_master$::jsonb)
  as source(id uuid,product_id uuid,name text,active_version_id uuid)
where recipe.id=source.id;

insert into public.customer_product_options (id,customer_id,product_id,label,packaging_mode,unit_name,gallons_per_unit,unit_price,currency,active,revision)
select id,customer_id,product_id,label,packaging_mode,unit_name,gallons_per_unit,unit_price,currency,active,1::integer from jsonb_to_recordset($production_master$[{"id":"091be44a-c240-4428-a20b-fa6495950346","customer_id":"b1f3fab4-fdd4-459a-b07e-f9bdea21e268","product_id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","label":"4 x 1-gallon foodservice case","packaging_mode":"product_default","unit_name":"case","gallons_per_unit":"4","unit_price":"71","currency":"USD","active":true,"revision":1},{"id":"2581bf34-207f-4e07-960d-f7ba571162f4","customer_id":"d0f60000-0000-4000-8000-000000000001","product_id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","label":"4 x 1-gallon foodservice case","packaging_mode":"product_default","unit_name":"case","gallons_per_unit":"4","unit_price":"79","currency":"USD","active":true,"revision":1},{"id":"a85c9415-01ad-46a0-8df5-69f9ea2509f6","customer_id":"b1f3fab4-fdd4-459a-b07e-f9bdea21e268","product_id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","label":"4 x 1-gallon foodservice case","packaging_mode":"product_default","unit_name":"case","gallons_per_unit":"4","unit_price":"75","currency":"USD","active":true,"revision":4},{"id":"ccde1f44-9c1e-4ebe-b4fa-70d4d5de4c6c","customer_id":"b1f3fab4-fdd4-459a-b07e-f9bdea21e268","product_id":"f8e15e9b-ac65-4dcd-b3af-54f2e1dba3ae","label":"4 x 1-gallon foodservice case","packaging_mode":"product_default","unit_name":"case","gallons_per_unit":"4","unit_price":"1000","currency":"USD","active":true,"revision":1},{"id":"d0f60000-0000-4000-8000-000000000002","customer_id":"d0f60000-0000-4000-8000-000000000001","product_id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","label":"4 x 1-gallon foodservice case","packaging_mode":"product_default","unit_name":"case","gallons_per_unit":"4","unit_price":"78","currency":"USD","active":true,"revision":1},{"id":"d25ed3f8-b164-42c9-9ada-d20071b163f2","customer_id":"b1f3fab4-fdd4-459a-b07e-f9bdea21e268","product_id":"7073e6e5-4471-4782-8309-987ca99f5eaa","label":"4 x 1-gallon foodservice case","packaging_mode":"product_default","unit_name":"case","gallons_per_unit":"4","unit_price":"40","currency":"USD","active":true,"revision":1}]$production_master$::jsonb)
  as source(id uuid,customer_id uuid,product_id uuid,label text,packaging_mode text,unit_name text,gallons_per_unit numeric,unit_price numeric,currency text,active boolean,revision integer);

-- The previous generic fixture is intentionally removed: the local demo now uses only the production master-data snapshot.

-- Keep the successful five-day local transaction shape, but attach it to the
-- production customer/product options copied above. Production dates, orders,
-- batches, and schedule records are never copied into this fixture.
select public.save_customer_order(jsonb_set('{"id":"10000000-0000-4000-8000-000000000621","customer_name":"Jason''s Deli","reference":"JDL-PO-10482","products":[{"product_id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","batch_count":126,"customer_product_option_id":"a85c9415-01ad-46a0-8df5-69f9ea2509f6"}]}'::jsonb,'{needed_on}',to_jsonb((select ranch_pickup from sample_dates))));
select public.save_customer_order(jsonb_set('{"id":"10000000-0000-4000-8000-000000000622","customer_name":"Jason''s Family Market","reference":"JFM-PO-77831","products":[{"product_id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","batch_count":127,"customer_product_option_id":"2581bf34-207f-4e07-960d-f7ba571162f4"}]}'::jsonb,'{needed_on}',to_jsonb((select italian_pickup from sample_dates))));

select public.save_packaging_profile('{"id":"10000000-0000-4000-8000-000000000701","product_id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","expected_version":0,"status":"Approved","bag_size_gallons":1,"bags_per_case":4,"label_width_inches":3,"label_height_inches":5,"display_name":"Leo''s Select Italian","ingredient_statement":"Production master-data product."}');
select public.save_packaging_profile('{"id":"10000000-0000-4000-8000-000000000702","product_id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","expected_version":0,"status":"Approved","bag_size_gallons":1,"bags_per_case":4,"label_width_inches":3,"label_height_inches":5,"display_name":"Honey Mustard","ingredient_statement":"Production master-data product."}');

select public.save_order_production_plan(jsonb_build_object('id','10000000-0000-4000-8000-000000000621','revision',0,'start_on',(select production_start from sample_dates),'finish_on',(select ranch_finish from sample_dates),'status','Draft','note','126 Leo''s Select Italian batches across five production days for Jason''s Deli pickup.','shortage_reason','Local demo capacity run.'));
select public.save_order_production_plan(jsonb_build_object('id','10000000-0000-4000-8000-000000000622','revision',0,'start_on',(select production_start from sample_dates),'finish_on',(select italian_finish from sample_dates),'status','Draft','note','127 Honey Mustard batches across five production days for Jason''s Family Market pickup.','shortage_reason','Local demo capacity run.'));
select public.save_order_production_plan(jsonb_build_object('id','10000000-0000-4000-8000-000000000621','revision',1,'start_on',(select production_start from sample_dates),'finish_on',(select ranch_finish from sample_dates),'status','Confirmed','note','126 Leo''s Select Italian batches across five production days for Jason''s Deli pickup.','shortage_reason','Local demo capacity run.'));
select public.save_order_production_plan(jsonb_build_object('id','10000000-0000-4000-8000-000000000622','revision',1,'start_on',(select production_start from sample_dates),'finish_on',(select italian_finish from sample_dates),'status','Confirmed','note','127 Honey Mustard batches across five production days for Jason''s Family Market pickup.','shortage_reason','Local demo capacity run.'));

-- A fuller local-only customer-order suite balances Wings and More Ranch with
-- Jason's Deli dressings over a two-week pickup horizon. Together with the two
-- established orders above, the local demo contains exactly fifteen active orders:
-- seven Wings and More, seven Jason's Deli, and one Jason's Family Market order.
-- Default product packaging is intentional: it keeps the fixture focused on
-- operational work and avoids copying customer pricing.
create temp table demo_order_horizon on commit drop as
select day_on::date as work_on, row_number() over (order by day_on)::integer as workday_number
from generate_series((select production_start from sample_dates)::timestamp,
  ((select production_start from sample_dates) + 50)::timestamp, interval '1 day') day_on
where extract(isodow from day_on) between 1 and 5;

create temp table demo_wings_orders on commit drop as
select order_scope.*,
  (select work_on from demo_order_horizon where workday_number = order_scope.mixing_start_workday - 1) as production_start,
  (select work_on from demo_order_horizon where workday_number = order_scope.mixing_start_workday + order_scope.mixing_days) as production_finish,
  (select work_on from demo_order_horizon where workday_number = order_scope.mixing_start_workday + order_scope.mixing_days + 1) as loading_on,
  (select work_on from demo_order_horizon where workday_number = order_scope.mixing_start_workday + order_scope.mixing_days + 2) as needed_on,
  (select work_on from demo_order_horizon where workday_number = order_scope.mixing_start_workday - 2) as purchase_expected_on
from (
select
  order_number,
  ('10000000-0000-4000-8000-000000000' || (630 + order_number)::text)::uuid as id,
  case when order_number <= 7 then 'WNM-DEMO-' else 'JDL-DEMO-' end
    || lpad(order_number::text, 3, '0') as reference,
  case when order_number <= 7 then 'Wings and More' else 'Jason''s Deli' end as customer_name,
  case when order_number <= 7 then 'e669369b-24df-4ae4-a930-f63cefbcdd07'::uuid
    when order_number % 2 = 0 then 'abbdd137-b52c-44ed-b677-a4a2e87a5598'::uuid
    else '498601a9-c0d3-496d-b485-36fbc2d64a2e'::uuid end as product_id,
  case when order_number <= 4 then 10 when order_number <= 8 then 14 else 5 end as mixing_days,
  (case when order_number <= 4 then 10 when order_number <= 8 then 14 else 5 end) * 4 as batch_count,
  case when order_number <= 4 then order_number + 3
    when order_number <= 8 then order_number - 2 else order_number + 2 end as mixing_start_workday
from generate_series(1, 13) order_number
) order_scope;

select public.save_customer_order(jsonb_build_object(
  'id', demo.id,
  'customer_name', demo.customer_name,
  'reference', demo.reference,
  'needed_on', demo.needed_on,
  'products', jsonb_build_array(jsonb_build_object('product_id', demo.product_id, 'batch_count', demo.batch_count))
))
from demo_wings_orders demo;

select public.save_order_production_plan(jsonb_build_object(
  'id', demo.id, 'revision', 0, 'start_on', demo.production_start,
  'finish_on', demo.production_finish, 'status', 'Draft',
  'note', demo.mixing_days || '-business-day mixing run with staged prep and packaging.',
  'shortage_reason', 'Local demo capacity run.'
))
from demo_wings_orders demo;
select public.save_order_production_plan(jsonb_build_object(
  'id', demo.id, 'revision', 1, 'start_on', demo.production_start,
  'finish_on', demo.production_finish, 'status', 'Confirmed',
  'note', demo.mixing_days || '-business-day mixing run with staged prep and packaging.',
  'shortage_reason', 'Local demo capacity run.'
))
from demo_wings_orders demo;

-- Demo inventory is based on the active material plans above, not a generic
-- quantity. Reorder covers roughly two production days (40%) and par covers
-- six days (120%), both rounded up to the preferred supplier pack. The snapshot
-- then shows a realistic mix of healthy buffers, watch items, and four items
-- that need immediate procurement attention.
create temp table demo_inventory_snapshot on commit drop as
with active_demand as (
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
  select ingredient.id, ingredient.internal_code, ingredient.category, ingredient.default_uom,
    demand.demand, supplier_pack.quantity,
    case when demand.demand > 0 then ceil(demand.demand * 0.4 / supplier_pack.quantity) * supplier_pack.quantity
      else supplier_pack.quantity end as reorder_point,
    case when demand.demand > 0 then greatest(ceil(demand.demand * 1.2 / supplier_pack.quantity) * supplier_pack.quantity, supplier_pack.quantity * 2)
      else supplier_pack.quantity * 3 end as par_level
  from public.ingredients ingredient
  join active_demand demand on demand.id = ingredient.id
  join supplier_pack on supplier_pack.id = ingredient.id
)
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
from policy_base;

update public.ingredients ingredient
set reorder_point = snapshot.reorder_point,
  par_level = snapshot.par_level,
  reorder_quantity = snapshot.reorder_quantity
from demo_inventory_snapshot snapshot
where snapshot.id = ingredient.id;

insert into public.inventory_events (ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,effective_on)
select snapshot.id, 'OpeningBalance', snapshot.on_hand, snapshot.default_uom,
  'Demand-and-pack based local demo opening balance', gen_random_uuid(),
  (select receipt_one from sample_dates)
from demo_inventory_snapshot snapshot;

select public.save_shipping_draft(jsonb_set('{"id":"10000000-0000-4000-8000-000000000801","order_id":"10000000-0000-4000-8000-000000000621","method":"Pickup","note":"Customer refrigerated truck at dock 2.","lines":[{"product_id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","quantity":20}]}'::jsonb,'{planned_on}',to_jsonb((select ranch_pickup from sample_dates))));
select public.save_shipping_draft(jsonb_set('{"id":"10000000-0000-4000-8000-000000000802","order_id":"10000000-0000-4000-8000-000000000622","method":"Pickup","note":"Customer pickup after the final packaging day.","lines":[{"product_id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","quantity":30}]}'::jsonb,'{planned_on}',to_jsonb((select italian_pickup from sample_dates))));

-- Five order-linked inbound POs provide real supplier-delivery rows for the
-- planner/calendar. Their lines use current material shortages and preferred packs.
create temp table demo_order_purchase_requests on commit drop as
select ('10000000-0000-4000-8000-000000000' || (880 + demo.order_number)::text)::uuid as id,
  demo.id as material_plan_id, demo.purchase_expected_on as expected_on,
  requirement.value->>'ingredient_id' as ingredient_id, supplier_item.id as supplier_item_id,
  ceil((requirement.value->>'shortage')::numeric / supplier_item.pack_quantity)::integer as purchase_units
from demo_wings_orders demo
cross join lateral (
  select value from jsonb_array_elements(public.material_requirements(demo.id))
  where coalesce((value->>'shortage')::numeric, 0) > 0
  order by value->>'ingredient_name' limit 1
) requirement
join lateral (
  select item.* from public.supplier_items item
  where item.ingredient_id = (requirement.value->>'ingredient_id')::uuid and item.active
    and item.pack_quantity_uom = requirement.value->>'uom'
  order by item.is_preferred desc, item.id limit 1
) supplier_item on true
where demo.order_number <= 5;

select public.create_purchase_draft(jsonb_build_object(
  'id', request.id, 'kind', 'order', 'material_plan_id', request.material_plan_id,
  'supplier_id', supplier_item.supplier_id, 'expected_on', request.expected_on,
  'lines', jsonb_build_array(jsonb_build_object('ingredient_id', request.ingredient_id,
    'supplier_item_id', request.supplier_item_id, 'purchase_units', request.purchase_units))
))
from demo_order_purchase_requests request
join public.supplier_items supplier_item on supplier_item.id = request.supplier_item_id;

select public.change_purchase_status(jsonb_build_object(
  'id', request.id, 'status', 'Confirmed', 'reference', 'WNM-PO-' || right(request.id::text, 4),
  'note', 'Inbound material coverage for the linked customer demo order.',
  'total_cost', 1000, 'placed_on', request.expected_on - 1, 'revision', 1
))
from demo_order_purchase_requests request;

reset role;

-- BEGIN LOCAL STAGGERED WORK ORDERS
-- Canonical Work records, rather than legacy calendar-only events. Each order
-- has five weekday prep/mixing/packaging cycles. Packaging follows mixing by one
-- working day, so the lanes overlap: tomorrow's mixing is prepared while today's batch
-- is mixing and the prior batch is packaged. The UUIDs are repeatable so this
-- block can also refresh local samples. Both orders share one compact horizon.
-- Raw MD5 text can be parsed by Postgres as a UUID but does not reliably carry
-- a UUID version/variant; client validation correctly rejects those values.
create function pg_temp.sample_work_id(seed text) returns uuid
language sql immutable as $$
  select (
    substr(md5(seed), 1, 8) || '-' || substr(md5(seed), 9, 4) || '-4'
    || substr(md5(seed), 14, 3) || '-8' || substr(md5(seed), 18, 3)
    || '-' || substr(md5(seed), 21, 12)
  )::uuid
$$;

create temp table sample_work_days on commit drop as
select day_on::date as work_on, row_number() over (order by day_on)::integer as workday_number
from generate_series((select production_start from sample_dates)::timestamp,
  ((select production_start from sample_dates) + 14)::timestamp, interval '1 day') day_on
where extract(isodow from day_on) between 1 and 5;

create temp table sample_work_cycles on commit drop as
select batch.id as batch_id, customer_order.id as order_id, batch.product_id, batch.production_lot_id,
  customer_order.customer_id, customer_order.reference, cycle.cycle_number, cycle.planned_batch_count,
  (select work_on from sample_work_days where workday_number = cycle.cycle_number) as prep_on,
  (select work_on from sample_work_days where workday_number = cycle.cycle_number + 1) as mixing_on,
  (select work_on from sample_work_days where workday_number = cycle.cycle_number + 2) as packaging_on
from public.customer_orders customer_order
cross join lateral (
  select allocation.cycle_number, allocation.planned_batch_count,
    coalesce(sum(allocation.planned_batch_count) over (
      order by allocation.cycle_number rows between unbounded preceding and 1 preceding
    ), 0)::integer as batch_offset
  from (values
    (1, 24),
    (2, 25),
    (3, 25),
    (4, 26),
    (5, case when customer_order.id = '10000000-0000-4000-8000-000000000622'::uuid then 27 else 26 end)
  ) as allocation(cycle_number, planned_batch_count)
) cycle
cross join lateral (
  select planned.id, planned.product_id, planned.production_lot_id
  from public.planned_mixer_batches planned
  where planned.order_id = customer_order.id
  order by planned.sequence
  offset cycle.batch_offset
  limit 1
) batch
where customer_order.id in ('10000000-0000-4000-8000-000000000621', '10000000-0000-4000-8000-000000000622');

insert into public.workforce_work_queue_items(
  id, organization_id, facility_id, work_on, kind, title, instructions,
  batch_quota, planned_batch_count, estimated_minutes, required_worker_count, linked_task_type, linked_task_id,
  start_at, end_at, all_day, timezone, product_id, customer_id, location_label,
  publication_state, status, published_by, published_at, created_by, updated_by
)
select pg_temp.sample_work_id(cycle.order_id::text || ':cycle:' || cycle.cycle_number || ':' || lane.kind),
  profile.organization_id, profile.facility_id, work_day.work_on,
  lane.kind, lane.label || ' · Day ' || cycle.cycle_number || ' · ' || cycle.reference,
  'One fifth of the ordered batches; weekday prep, next-working-day mixing, and following-working-day packaging before customer pickup.',
  case when lane.kind in ('ingredient_prep', 'mixing') then cycle.planned_batch_count::integer end,
  cycle.planned_batch_count,
  case when lane.kind = 'ingredient_prep' then 30 * cycle.planned_batch_count
    when lane.kind = 'mixing' then 18 * cycle.planned_batch_count end,
  1, case lane.kind when 'ingredient_prep' then 'production_plan'
    when 'mixing' then 'planned_mixer_batch'
    else case when cycle.production_lot_id is null then 'planned_mixer_batch' else 'production_lot' end end,
  case lane.kind when 'ingredient_prep' then cycle.order_id
    when 'mixing' then cycle.batch_id else coalesce(cycle.production_lot_id, cycle.batch_id) end,
  work_day.work_on::timestamp at time zone facility.timezone,
  (work_day.work_on + 1)::timestamp at time zone facility.timezone,
  true, facility.timezone, cycle.product_id, cycle.customer_id, lane.location,
  'published', 'claimed', profile.id, now(), profile.id, profile.id
from sample_work_cycles cycle
cross join (values
  ('ingredient_prep', 'Prep', 'Ingredient preparation'),
  ('mixing', 'Mixing', 'Mixer'),
  ('packaging', 'Packaging', 'Packaging line')
) lane(kind, label, location)
cross join lateral (select case lane.kind when 'ingredient_prep' then cycle.prep_on
  when 'mixing' then cycle.mixing_on else cycle.packaging_on end as work_on) work_day
join public.profiles profile on profile.id = '10000000-0000-4000-8000-000000000001'
join public.facilities facility on facility.id = profile.facility_id
on conflict (id) do nothing;

insert into public.workforce_work_queue_items(
  id, organization_id, facility_id, work_on, kind, title, required_worker_count,
  linked_task_type, linked_task_id, start_at, end_at, all_day, timezone,
  customer_id, location_label, publication_state, status, published_by, published_at,
  created_by, updated_by
)
select pg_temp.sample_work_id(customer_order.id::text || ':pickup'),
  customer_order.organization_id, customer_order.facility_id, customer_order.needed_on,
  'shipment_loading', 'Pickup · ' || customer_order.reference, 1, 'order', customer_order.id,
  customer_order.needed_on::timestamp at time zone facility.timezone,
  (customer_order.needed_on + 1)::timestamp at time zone facility.timezone,
  true, facility.timezone, customer_order.customer_id, 'Pickup dock',
  'published', 'claimed', '10000000-0000-4000-8000-000000000001', now(),
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
from public.customer_orders customer_order
join public.facilities facility on facility.id = customer_order.facility_id
where customer_order.id in ('10000000-0000-4000-8000-000000000621', '10000000-0000-4000-8000-000000000622')
on conflict (id) do nothing;

insert into public.workforce_work_queue_claims(
  organization_id, facility_id, queue_item_id, worker_id, claim_source
)
select work.organization_id, work.facility_id, work.id,
  case work.customer_id
    when 'b1f3fab4-fdd4-459a-b07e-f9bdea21e268'::uuid then case work.kind
      when 'ingredient_prep' then '10000000-0000-4000-8000-000000000004'::uuid
      when 'mixing' then '10000000-0000-4000-8000-000000000002'::uuid
      else '10000000-0000-4000-8000-000000000003'::uuid end
    else case work.kind
      when 'ingredient_prep' then '10000000-0000-4000-8000-000000000005'::uuid
      when 'mixing' then '10000000-0000-4000-8000-000000000006'::uuid
      else '10000000-0000-4000-8000-000000000007'::uuid end
  end,
  'supervisor_assigned'
from public.workforce_work_queue_items work
where work.id in (
  select pg_temp.sample_work_id(order_id::text || ':cycle:' || cycle_number || ':' || kind) from sample_work_cycles
  cross join (values ('ingredient_prep'), ('mixing'), ('packaging')) lane(kind)
  union all
  select pg_temp.sample_work_id(order_id::text || ':pickup') from sample_work_cycles
)
on conflict (queue_item_id, worker_id) do nothing;

insert into public.workforce_work_queue_history(
  organization_id, facility_id, queue_item_id, action, actor_user_id, after_data
)
select work.organization_id, work.facility_id, work.id, 'claimed', '10000000-0000-4000-8000-000000000001',
  to_jsonb(work) || jsonb_build_object('worker_id', claim.worker_id, 'claim_source', claim.claim_source)
from public.workforce_work_queue_items work
join public.workforce_work_queue_claims claim on claim.queue_item_id = work.id
where work.id in (
  select pg_temp.sample_work_id(order_id::text || ':cycle:' || cycle_number || ':' || kind) from sample_work_cycles
  cross join (values ('ingredient_prep'), ('mixing'), ('packaging')) lane(kind)
  union all select pg_temp.sample_work_id(order_id::text || ':pickup') from sample_work_cycles
)
and not exists (select 1 from public.workforce_work_queue_history history
  where history.queue_item_id = work.id and history.action = 'claimed');
-- The existing scheduling workspace still reads the schedule event contract.
-- Local sample projections keep identical IDs, dates, and staffing across both
-- read paths until that workspace switches to canonical scheduled Work.
insert into public.workforce_schedule_events(
  id, organization_id, facility_id, start_on, end_on, start_at, end_at, all_day,
  timezone, kind, required_worker_count, title, production_plan_id, planned_batch_count,
  linked_task_type, linked_task_id, product_id, customer_id, location_label,
  availability_override_reason, created_by, updated_by
)
select work.id, work.organization_id, work.facility_id, work.work_on, work.work_on + 1,
  work.start_at, work.end_at, work.all_day, work.timezone, work.kind, 1, work.title,
  coalesce(cycle.order_id, work.linked_task_id), work.planned_batch_count, work.linked_task_type, work.linked_task_id,
  work.product_id, work.customer_id, work.location_label, null,
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
from public.workforce_work_queue_items work
left join sample_work_cycles cycle on work.id in (
  pg_temp.sample_work_id(cycle.order_id::text || ':cycle:' || cycle.cycle_number || ':ingredient_prep'),
  pg_temp.sample_work_id(cycle.order_id::text || ':cycle:' || cycle.cycle_number || ':mixing'),
  pg_temp.sample_work_id(cycle.order_id::text || ':cycle:' || cycle.cycle_number || ':packaging')
)
where cycle.batch_id is not null or (work.kind = 'shipment_loading' and work.linked_task_id in
  ('10000000-0000-4000-8000-000000000621', '10000000-0000-4000-8000-000000000622'))
on conflict (id) do nothing;

insert into public.workforce_schedule_assignments(organization_id, facility_id, event_id, employee_id)
select claim.organization_id, claim.facility_id, claim.queue_item_id, claim.worker_id
from public.workforce_work_queue_claims claim
join public.workforce_schedule_events event on event.id = claim.queue_item_id
on conflict (event_id, employee_id) do nothing;

-- END LOCAL STAGGERED WORK ORDERS

-- Every added order has three staged production work orders plus distinct final
-- loading and customer-pickup work orders.  The rows below are canonical Work;
-- their matching schedule rows are the planner/calendar projection.
create temp table demo_wings_work_cycles on commit drop as
select demo.id as order_id, order_record.organization_id, order_record.facility_id,
  order_record.customer_id, order_record.customer_name, demo.reference, demo.order_number,
  demo.product_id, demo.batch_count, demo.mixing_days,
  cycle.cycle_number,
  (select work_on from demo_order_horizon where workday_number = demo.mixing_start_workday + cycle.cycle_number - 2) as prep_on,
  (select work_on from demo_order_horizon where workday_number = demo.mixing_start_workday + cycle.cycle_number - 1) as mixing_on,
  (select work_on from demo_order_horizon where workday_number = demo.mixing_start_workday + cycle.cycle_number) as packaging_on,
  ceil(demo.batch_count::numeric / demo.mixing_days)::integer as planned_batch_count,
  (select batch.id from public.planned_mixer_batches batch
    where batch.order_id = demo.id order by batch.sequence offset (cycle.cycle_number - 1) * 4 limit 1) as batch_id
from demo_wings_orders demo
join public.customer_orders order_record on order_record.id = demo.id
cross join lateral generate_series(1, demo.mixing_days) cycle(cycle_number);

insert into public.workforce_work_queue_items(
  id, organization_id, facility_id, work_on, kind, title, instructions,
  batch_quota, planned_batch_count, estimated_minutes, required_worker_count,
  linked_task_type, linked_task_id, start_at, end_at, all_day, timezone,
  product_id, customer_id, location_label, publication_state, status,
  published_by, published_at, created_by, updated_by
)
select pg_temp.sample_work_id(cycle.order_id::text || ':demo-cycle:' || cycle.cycle_number || ':' || lane.kind),
  cycle.organization_id, cycle.facility_id, lane.work_on, lane.kind,
  lane.label || ' · ' || cycle.customer_name || ' · ' || cycle.reference,
  'Two-week demo order workflow. Complete this work before the following stage.',
  case when lane.kind in ('ingredient_prep', 'mixing') then cycle.planned_batch_count end,
  cycle.planned_batch_count,
  case when lane.kind = 'ingredient_prep' then 30 * cycle.planned_batch_count
    when lane.kind = 'mixing' then 18 * cycle.planned_batch_count end,
  1, case when lane.kind = 'ingredient_prep' then 'production_plan' else 'planned_mixer_batch' end,
  case when lane.kind = 'ingredient_prep' then cycle.order_id else cycle.batch_id end,
  lane.work_on::timestamp at time zone facility.timezone,
  (lane.work_on + 1)::timestamp at time zone facility.timezone, true, facility.timezone,
  cycle.product_id, cycle.customer_id, lane.location, 'published', 'available',
  '10000000-0000-4000-8000-000000000001', now(),
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
from demo_wings_work_cycles cycle
cross join lateral (values
  ('ingredient_prep', 'Ingredient prep', cycle.prep_on, 'Prep room'),
  ('mixing', 'Mixing', cycle.mixing_on, 'Mixer'),
  ('packaging', 'Packaging', cycle.packaging_on, 'Packaging line')
) lane(kind, label, work_on, location)
join public.facilities facility on facility.id = cycle.facility_id
where cycle.batch_id is not null
on conflict (id) do nothing;

insert into public.workforce_work_queue_items(
  id, organization_id, facility_id, work_on, kind, title, instructions,
  required_worker_count, linked_task_type, linked_task_id, start_at, end_at,
  all_day, timezone, product_id, customer_id, location_label, publication_state,
  status, published_by, published_at, created_by, updated_by
)
select pg_temp.sample_work_id(demo.id::text || ':demo-' || final_stage.stage),
  order_record.organization_id, order_record.facility_id, final_stage.work_on,
  'shipment_loading', final_stage.label || ' · ' || demo.reference,
  'Final customer fulfillment work for the two-week demo order.', 1, 'order', demo.id,
  final_stage.work_on::timestamp at time zone facility.timezone,
  (final_stage.work_on + 1)::timestamp at time zone facility.timezone, true, facility.timezone,
  demo.product_id, order_record.customer_id, 'Pickup dock', 'published', 'available',
  '10000000-0000-4000-8000-000000000001', now(),
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
from demo_wings_orders demo
join public.customer_orders order_record on order_record.id = demo.id
join public.facilities facility on facility.id = order_record.facility_id
cross join lateral (values
  ('loading', 'Loading', demo.loading_on),
  ('pickup', 'Shipping pickup', demo.needed_on)
) final_stage(stage, label, work_on)
on conflict (id) do nothing;

-- Confirmed supplier delivery is scheduled before the first ingredient-prep
-- work order for each order that has an inbound purchase commitment.
insert into public.workforce_work_queue_items(
  id, organization_id, facility_id, work_on, kind, title, instructions,
  required_worker_count, linked_task_type, linked_task_id, start_at, end_at,
  all_day, timezone, customer_id, location_label, publication_state, status,
  published_by, published_at, created_by, updated_by
)
select pg_temp.sample_work_id(demo.id::text || ':demo-purchase-receiving'),
  order_record.organization_id, order_record.facility_id, request.expected_on,
  'receiving', 'Purchase receiving · ' || demo.reference,
  'Receive confirmed inbound materials before ingredient prep begins.', 1,
  'purchase_draft', request.id, request.expected_on::timestamp at time zone facility.timezone,
  (request.expected_on + 1)::timestamp at time zone facility.timezone, true, facility.timezone,
  order_record.customer_id, 'Receiving dock', 'published', 'available',
  '10000000-0000-4000-8000-000000000001', now(),
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
from demo_order_purchase_requests request
join demo_wings_orders demo on demo.id = request.material_plan_id
join public.customer_orders order_record on order_record.id = demo.id
join public.facilities facility on facility.id = order_record.facility_id
on conflict (id) do nothing;

insert into public.workforce_work_queue_claims(organization_id, facility_id, queue_item_id, worker_id, claim_source)
select work.organization_id, work.facility_id, work.id,
  '10000000-0000-4000-8000-000000000007', 'supervisor_assigned'
from public.workforce_work_queue_items work
where work.id in (
  select pg_temp.sample_work_id(cycle.order_id::text || ':demo-cycle:' || cycle.cycle_number || ':' || lane.kind)
  from demo_wings_work_cycles cycle cross join (values ('ingredient_prep'), ('mixing'), ('packaging')) lane(kind)
  union all
  select pg_temp.sample_work_id(demo.id::text || ':demo-' || stage)
  from demo_wings_orders demo cross join (values ('loading'), ('pickup')) final(stage)
  union all
  select pg_temp.sample_work_id(demo.id::text || ':demo-purchase-receiving')
  from demo_wings_orders demo join demo_order_purchase_requests request on request.material_plan_id = demo.id
)
and false
on conflict (queue_item_id, worker_id) do nothing;

insert into public.workforce_schedule_events(
  id, organization_id, facility_id, start_on, end_on, start_at, end_at, all_day,
  timezone, kind, required_worker_count, title, production_plan_id, planned_batch_count,
  linked_task_type, linked_task_id, product_id, customer_id, location_label,
  availability_override_reason, created_by, updated_by
)
select work.id, work.organization_id, work.facility_id, work.work_on, work.work_on + 1,
  work.start_at, work.end_at, work.all_day, work.timezone, work.kind, work.required_worker_count,
  work.title, case when work.linked_task_type = 'production_plan' then work.linked_task_id else demo.id end,
  work.planned_batch_count,
  case when work.kind = 'receiving' then 'order' else work.linked_task_type end,
  case when work.kind = 'receiving' then demo.id else work.linked_task_id end, work.product_id,
  work.customer_id, work.location_label, null,
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
from public.workforce_work_queue_items work
join demo_wings_orders demo on work.id in (
  select pg_temp.sample_work_id(cycle.order_id::text || ':demo-cycle:' || cycle.cycle_number || ':' || lane.kind)
  from demo_wings_work_cycles cycle cross join (values ('ingredient_prep'), ('mixing'), ('packaging')) lane(kind)
  where cycle.order_id = demo.id
  union all
  select pg_temp.sample_work_id(demo.id::text || ':demo-' || stage)
  from (values ('loading'), ('pickup')) final(stage)
  union all
  select pg_temp.sample_work_id(demo.id::text || ':demo-purchase-receiving')
  from demo_order_purchase_requests request where request.material_plan_id = demo.id
)
on conflict (id) do nothing;

insert into public.workforce_schedule_assignments(organization_id, facility_id, event_id, employee_id)
select claim.organization_id, claim.facility_id, claim.queue_item_id, claim.worker_id
from public.workforce_work_queue_claims claim
join public.workforce_schedule_events event on event.id = claim.queue_item_id
where claim.queue_item_id in (
  select work.id from public.workforce_work_queue_items work
  where work.title like '%WNM-DEMO-%' or work.title like '%JDL-DEMO-%'
)
on conflict (event_id, employee_id) do nothing;

-- The Gantt/planner can follow the real execution chain, not just infer it from
-- dates: prep → mix → package, package → next prep, final package → loading → pickup.
create temp table demo_wings_dependency_edges on commit drop as
select cycle.organization_id, cycle.facility_id,
  pg_temp.sample_work_id(cycle.order_id::text || ':demo-cycle:' || cycle.cycle_number || ':ingredient_prep') as predecessor_id,
  pg_temp.sample_work_id(cycle.order_id::text || ':demo-cycle:' || cycle.cycle_number || ':mixing') as successor_id
from demo_wings_work_cycles cycle
union all
select cycle.organization_id, cycle.facility_id,
  pg_temp.sample_work_id(cycle.order_id::text || ':demo-cycle:' || cycle.cycle_number || ':mixing'),
  pg_temp.sample_work_id(cycle.order_id::text || ':demo-cycle:' || cycle.cycle_number || ':packaging')
from demo_wings_work_cycles cycle
union all
select current_cycle.organization_id, current_cycle.facility_id,
  pg_temp.sample_work_id(current_cycle.order_id::text || ':demo-cycle:' || current_cycle.cycle_number || ':packaging'),
  pg_temp.sample_work_id(next_cycle.order_id::text || ':demo-cycle:' || next_cycle.cycle_number || ':ingredient_prep')
from demo_wings_work_cycles current_cycle
join demo_wings_work_cycles next_cycle on next_cycle.order_id = current_cycle.order_id
  and next_cycle.cycle_number = current_cycle.cycle_number + 1
union all
select cycle.organization_id, cycle.facility_id,
  pg_temp.sample_work_id(cycle.order_id::text || ':demo-cycle:' || cycle.cycle_number || ':packaging'),
  pg_temp.sample_work_id(cycle.order_id::text || ':demo-loading')
from demo_wings_work_cycles cycle where cycle.cycle_number = cycle.mixing_days
union all
select order_record.organization_id, order_record.facility_id,
  pg_temp.sample_work_id(demo.id::text || ':demo-loading'),
  pg_temp.sample_work_id(demo.id::text || ':demo-pickup')
from demo_wings_orders demo join public.customer_orders order_record on order_record.id = demo.id;

insert into demo_wings_dependency_edges(organization_id, facility_id, predecessor_id, successor_id)
select order_record.organization_id, order_record.facility_id,
  pg_temp.sample_work_id(demo.id::text || ':demo-purchase-receiving'),
  pg_temp.sample_work_id(demo.id::text || ':demo-cycle:1:ingredient_prep')
from demo_wings_orders demo
join demo_order_purchase_requests request on request.material_plan_id = demo.id
join public.customer_orders order_record on order_record.id = demo.id;

insert into public.work_order_dependencies(organization_id, facility_id, predecessor_id, successor_id, created_by)
select organization_id, facility_id, predecessor_id, successor_id,
  '10000000-0000-4000-8000-000000000001'
from demo_wings_dependency_edges
on conflict (predecessor_id, successor_id) do nothing;

insert into public.workforce_schedule_event_dependencies(organization_id, facility_id, predecessor_id, successor_id, created_by)
select organization_id, facility_id, predecessor_id, successor_id,
  '10000000-0000-4000-8000-000000000001'
from demo_wings_dependency_edges
on conflict (predecessor_id, successor_id) do nothing;

insert into public.workforce_work_queue_history(
  organization_id, facility_id, queue_item_id, action, actor_user_id, after_data
)
select work.organization_id, work.facility_id, work.id, 'claimed',
  '10000000-0000-4000-8000-000000000001',
  to_jsonb(work) || jsonb_build_object('worker_id', claim.worker_id, 'claim_source', claim.claim_source)
from public.workforce_work_queue_items work
join public.workforce_work_queue_claims claim on claim.queue_item_id = work.id
where work.id in (select predecessor_id from demo_wings_dependency_edges union select successor_id from demo_wings_dependency_edges)
and not exists (select 1 from public.workforce_work_queue_history history
  where history.queue_item_id = work.id and history.action = 'claimed');

set local role authenticated;
select public.publish_workforce_schedule(jsonb_build_object(
  'facility_id', public.current_facility(),
  'revision', coalesce((select max(revision) from public.workforce_publications
    where facility_id = public.current_facility()), 0)
));
reset role;
-- END FULL LOCAL DEMO WORK ORDERS
commit;
