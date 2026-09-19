# Salad Soulmates — Build Specification

**Version:** 1.1  
**Date:** September 18, 2026  
**Status:** Approved for implementation planning  
**Source of truth:** `Salad_Soulmates_PRD_v2.2.md` plus confirmed requirements from the September 18, 2026 working session  
**Primary audience:** Codex / software engineering / product review  
**Build target:** Gated staging increments through scheduling, receiving/serialization, and Spanish worker mobile digital Batch Worksheet execution

---

## 1. Purpose

This specification converts the Salad Soulmates PRD into an implementation-ready build delivered in gated increments. The build must prove both sides of the operating model: the administrator's order/planning/inventory/scheduling workflow and the floor worker's very simple Spanish phone experience that will replace the paper Batch Worksheet once serialized receiving is available.

The build establishes this connected chain with persistent data:

`Customer Order`  
`-> Required Finished Gallons`  
`-> Planned 40-Gallon Mixer Batches`  
`-> Exactly One Planned Spice Bucket per Mixer Batch`  
`-> Released Recipe Requirements`  
`-> Inventory Availability / Purchasing`  
`-> Scheduled Work / Assigned Worker`  
`-> Received + Serialized Supplier Ingredient`  
`-> Spanish Worker Mobile Spice Prep / Batch Execution`  
`-> Source-Lot Genealogy`

Holding-tank packaging, bag labels, shipping and recall workspace remain subsequent increments, but the schema and worker execution created here must make those additions straightforward.

---

## 2. Build principles

1. **Build the approved workflow, not every future module.** Future navigation may be visible only when useful for orientation; nonimplemented workflows must not appear functional.
2. **Order-driven planning is the primary operating model.** Salad Soulmates generally purchases ingredients to satisfy customer demand rather than maintaining a large warehouse stock.
3. **Inventory must still be visible and auditable.** Current balance may be small, but the system must distinguish usable stock, commitments, inbound material, and projected shortages.
4. **Recipes are operational master data.** Planning calculations must use a released immutable recipe version.
5. **40 gallons is the current standard mixer batch.** Each planned mixer batch creates exactly one planned spice-prep record/bucket.
6. **Do not hard-code supplier packaging math.** Supplier pack sizes and conversions are configuration.
7. **Scheduling is part of the operational backbone.** Production plans must be assignable to real workers with PTO/conflict checks and publish behavior.
8. **Worker mobile is a separate product experience.** Production workers use a phone, Spanish is required, and floor screens must be radically simpler than administrator screens.
9. **The application must be responsive.** Administrators can perform authorized tasks on desktop and phone; workers see only their task-focused mobile UI.
10. **Build in gated staging increments.** Planning/scheduling ships to staging before serialized receiving; live mobile Batch Worksheet execution is enabled only after source material can be serialized/validated.
11. **Feedback is part of staging.** Reviewers must be able to comment from any screen without emailing screenshots.
12. **Every calculation and operational genealogy link must be explainable.**

---

## 3. Build increments and committed scope

The application remains incremental. Scheduling and worker mobile are now committed requirements, but live source-lot scanning must follow serialized receiving so the system never simulates genealogy it cannot actually validate.

### Increment 1A — Foundation, planning, inventory, purchasing, scheduling, worker schedule

Includes:

- authentication, organization/facility and RLS foundation;
- administrator and worker roles;
- Products, Ingredients, Allergens, Suppliers and Supplier Items/pack configuration;
- Recipes, immutable Released Recipe Versions, sections/stages and controlled operator instructions;
- Employees, normal availability and PTO;
- Customer Orders and Order Lines;
- Production Plans;
- calculated 40-gallon planned mixer batches;
- exactly equal planned spice-prep count;
- Material Requirements;
- basic event-based Inventory visibility and planning inbound;
- inventory commitments, shortage calculation and supplier pack rounding;
- draft Purchase Recommendations;
- administrator week/day scheduling;
- schedule assignments linked to product/plan/lot/batch/spice-prep/order where available;
- draft/publish scheduling and conflict validation;
- worker phone login and **Mi horario** in Spanish;
- worker task detail shell showing product/lot/batch/spice bucket and **Comenzar**;
- approved Spanish display names/instructions foundation;
- dashboard/home, Feedback drawer/Inbox, audit events and sample data.

Increment 1A does **not** post real production ingredient usage because serialized physical source material does not exist yet.

### Increment 1B — Receiving, supplier lots and serialization

Includes:

- supplier receiving workflow;
- supplier lot and receipt history;
- serialized physical ingredient package/container records;
- use existing supplier barcode when uniquely appropriate;
- Salad Soulmates barcode/label when an internal serial is required;
- partially used package balance;
- hold/quarantine/expired states;
- receiving updates the inventory ledger;
- phone receiving flow for authorized users.

### Increment 1C — Spanish worker mobile digital Batch Worksheet replacement

Includes:

- early production-lot assignment using `DDDYY`;
- scheduled/assigned mixer-batch + one-to-one spice-prep work;
- worker opens assigned work directly from **Mi horario**;
- Spanish-first phone UI at 390px with one primary action per step;
- context identifies Product, Lot, `Mezcla X de N — 40 gal`, and `Cubeta de especias X`;
- scan batch/spice context once where required;
- recipe-line progression with required measurement and approved Spanish ingredient display name;
- scan serialized source ingredient packages;
- validate expected ingredient, status, availability and duplicate use;
- record actual quantity/source contribution;
- support more than one serialized package/lot for one recipe line;
- **Agregado**, progress, **Continuar**, **Necesito ayuda**, and **Completar cubeta** states;
- spice-prep readiness;
- mixer execution/QC/signoff;
- transfer completed 40-gallon batch to a holding-tank session/context;
- resume interrupted work without losing state;
- operational completion can close the linked schedule assignment; calendar completion alone never posts inventory;
- audit/history for scans, corrections and completion.

### Explicitly later than Increment 1C

- finished 1-gallon bag packaging transactions;
- 4-bag case execution/serialization;
- bag label printing;
- shipping/fulfillment;
- trace/recall workspace and quarantine workflow across finished goods;
- QuickBooks integration;
- supplier EDI/API and automated PO transmission;
- advanced forecasting beyond explicit order demand;
- regulatory label-compliance generation.

## 4. Confirmed business rules that must shape the schema now

These rules are not all executed in Milestone 1, but the first schema must not make them difficult to add later.

### 4.1 Product lot

- Customer-facing lot format is `DDDYY`.
- Lot is assigned early in the production day before dressing is mixed.
- Example: September 18, 2026 -> `26126`.
- Lot code is not a database primary key.
- Product + Lot Number is the practical customer-facing recall key because more than one product can share the same date-based lot.

### 4.2 Mixer batch

- Current standard mixer batch size is **40 gallons**.
- Planned batch count is calculated before production.
- Mixer batches require unique internal IDs and a sequence within a product/lot/plan.

### 4.3 Spice-prep relationship

Confirmed invariant:

`1 planned 40-gallon mixer batch = 1 spice-prep bucket`

Therefore:

- one planned mixer batch has exactly one planned spice-prep record;
- one spice-prep record belongs to exactly one planned mixer batch;
- future serialized ingredient scans will attach to the spice-prep/batch context.

### 4.4 Holding tank and packaging

Future production must support:

- completed 40-gallon mixer batches transferred to a holding tank;
- holding tank retaining genealogy from all contributing mixer batches;
- finished product packaged in **1-gallon bags**;
- **4 bags per case**;
- bag label containing at minimum Product Name, controlled Ingredient Statement, and Lot Number.

The Product model must therefore include configurable packaging and label-profile fields even though finished packaging execution remains later than Increment 1C.

---

## 5. Open assumptions — do not silently convert these into confirmed behavior

The application should expose these as configurable or keep them behind a clearly identified assumption until confirmed.

### A-01 Batch rounding rule

**Proposed Milestone 1 default:**

`planned_batches = CEILING(required_gallons / 40)`

This is an implementation assumption. Salad Soulmates has confirmed the 40-gallon standard but has not yet confirmed how partial demand, planned overage, expected waste, or partial batches are handled.

Implementation requirement:

- calculate the default using ceiling;
- show required gallons, planned gallons, and overage separately;
- allow an authorized admin to override planned batch count with a required reason;
- never change the source customer demand when batch count is overridden.

### A-02 Inbound inventory

Receiving is not built yet. For Milestone 1, inbound quantities may be entered manually as planning records with supplier, ingredient, expected date, quantity, and status.

Only inbound records in `Confirmed` status count toward shortage calculations.

### A-03 Inventory consumption timing

Actual ingredient consumption will later occur during digital spice prep / mixer execution. Milestone 1 performs **planning commitments only**. Generating a production plan must not post actual consumption.

### A-04 Purchase order transmission

Milestone 1 may create a **PO Draft / Purchase Recommendation** record but must not send an order to a supplier.

---

## 6. Users and authorization

### Administrator / Manager

Can manage master data, orders, plans, inventory/purchasing, employees, PTO, schedules, receiving oversight, production oversight and feedback according to role permissions.

### Worker / Spice-prep / Production operator

Primary device is a phone. Worker experience is Spanish-first and task-focused.

Worker can:

- sign in;
- see only their own published schedule and their own PTO/unavailability;
- open the exact assigned production task;
- execute authorized spice-prep/mixer steps;
- scan serialized source ingredients;
- confirm quantities and completion;
- request help/report a problem;
- switch to English if enabled without losing task state.

Worker cannot:

- browse unrelated customer orders, financial data or other workers' assignments;
- change released recipes;
- override blocked/held source material unless separately granted an authorized supervisor permission;
- edit inventory balances directly.

### Receiver

Authorized receiving users can capture receipts/supplier lots and serialize packages on phone/tablet.

### Authorization requirement

RLS and server-side authorization must enforce organization, role and ownership/assignment boundaries. Worker access to production data should be scoped to information necessary for their assigned work.

## 7. Navigation and route map

Use a stable app shell with a left navigation on desktop and a compact mobile navigation pattern.

### 7.1 Administrator navigation

- Home
- Products
- Ingredients
- Recipes
- Orders
- Planning
- Inventory
- Purchasing
- Schedule
- Team & PTO
- Receiving (enabled in Increment 1B)
- Production (enabled in Increment 1C)
- Feedback

Do not show an enabled operational module before its build increment is ready.

### 7.2 Worker mobile navigation

- **Mi horario**
- **Trabajo actual** when a task is active
- **Necesito ayuda**
- profile/language as needed

No administrator module navigation is exposed to worker roles.

### 7.3 Required routes/screens

#### Authentication

- `/login`
- `/auth/callback`

#### Home

- `/app`

#### Products

- `/app/products`
- `/app/products/new`
- `/app/products/[productId]`
- `/app/products/[productId]/edit`
- `/app/products/[productId]/label-preview`

#### Ingredients

- `/app/ingredients`
- `/app/ingredients/new`
- `/app/ingredients/[ingredientId]`
- `/app/ingredients/[ingredientId]/edit`
- `/app/ingredients/[ingredientId]/inventory`

#### Suppliers

Suppliers may be accessed from ingredient detail and/or Settings rather than primary navigation.

- `/app/suppliers`
- `/app/suppliers/new`
- `/app/suppliers/[supplierId]`
- `/app/suppliers/[supplierId]/edit`
- `/app/supplier-items/[supplierItemId]/edit`

#### Recipes

- `/app/recipes`
- `/app/recipes/new`
- `/app/recipes/[recipeId]`
- `/app/recipes/[recipeId]/edit`
- `/app/recipes/[recipeId]/versions`
- `/app/recipe-versions/[recipeVersionId]`
- `/app/recipe-versions/[recipeVersionId]/batch-preview`

#### Customers and Orders

- `/app/orders`
- `/app/orders/new`
- `/app/orders/[orderId]`
- `/app/orders/[orderId]/edit`

Customer maintenance can be contextual:

- `/app/customers`
- `/app/customers/[customerId]`

#### Planning

- `/app/planning`
- `/app/planning/new`
- `/app/planning/[planId]`
- `/app/planning/[planId]/requirements`

#### Inventory

- `/app/inventory`
- `/app/inventory/[ingredientId]`
- `/app/inventory/[ingredientId]/adjust`
- `/app/inbound/new`
- `/app/inbound/[inboundId]/edit`

#### Purchasing

- `/app/purchasing`
- `/app/purchasing/[planId]`
- `/app/purchase-drafts/[purchaseDraftId]`

#### Scheduling / Team

- `/app/schedule`
- `/app/schedule/day/[date]`
- `/app/schedule/work/new`
- `/app/schedule/work/[scheduledWorkId]`
- `/app/team`
- `/app/team/[employeeId]`
- `/app/team/[employeeId]/availability`
- `/app/pto/new`
- `/app/pto/[ptoId]/edit`

#### Receiving — Increment 1B

- `/app/receiving`
- `/app/receiving/new`
- `/app/receipts/[receiptId]`
- `/app/serialized-units/[serializedUnitId]`

#### Worker mobile

- `/worker`
- `/worker/task/[assignmentId]`
- `/worker/spice/[spicePreparationId]` — Increment 1C
- `/worker/mix/[mixerBatchId]` — Increment 1C
- `/worker/help`

#### Feedback

- `/app/feedback`
- persistent Feedback drawer available from every authenticated staging screen; worker production UI may use a smaller review-only feedback affordance in staging so it does not compete with operational actions

---

## 8. UX and visual implementation requirements

The high-fidelity Salad Soulmates mockups are the visual target.

### 8.1 Administrator experience

- preserve the premium clean/family-owned/natural visual system from the approved mockups;
- desktop may use dense operational tables and a week schedule board;
- admin mobile uses lists/cards and staged forms instead of horizontal tables;
- scheduling must support keyboard/touch alternatives to drag/drop.

### 8.2 Worker phone experience — required

- primary acceptance viewport: 390px wide;
- Spanish is required and is the default initial worker locale;
- one primary action per step;
- minimum 48px touch targets;
- no dense tables or admin dashboards;
- worker home begins with **Mi horario** and today's assignments;
- task header always shows Product, Lot, `Mezcla X de N — 40 gal`, and `Cubeta de especias X` where relevant;
- show progress such as **Ingrediente 3 de 9**;
- primary actions use short language: **Comenzar**, **Escanear ingrediente**, **Agregado**, **Continuar**, **Completar cubeta**;
- **Necesito ayuda** remains available without allowing the worker to bypass a blocking validation;
- approved Spanish ingredient display names and instructions come from controlled master data; do not use live machine translation for production instructions;
- language switching, refresh or temporary navigation must preserve current task state;
- lot IDs, barcodes, numeric values and units are never translated/altered;
- scan failures have controlled manual entry with reason when permitted.

### 8.3 Scheduling interaction

- week board: employees x days, with published/draft visual distinction;
- day/list view for smaller screens;
- click/tap empty slot to create work;
- open task to edit/reassign;
- drag/drop may be offered on desktop but cannot be the only method;
- conflict/PTO error must identify the affected employee/time and prevent save/publish;
- workers see only published assignments.

### 8.4 Brand direction

The application should feel:

- clean;
- natural;
- family-owned;
- premium but approachable;
- organic/fresh;
- operationally serious without looking industrial.

### 8.5 Proposed design tokens

These are implementation starting points derived from the approved mockup direction and may be refined during front-end build:

- background: warm cream/off-white;
- primary: deep botanical green;
- secondary: muted sage;
- text: charcoal/green-black;
- success: soft green;
- warning: warm amber;
- error/shortage: muted red;
- borders: warm gray/green-gray;
- large serif display font for page titles;
- readable sans-serif for application controls/data;
- handwritten/script accents are decorative only and must never carry critical information.

### 8.6 Interaction standards

- tables on desktop; stacked list/detail patterns on narrow mobile screens;
- minimum 44px touch targets, target 48px where practical;
- every destructive/deactivating action requires confirmation;
- save actions show success/error state;
- unsaved recipe/order changes warn before navigation;
- search/filter state should be reflected in URL query parameters when practical;
- no critical status may rely on color alone;
- loading, empty, error, and no-permission states are required for every primary screen;
- future features shown in staging must be labeled `Coming next` or `Preview`.

### 8.7 No screenshot-as-UI implementation

Do not use the generated high-fidelity mockup images as page backgrounds. Recreate the approved layout as responsive HTML/CSS/components using real data.

---

## 8.8 Scheduling and localization data requirements

Add the following tables/entities in Increment 1A:

- `employees` — organization/facility, user/profile link, display name, role, active;
- `employee_availability` — weekday/date-specific availability windows;
- `pto_blocks` — employee, date/time range, private admin note, status;
- `scheduled_work` — activity type, start/end, facility, linked entity type/id, instructions, status;
- `work_assignments` — scheduled work + employee, assignment status, worker timestamps;
- `schedule_revisions` — draft/published revision metadata and audit references;
- `user_preferences` — locale and worker UI preferences;
- `ingredient_translations` — approved Spanish worker display name where needed;
- `instruction_translations` or equivalent controlled localized text for recipe/task instructions.

Required database invariants/validation:

- overlapping published assignments for the same employee are rejected;
- assignments overlapping approved PTO are rejected;
- published schedule revision remains worker-visible while a new draft revision is edited;
- worker queries are limited to their own assignments;
- deleting/deactivating an employee preserves historical assignments;
- operational task IDs are stable links, not copied free-text references.

## 9. Technical architecture

### 9.1 Frontend/application

- Next.js, latest stable release at implementation time;
- TypeScript with strict mode enabled;
- server-rendered application where appropriate;
- accessible reusable component library or primitives;
- schema-based form validation;
- no separate native mobile application in this milestone.

### 9.2 Hosting

- **Vercel** hosts the Next.js application.

Environments:

- local development;
- Vercel preview deployments per pull request;
- staging;
- production environment created/configured separately when approved.

### 9.3 Database/auth/storage

- **Supabase PostgreSQL**;
- Supabase Auth;
- Supabase Storage reserved for future product/ingredient imagery and documents;
- Row Level Security enabled;
- database migrations checked into source control.

### 9.4 Source control

- GitHub repository;
- protected main branch;
- pull-request workflow;
- CI runs type checking, linting, unit tests, and critical integration tests.

### 9.5 Application structure

Suggested structure:

```text
src/
  app/
    (auth)/
    app/
  components/
    shell/
    forms/
    tables/
    feedback/
    recipes/
    planning/
    inventory/
  domain/
    products/
    ingredients/
    recipes/
    orders/
    planning/
    inventory/
    purchasing/
  lib/
    supabase/
    validation/
    calculations/
    audit/
  db/
    migrations/
    seed/
  tests/
```

Keep business calculations in domain modules and tests, not embedded in React components.

---

## 10. Organization and authorization model

Even though the first customer is one company, the database must be organization-aware.

### 10.1 Base entities

#### `organizations`

- `id uuid pk`
- `name text`
- `slug text unique`
- `created_at timestamptz`
- `updated_at timestamptz`

#### `facilities`

- `id uuid pk`
- `organization_id uuid fk`
- `name text`
- `timezone text` default initial facility timezone `America/Chicago`
- `active boolean`
- timestamps

#### `profiles`

- `id uuid pk` = auth user id
- `organization_id uuid fk`
- `facility_id uuid nullable fk`
- `display_name text`
- `role text`
- `active boolean`
- timestamps

Milestone 1 roles:

- `admin`
- `reviewer` optional for staging

Future roles should not require schema redesign.

### 10.2 RLS baseline

Every organization-owned table includes `organization_id`.

Policies must ensure:

- user can read/write only records belonging to their organization;
- reviewer can read staging data and submit feedback but cannot mutate operational master/transaction data unless explicitly allowed;
- service-role credentials are never exposed to the browser.

---

## 11. Data model — master data

### 11.1 `allergens`

- `id uuid pk`
- `organization_id uuid fk`
- `code text`
- `name text`
- `active boolean`
- unique `(organization_id, code)`

Seed examples supported by current paper trail:

- Milk
- Egg
- Soy
- Fish

Do not assume this list is complete.

### 11.2 `ingredients`

- `id uuid pk`
- `organization_id uuid fk`
- `name text`
- `internal_code text nullable`
- `category text nullable`
- `default_uom text`
- `description text nullable`
- `storage_notes text nullable`
- `traceability_mode text` default `future_required`
- `active boolean`
- timestamps
- unique normalized name within organization where practical

### 11.3 `ingredient_allergens`

- `ingredient_id uuid fk`
- `allergen_id uuid fk`
- primary key `(ingredient_id, allergen_id)`

### 11.4 `suppliers`

- `id uuid pk`
- `organization_id uuid fk`
- `name text`
- `contact_name text nullable`
- `email text nullable`
- `phone text nullable`
- `lead_time_days integer nullable`
- `active boolean`
- timestamps

### 11.5 `supplier_items`

Represents how an ingredient is purchased from a specific supplier.

- `id uuid pk`
- `organization_id uuid fk`
- `supplier_id uuid fk`
- `ingredient_id uuid fk`
- `supplier_sku text nullable`
- `supplier_item_name text nullable`
- `purchase_uom text` — e.g. `pail`, `bag`, `case`, `each`
- `pack_quantity numeric` — number of base units represented by one purchase unit
- `pack_quantity_uom text` — e.g. `lb`, `gal`, `each`
- `units_per_case numeric nullable`
- `case_inner_uom text nullable`
- `is_preferred boolean`
- `active boolean`
- `notes text nullable`
- timestamps

Example representation:

- Honey: one pail = 60 lb
- Sugar: one bag = 50 lb
- Mayonnaise: one pail = 30 lb

Pack examples are configuration/test data until verified with Salad Soulmates.

### 11.6 `products`

- `id uuid pk`
- `organization_id uuid fk`
- `name text`
- `product_code text nullable`
- `description text nullable`
- `standard_batch_gallons numeric` default `40`
- `bag_size_gallons numeric` default `1`
- `bags_per_case integer` default `4`
- `approved_ingredient_statement text nullable`
- `active boolean`
- timestamps

### 11.7 `recipes`

- `id uuid pk`
- `organization_id uuid fk`
- `product_id uuid fk`
- `name text`
- `active_version_id uuid nullable` populated after release
- timestamps

### 11.8 `recipe_versions`

- `id uuid pk`
- `organization_id uuid fk`
- `recipe_id uuid fk`
- `version_number integer`
- `status text` — `Draft | Released | Retired`
- `target_yield_gallons numeric`
- `notes text nullable`
- `effective_at timestamptz nullable`
- `released_at timestamptz nullable`
- `released_by uuid nullable`
- `source_version_id uuid nullable`
- timestamps
- unique `(recipe_id, version_number)`

Rule: once `status = Released`, formulation fields and recipe lines are immutable. Corrections require a new version.

### 11.9 `recipe_sections`

- `id uuid pk`
- `organization_id uuid fk`
- `recipe_version_id uuid fk`
- `name text nullable`
- `sequence integer`

This supports the multiple formula blocks observed in the paper batch worksheets.

### 11.10 `recipe_lines`

- `id uuid pk`
- `organization_id uuid fk`
- `recipe_version_id uuid fk`
- `recipe_section_id uuid nullable fk`
- `ingredient_id uuid fk`
- `sequence integer`
- `display_measurement text`
- `normalized_quantity numeric nullable`
- `normalized_uom text nullable`
- `pounds_equivalent numeric nullable`
- `operator_note text nullable`
- timestamps

`display_measurement` preserves instructions such as `7 cups`, `2 gallons`, `30 pkgs`, or `5 cs + 10 lbs`.

Planning calculations use the validated normalized quantity/UOM, never parsed free text.

### 11.11 `recipe_qc_rules`

Foundation only; edit/display may be included if easy, execution is future.

- `id uuid pk`
- `organization_id uuid fk`
- `recipe_version_id uuid fk`
- `name text`
- `min_value numeric nullable`
- `max_value numeric nullable`
- `uom text nullable`
- `instructions text nullable`
- `sequence integer`

---

## 12. Data model — customer demand

### 12.1 `customers`

- `id uuid pk`
- `organization_id uuid fk`
- `name text`
- `customer_code text nullable`
- `active boolean`
- timestamps

Seed examples:

- Jason's Deli
- Wings and More

### 12.2 `customer_orders`

- `id uuid pk`
- `organization_id uuid fk`
- `customer_id uuid fk`
- `order_number text`
- `requested_date date`
- `due_date date`
- `status text` — `Draft | Confirmed | Planned | Cancelled`
- `priority text nullable`
- `customer_reference text nullable`
- `notes text nullable`
- timestamps
- unique `(organization_id, order_number)`

### 12.3 `customer_order_lines`

- `id uuid pk`
- `organization_id uuid fk`
- `order_id uuid fk`
- `product_id uuid fk`
- `requested_gallons numeric`
- `notes text nullable`
- timestamps

Milestone 1 order demand is entered in gallons. Additional customer ordering units may be added later.

---

## 13. Data model — planning

### 13.1 `production_plans`

- `id uuid pk`
- `organization_id uuid fk`
- `facility_id uuid fk`
- `name text`
- `period_start date`
- `period_end date`
- `status text` — `Draft | Confirmed | Superseded`
- `generated_at timestamptz`
- `generated_by uuid`
- `calculation_version text`
- timestamps

### 13.2 `production_plan_order_lines`

Links source demand to the plan.

- `production_plan_id uuid fk`
- `order_line_id uuid fk`
- `included_gallons numeric`
- primary key `(production_plan_id, order_line_id)`

### 13.3 `production_plan_products`

One calculated row per product in a plan.

- `id uuid pk`
- `organization_id uuid fk`
- `production_plan_id uuid fk`
- `product_id uuid fk`
- `recipe_version_id uuid fk`
- `required_gallons numeric`
- `standard_batch_gallons numeric`
- `calculated_batch_count integer`
- `planned_batch_count integer`
- `planned_gallons numeric`
- `overage_gallons numeric`
- `override_reason text nullable`
- timestamps

### 13.4 `planned_mixer_batches`

Create explicit planned records now so future production execution does not require a migration from an aggregate count.

- `id uuid pk`
- `organization_id uuid fk`
- `production_plan_product_id uuid fk`
- `sequence integer`
- `target_gallons numeric` default `40`
- `status text` — Milestone 1 `Planned`; future statuses added later
- timestamps
- unique `(production_plan_product_id, sequence)`

### 13.5 `planned_spice_preparations`

Enforces the confirmed 1:1 relationship.

- `id uuid pk`
- `organization_id uuid fk`
- `planned_mixer_batch_id uuid fk unique`
- `status text` default `Planned`
- timestamps

Every planned mixer batch must receive one planned spice-prep row in the same database transaction.

### 13.6 `material_requirements`

Snapshot requirements produced by one plan calculation.

- `id uuid pk`
- `organization_id uuid fk`
- `production_plan_id uuid fk`
- `ingredient_id uuid fk`
- `required_quantity numeric`
- `required_uom text`
- `calculation_detail jsonb`
- timestamps
- unique `(production_plan_id, ingredient_id, required_uom)` where appropriate

`calculation_detail` records which plan product / recipe lines contributed to the total so the UI can explain the number.

---

## 14. Inventory ledger and planning availability

Do not store a single editable `on_hand` value as the source of truth.

### 14.1 `inventory_events`

- `id uuid pk`
- `organization_id uuid fk`
- `facility_id uuid fk`
- `ingredient_id uuid fk`
- `event_type text`
- `quantity_delta numeric`
- `uom text`
- `effective_at timestamptz`
- `reason_code text nullable`
- `reason_note text nullable`
- `source_type text nullable`
- `source_id uuid nullable`
- `created_by uuid`
- `reversal_of_id uuid nullable`
- timestamps

Milestone 1 event types:

- `OpeningBalance`
- `Adjustment`
- `PlanCommitment`
- `PlanCommitmentRelease`

Future event types:

- `Receipt`
- `Usage`
- `Move`
- `Hold`
- `Release`
- `Disposal`
- `Return`

### 14.2 Commitment model

Planning commitments are not physical consumption.

Recommended approach:

- maintain plan commitments as ledger events or a dedicated allocation table;
- available inventory excludes active commitments;
- superseding/cancelling a plan reverses/releases its commitment;
- plan recalculation must be idempotent and must not duplicate commitments.

A dedicated table is acceptable if it makes correctness clearer:

#### `inventory_commitments`

- `id uuid pk`
- `organization_id uuid fk`
- `production_plan_id uuid fk`
- `ingredient_id uuid fk`
- `quantity numeric`
- `uom text`
- `status text` — `Active | Released`
- timestamps

If this table is used, `PlanCommitment` need not also change owned on-hand quantity.

### 14.3 `inbound_materials`

Temporary planning object until receiving is implemented.

- `id uuid pk`
- `organization_id uuid fk`
- `ingredient_id uuid fk`
- `supplier_item_id uuid nullable fk`
- `expected_date date`
- `quantity numeric`
- `uom text`
- `status text` — `Draft | Confirmed | Cancelled | Received`
- `reference text nullable`
- `notes text nullable`
- timestamps

Only `Confirmed` inbound material counts in shortage calculations.

### 14.4 Inventory calculated fields

For each ingredient/facility:

- `on_hand` = sum of owned-stock inventory events;
- `committed` = sum of active planning commitments;
- `available` = on_hand - committed;
- `confirmed_inbound` = confirmed inbound due within the plan horizon or explicitly included in the plan;
- `required_for_plan` = material requirement for selected plan;
- `projected_remaining_after_plan` = on_hand + confirmed_inbound - required_for_plan - commitments from other active plans as applicable;
- `shortage` = `MAX(0, -projected_remaining_after_plan)`.

The implementation must avoid subtracting the selected plan twice when commitments and requirements are both displayed. Calculations must have unit tests.

---

## 15. Purchasing recommendation model

### 15.1 `purchase_recommendations`

Generated from a plan; not a transmitted purchase order.

- `id uuid pk`
- `organization_id uuid fk`
- `production_plan_id uuid fk`
- `ingredient_id uuid fk`
- `supplier_item_id uuid fk`
- `raw_shortage_quantity numeric`
- `raw_shortage_uom text`
- `purchase_unit text`
- `pack_quantity numeric`
- `pack_quantity_uom text`
- `recommended_purchase_units numeric`
- `recommended_base_quantity numeric`
- `override_purchase_units numeric nullable`
- `override_reason text nullable`
- `status text` — `Recommended | Reviewed | Drafted | Dismissed`
- timestamps

### 15.2 Supplier-item selection

Default selection order:

1. active preferred supplier item for the ingredient;
2. if none, exactly one active supplier item may be selected automatically;
3. if multiple active supplier items exist with no preferred item, user must select one before a recommendation can be finalized.

### 15.3 Recommendation formula

When supplier pack is compatible with the ingredient requirement base UOM:

```text
raw_shortage = max(0, required - usable_supply)
recommended_purchase_units = ceil(raw_shortage / pack_quantity)
recommended_base_quantity = recommended_purchase_units * pack_quantity
```

Display:

- raw shortage;
- pack configuration used;
- recommended whole purchase units;
- resulting purchased base quantity;
- expected overage from pack rounding.

Never silently convert between mass and volume unless a validated conversion exists in controlled configuration.

---

## 16. Required business calculations

All calculations live in testable domain functions.

### 16.1 Planned batch count

Proposed default pending final business confirmation:

```text
calculated_batch_count = ceil(required_gallons / standard_batch_gallons)
planned_batch_count = admin override if provided, otherwise calculated_batch_count
planned_gallons = planned_batch_count * standard_batch_gallons
overage_gallons = planned_gallons - required_gallons
spice_bucket_count = planned_batch_count
```

Invariant:

```text
count(planned_spice_preparations) == count(planned_mixer_batches)
```

### 16.2 Recipe material requirement

For each plan product:

```text
ingredient_requirement_for_product =
  recipe_line.normalized_quantity * planned_batch_count
```

Aggregate by ingredient and normalized UOM across all plan products.

If a released recipe line lacks a normalized quantity required for planning, plan generation must stop for that product and show a clear configuration error. Do not parse `display_measurement` to guess a normalized value.

### 16.3 Shortage

Use a calculation function that accepts:

- material requirement;
- usable on-hand;
- other active commitments;
- confirmed inbound;
- selected plan's existing commitment state.

Return a structured result including each component so UI and audit logs can explain the value.

---

## 17. Application workflows

### 17.1 Set up an ingredient

1. Admin selects **Add Ingredient**.
2. Enters name, default UOM, optional category/description/storage notes.
3. Selects allergen flags.
4. Saves.
5. Adds one or more Supplier Items with purchase pack configuration.
6. Marks preferred supplier item when applicable.
7. Optionally posts an opening balance via inventory adjustment screen.

Acceptance: ingredient appears in Ingredients and Inventory; supplier pack data is available to purchasing calculations.

### 17.2 Create and release a recipe

1. Admin creates product or selects existing product.
2. Creates recipe Draft.
3. Adds ordered sections/stages.
4. Adds ingredient lines with display measurement and normalized quantity/UOM.
5. Reviews allergens.
6. Sets target yield = 40 gallons for current standard recipe where appropriate.
7. Previews future digital batch worksheet.
8. Releases recipe version.

Acceptance: released recipe is immutable and becomes eligible for production planning.

### 17.3 Enter a customer order

1. Select customer.
2. Enter order number/reference.
3. Enter requested/due date.
4. Add one or more product lines and requested gallons.
5. Confirm order.

Acceptance: confirmed line is eligible for inclusion in a production plan.

### 17.4 Generate a production plan

1. Admin selects date range or specific confirmed orders.
2. System groups demand by product.
3. Loads each product's active released recipe.
4. Calculates required gallons.
5. Calculates batch count using standard batch size.
6. Creates explicit planned mixer batch rows.
7. Creates exactly one planned spice-prep row for every planned mixer batch.
8. Calculates material requirements.
9. Compares requirements to inventory/inbound.
10. Shows shortages and purchasing recommendations.
11. Admin reviews and confirms plan.

Plan generation must be transactionally safe and idempotent.

### 17.5 Review inventory

Inventory list shows at minimum:

- ingredient;
- on hand;
- available;
- committed;
- inbound;
- projected remaining;
- shortage for selected/current plan;
- UOM;
- status.

Ingredient inventory detail shows:

- calculation explanation;
- recent inventory events;
- active commitments;
- inbound records;
- supplier pack options.

Serialized lot table is a **future placeholder** until receiving/serialization is built; do not populate fake live serialization records outside clearly labeled seed/demo data.

### 17.6 Review purchasing recommendations

1. Open selected production plan.
2. View requirements by ingredient.
3. For shortages, system chooses preferred supplier item when unambiguous.
4. System rounds shortage to whole supplier purchase units.
5. Admin can change supplier item or override purchase units with reason.
6. Admin marks recommendation Reviewed or creates a local PO Draft.
7. No external supplier transmission occurs.

---

## 18. Dashboard requirements

Home should answer four questions quickly:

1. What customer demand is open?
2. What production is planned?
3. What ingredients are at risk/short?
4. What needs attention next?

Recommended dashboard modules:

- Open Orders;
- Planned 40-gallon Batches;
- Ingredients in Stock / At Risk;
- Shortages to Review;
- Demand Snapshot;
- Production Plan summary;
- Low Inventory / Shortage list;
- Recent Activity.

Do not build decorative analytics that do not support an operational decision.

---

## 19. Feedback system for staging review

Feedback is enabled in staging and preview environments and may be disabled in production via environment configuration.

### 19.1 Persistent UI

- floating **Feedback** button on every authenticated page;
- opens a right-side drawer;
- current route/page captured automatically;
- if viewing an entity, capture entity type and ID automatically.

### 19.2 `feedback_items`

- `id uuid pk`
- `organization_id uuid fk`
- `submitted_by uuid nullable`
- `reviewer_name text nullable`
- `reviewer_email text nullable`
- `route text`
- `page_title text nullable`
- `entity_type text nullable`
- `entity_id uuid nullable`
- `comment text`
- `feedback_type text` — `Suggestion | Issue | Positive | Question`
- `priority text nullable` — `Low | Medium | High`
- `app_version text nullable`
- `viewport text nullable`
- `status text` — `New | Reviewed | Resolved | Won't Do`
- `resolution_note text nullable`
- timestamps

### 19.3 Reviewer experience

Feedback form should require only a comment. Name, email, type, and priority can be optional when authenticated context already identifies the reviewer.

After submit:

- show immediate confirmation;
- keep user on current page;
- do not reset application state.

### 19.4 Feedback Inbox

Admin `/app/feedback` supports:

- filter by screen;
- filter by type;
- filter by priority;
- filter by status;
- reviewer;
- date;
- open linked page/entity when possible;
- mark Reviewed/Resolved;
- add resolution note;
- export CSV.

---

## 20. Audit requirements

### 20.1 `audit_events`

- `id uuid pk`
- `organization_id uuid fk`
- `actor_user_id uuid nullable`
- `event_type text`
- `entity_type text`
- `entity_id uuid nullable`
- `summary text`
- `before_data jsonb nullable`
- `after_data jsonb nullable`
- `occurred_at timestamptz`

Audit at minimum:

- ingredient create/edit/deactivate;
- supplier pack change;
- recipe version release/retire;
- order confirm/cancel/edit after confirmation;
- production plan generation/confirmation/supersede;
- batch-count override;
- inventory adjustment;
- inbound create/change/cancel;
- purchase-recommendation override.

Do not log secrets, auth tokens, or sensitive credential material.

---

## 21. Server/API action contracts

Use server actions or typed API endpoints, but keep domain contracts explicit.

Required operations include:

### Master data

- `createIngredient`
- `updateIngredient`
- `deactivateIngredient`
- `createSupplier`
- `updateSupplier`
- `createSupplierItem`
- `updateSupplierItem`
- `createProduct`
- `updateProduct`

### Recipes

- `createRecipe`
- `createRecipeVersion`
- `updateDraftRecipeVersion`
- `duplicateRecipeVersion`
- `releaseRecipeVersion`
- `retireRecipeVersion`

### Orders

- `createOrder`
- `updateOrder`
- `confirmOrder`
- `cancelOrder`

### Inventory/inbound

- `postInventoryAdjustment`
- `createInboundMaterial`
- `updateInboundMaterial`
- `cancelInboundMaterial`

### Planning

- `previewProductionPlan`
- `generateProductionPlan`
- `recalculateProductionPlan`
- `overridePlanBatchCount`
- `confirmProductionPlan`
- `supersedeProductionPlan`

### Purchasing

- `calculatePurchaseRecommendations`
- `selectRecommendationSupplierItem`
- `overridePurchaseRecommendation`
- `createPurchaseDraft`

### Feedback

- `submitFeedback`
- `updateFeedbackStatus`
- `exportFeedbackCsv`

All write endpoints must:

- validate authenticated organization membership;
- validate input schema server-side;
- run multi-record changes in a database transaction when required;
- return structured domain errors suitable for user-visible messages.

---

## 22. Seed/test data

Staging must ship with obvious **SAMPLE DATA** so users can walk the full planning flow immediately.

### 22.1 Products

Use known product names from the supplied worksheets:

- Leo's Select Italian
- Balsamic Vinaigrette
- Honey Mustard
- Creamy Caesar
- Ranch
- WNM Ranch
- Gumby's Ranch

### 22.2 Customers

- Jason's Deli
- Wings and More

### 22.3 Ingredients

Use representative ingredients from the source worksheets, such as:

- Garlic
- Onion Powder
- Salt
- Red Pepper
- Black Pepper
- Xanthan Gum
- Buttermilk Solids
- Parmesan/Romano Cheese
- Soybean Oil
- White Vinegar
- Lemon Juice
- Honey
- Yogurt
- Mayonnaise
- Brown Sugar
- Worcestershire Sauce
- Hidden Valley Ranch Mix
- Potassium Sorbate
- Sodium Benzoate

### 22.4 Important seed-data warning

Do not represent photographed recipe quantities, suppliers, pack sizes, prices, or inventory balances as validated production master data unless Salad Soulmates explicitly confirms them.

The UI must display a staging/sample-data banner until production master data is intentionally loaded.

---

## 23. Acceptance test suite — Milestone 1

The following are release gates for the staging milestone.

### AT-01 Recipe immutability

**Given** Italian recipe v1 is Released  
**When** an admin wants to change Garlic quantity  
**Then** v1 remains unchanged and a new Draft version is created/edited.

### AT-02 Missing normalized recipe quantity

**Given** a Released recipe line has only free-text display measurement and no validated normalized quantity needed for planning  
**When** a plan attempts to use that recipe  
**Then** plan generation is blocked for that product with a clear configuration error.

### AT-03 Order to batches

**Given** confirmed demand for 80 gallons of a product with a 40-gallon standard batch  
**When** a plan is generated  
**Then** the plan creates 2 planned mixer batches.

### AT-04 Batch to spice-bucket invariant

**Given** a plan creates 2 planned mixer batches  
**Then** exactly 2 planned spice-prep records exist, each uniquely linked to one mixer batch.

### AT-05 Non-multiple demand

**Given** 90 gallons of demand and the provisional ceiling rule  
**When** the plan is previewed  
**Then** calculated batches = 3, planned gallons = 120, overage = 30 gallons  
**And** an admin may override batch count only with a recorded reason.

### AT-06 Material requirement

**Given** a released 40-gallon recipe requires 10 lb of Garlic  
**And** the plan contains 4 batches  
**Then** the material requirement includes 40 lb Garlic.

### AT-07 Inventory shortage

**Given** plan requirement = 180 lb  
**And** usable supply = 50 lb on hand + 60 lb confirmed inbound  
**Then** raw shortage = 70 lb.

### AT-08 Supplier pack rounding

**Given** raw shortage = 70 lb  
**And** preferred supplier pack = 30 lb/pail  
**Then** recommendation = 3 pails / 90 lb  
**And** the UI shows 20 lb expected overage from pack rounding.

### AT-09 Incompatible units

**Given** shortage is expressed in gallons  
**And** supplier pack is configured only in pounds with no validated conversion  
**Then** the system does not calculate a recommendation and asks for configuration/user resolution.

### AT-10 Inventory adjustment audit

**Given** an admin changes inventory through an adjustment  
**Then** the change requires a reason  
**And** an inventory event and audit event are stored  
**And** prior history remains visible.

### AT-11 Plan recalculation idempotency

**Given** a draft plan has already been calculated  
**When** Recalculate is clicked twice without data changes  
**Then** requirements, planned batches, spice-prep records, commitments, and purchase recommendations are not duplicated.

### AT-12 Plan supersede/release commitment

**Given** a confirmed plan has active inventory commitments  
**When** it is superseded/cancelled according to the allowed workflow  
**Then** its commitments are released exactly once.

### AT-13 Feedback context

**Given** a reviewer is on `/app/ingredients/{id}`  
**When** Feedback is submitted  
**Then** the record stores the route and ingredient ID automatically  
**And** the reviewer remains on the ingredient screen.

### AT-14 Mobile admin

At a 390px viewport, an administrator can complete the in-scope create/edit/review workflows without a desktop-only blocker or horizontal-table-only dependency.

### AT-15 Organization isolation

A user from organization A cannot read or write organization B records through UI or direct client requests.

---

### AT-16 Schedule publish visibility

**Given** an admin assigns Luis to a spice-prep/mixer task and saves it as draft  
**Then** Luis continues to see the previously published schedule  
**When** the admin publishes the revision  
**Then** the new assignment appears in Luis's **Mi horario** and not in another worker's schedule.

### AT-17 PTO conflict

**Given** Maria has approved PTO Thursday 08:00–17:00  
**When** an admin tries to assign overlapping work  
**Then** save/publish is blocked with a clear conflict and the PTO is not overridden silently.

### AT-18 Spanish worker schedule

At 390px width, a worker can sign in, read today's assignments in Spanish, open an assignment and identify Product, Lot, batch sequence, spice bucket and time without horizontal scrolling or administrator navigation.

### AT-19 Spanish production step state

**Given** a worker is on ingredient 3 of 9  
**When** the user switches between Spanish and English or refreshes the page  
**Then** the same assignment, ingredient, scans, quantities and completion state remain intact.

### AT-20 Correct source scan — Increment 1C

**Given** the worker is prompted for Garlic  
**When** a valid serialized Garlic package in Available status is scanned  
**Then** the serial/supplier lot is attached to that recipe line and the worker may confirm the addition.

### AT-21 Wrong/held source scan — Increment 1C

**Given** the worker is prompted for Garlic  
**When** a different ingredient or held/quarantined serialized unit is scanned  
**Then** the workflow blocks progression, explains the problem in Spanish and offers **Necesito ayuda**; it does not post inventory usage.

### AT-22 One-to-one batch/spice assignment

Every scheduled production task tied to a planned 40-gallon mixer batch references that batch's single spice-prep record. A spice-prep record cannot be assigned to a different mixer batch.

### AT-23 Calendar completion separation

Marking a schedule assignment complete without completing the linked production workflow does not consume inventory, create spice-material usage or complete the mixer batch.

## 24. Testing requirements

### 24.1 Unit tests

Required for:

- batch-count calculation;
- planned-gallons/overage calculation;
- recipe requirement multiplication;
- aggregation across products;
- inventory availability;
- shortage calculation;
- supplier pack rounding;
- incompatible UOM handling;
- recipe-version immutability guards.

### 24.2 Integration/database tests

Required for:

- RLS organization isolation;
- recipe release transaction;
- production plan generation;
- 1:1 mixer batch / spice-prep creation;
- recalculation idempotency;
- plan commitment release;
- inventory adjustment audit;
- purchase-recommendation generation.

### 24.3 End-to-end tests

Critical staging flows:

1. create ingredient + supplier pack;
2. create/release recipe;
3. create/confirm customer order;
4. generate plan;
5. review calculated batches/spice buckets;
6. review material requirements;
7. post sample opening inventory;
8. add confirmed inbound;
9. recalculate shortage;
10. review purchase recommendation;
11. submit feedback;
12. create employee availability/PTO;
13. assign and publish scheduled work;
14. verify worker sees only own published work in Spanish;
15. Increment 1B: receive and serialize a supplier ingredient package;
16. Increment 1C: open assigned spice task, scan correct source ingredients, complete spice bucket and linked mixer batch.

---

## 25. Performance targets

For Milestone 1 staging and initial production scale:

- ordinary page navigation should feel immediate on broadband connections;
- save mutation target: under 1 second server processing for typical records, excluding network latency;
- plan generation target: under 3 seconds for expected Salad Soulmates order/product volume;
- searchable/filterable list interactions should not require loading the entire history into the browser;
- schema/calculation choices should remain viable as inventory-event volume grows substantially in later phases.

Do not prematurely optimize for massive-enterprise volumes at the expense of correctness and maintainability.

---

## 26. Security and data integrity

- TLS in transit via managed hosting;
- managed encryption at rest through Supabase/Vercel providers;
- RLS on organization data;
- no service-role key in browser bundle;
- no secrets committed to GitHub;
- form validation on client for UX and server for authority;
- database constraints for critical invariants;
- multi-row planning/release operations use transactions;
- UUID primary keys;
- timestamps in UTC; display facility-local time where relevant;
- soft deactivate master data rather than hard-delete referenced records;
- released recipe versions are immutable;
- corrections use new versions/events rather than silent historical overwrite.

---

## 27. Observability

Milestone 1 should capture:

- application errors;
- failed server actions;
- failed plan calculations;
- calculation/configuration errors by entity ID;
- slow plan-generation requests;
- deployment version/commit identifier.

Do not log authentication secrets or unnecessary customer-sensitive data.

---

## 28. Deployment/environment specification

### 28.1 Local

- `.env.local` points to development Supabase project or local Supabase environment;
- seed script available;
- one-command setup documented.

### 28.2 Preview

- Vercel PR previews;
- preview database strategy must avoid changing staging/production master data accidentally;
- feedback may identify app version/commit.

### 28.3 Staging

- dedicated Supabase staging project;
- dedicated Vercel staging environment/domain;
- sample/test banner always visible;
- Feedback enabled;
- safe to reset/reseed with explicit admin operation.

### 28.4 Production

Do not enable production operations until:

- Milestone 1 staging acceptance tests pass;
- real Salad Soulmates master data is reviewed;
- auth/permissions are validated;
- backup/restore and migration process are documented;
- user explicitly approves production deployment.

---

## 29. Implementation epics and recommended order

### Epic 0 — Repository and platform foundation

- GitHub repository;
- Next.js/TypeScript scaffold;
- design system/theme;
- Supabase connection and migrations;
- auth/login;
- organization/facility/profile/RLS;
- role-aware app shells for admin vs worker;
- i18n framework with `en` and `es`;
- CI.

### Epic 1 — Ingredients, allergens, suppliers and pack sizes

- ingredient CRUD;
- approved Spanish ingredient display names;
- allergen relationships;
- supplier CRUD;
- supplier-item/pack configuration;
- ingredient detail;
- opening balance/manual adjustment;
- inventory-event history.

### Epic 2 — Products and recipes

- product CRUD;
- recipe/version CRUD;
- sections/stages;
- recipe lines and controlled instructions;
- Spanish instruction/display translation fields;
- release/version immutability;
- Batch Worksheet preview;
- label preview using controlled text only.

### Epic 3 — Employees, availability, PTO and scheduling

- employee/login linkage;
- normal availability;
- PTO blocks;
- week/day schedule;
- create/edit/reassign scheduled work;
- conflict validation;
- draft/publish revision behavior;
- link assignments to operational entities;
- admin mobile schedule list/forms.

### Epic 4 — Worker mobile shell in Spanish

- `/worker` **Mi horario**;
- today's/upcoming published assignments;
- task details in Spanish;
- **Comenzar** and **Necesito ayuda**;
- role isolation;
- locale persistence and safe language switching;
- state-resume infrastructure used later by production execution.

### Epic 5 — Customers and orders

- customer seed/maintenance;
- order CRUD;
- order-line gallons;
- confirm/cancel;
- demand list and filters.

### Epic 6 — Production planning engine

- plan preview;
- demand grouping;
- batch calculation and override;
- explicit planned mixer batches;
- 1:1 spice-prep creation;
- material-requirement calculation;
- schedule work suggestions;
- calculation explanation UI.

### Epic 7 — Inventory availability and purchasing

- inventory summary/views;
- commitments;
- planning inbound;
- availability/projected remaining;
- shortage calculation;
- supplier-pack rounding;
- purchase-draft records and screens.

### Epic 8 — Home dashboard + feedback

- operational dashboard from real queries;
- persistent staging Feedback drawer;
- Feedback Inbox/export.

### Increment 1A acceptance gate

Deploy staging and validate admin master data/planning/inventory/purchasing plus scheduling and Spanish worker **Mi horario** before enabling receiving or production scans.

### Epic 9 — Receiving and serialization — Increment 1B

- receipts/receipt lines;
- supplier lots;
- serialized ingredient units;
- barcode reuse/internal label generation;
- partial package balances;
- status/hold/expiration;
- inventory ledger receipt events;
- mobile receiving UI.

### Increment 1B acceptance gate

Prove that a physical/test supplier package can be received, uniquely identified, found in inventory and scanned back to its supplier lot.

### Epic 10 — Spanish digital Batch Worksheet / spice prep — Increment 1C

- production lot assignment;
- worker assignment opens exact spice/batch context;
- one-step Spanish recipe-line workflow;
- barcode/camera scanning;
- correct/wrong/held validation;
- actual quantities and multi-source contributions;
- progress/resume/idempotency;
- **Necesito ayuda** exception path;
- spice-ready completion and audited correction.

#### Confirmed worker phone interaction (September 19, 2026)

- The signed-in production worker sees only their own published schedule and assigned production orders.
- The final assignment action is **Preparar especias / Create spices**, which opens the batch worksheet for the exact assigned 40-gallon mixer batch and its one-to-one spice-prep record.
- The primary phone interaction is a large, ordered ingredient checklist. Each line shows the reviewed Spanish ingredient name, required amount/unit, completion state and any safety/handling note needed to prepare the spice bucket correctly.
- The worker records the source ingredient serial or supplier-lot number before checking a line complete.
- A recipe line accepts multiple source serial/lot contributions when one bag or container runs out and another is opened. Each contribution preserves its own serial/lot, quantity where required, worker and timestamp and remains tied to the same recipe line and mixer batch.
- Completion is blocked until every required line is satisfied or an authorized exception is recorded. The mobile flow must preserve progress across interruptions and prevent duplicate scans or double-posted consumption.
- At approximately 390px wide, the worker must be able to read the batch context, advance through the checklist, add another serial/lot to a line and complete spice preparation without horizontal scrolling or administrator navigation.

### Epic 11 — Mixer execution + holding-tank transfer — Increment 1C

- linked mixer task;
- QC/weight checks;
- operator signoff;
- mixer completion;
- holding-tank session/transfer;
- operational completion -> schedule assignment status;
- audit history.

### Epic 12 — Quality hardening

- worker 390px accessibility/usability pass;
- admin mobile layouts;
- Spanish copy review with Salad Soulmates;
- loading/offline/error/resume behavior;
- automated test completion;
- seed/reset;
- staging acceptance.

## 30. Definition of Done — committed build increments

### 30.1 Increment 1A Done

1. Shareable staging URL and authenticated admin/worker roles exist.
2. Products, ingredients, suppliers/pack sizes and released recipes persist with RLS.
3. Orders generate explicit 40-gallon planned mixer batches and exactly one planned spice-prep record per batch.
4. Material requirements, inventory availability, shortages and supplier pack recommendations are explainable/tested.
5. Employees, availability and PTO can be maintained.
6. Admin can assign/reassign work, detect conflicts, save drafts and publish schedules.
7. Spanish worker **Mi horario** shows only the signed-in worker's published assignments.
8. Worker can open a linked production-task shell at 390px with Product/Lot/Batch/Spice Bucket clearly shown.
9. Spanish/English state switching does not lose task context.
10. Feedback works from staging screens and audit/RLS tests pass.

### 30.2 Increment 1B Done

1. Supplier deliveries can be received into real ledger inventory.
2. Supplier lot is preserved.
3. Every trace-required physical package has a unique scannable serialized identity.
4. Partially used balances and hold/expired state are represented correctly.
5. Serialized unit scans resolve reliably back to ingredient, supplier lot and available quantity.

### 30.3 Increment 1C Done

1. Product/lot/planned batches are available for production and assignments are schedulable.
2. Worker starts the assigned task from **Mi horario**, not a general admin screen.
3. Spanish phone flow replaces the critical paper Batch Worksheet actions for spice prep/mixing.
4. Each 40-gallon mixer batch has exactly one spice bucket.
5. Source scans attach serialized ingredient packages/lots to the correct recipe lines.
6. Wrong/held/duplicate scans block safely and offer help.
7. Quantities and multi-source contributions are stored without double-posting inventory.
   A single recipe line can retain multiple ingredient serial/lot contributions when material comes from more than one bag or container.
8. Spice prep completes only when required lines are satisfied or an authorized exception exists.
9. Mixer QC/signoff and transfer to holding tank are recorded.
10. Completed operational work updates schedule status without allowing calendar-only completion to create inventory/production events.
11. Interrupted tasks resume correctly and critical workflows pass automated/E2E tests at 390px.
12. Salad Soulmates reviews the Spanish worker workflow with actual floor users before production deployment.

## 31. Next milestone after committed build increments

After Increment 1C is accepted, the next build extends the same genealogy into:

`Holding Tank -> 1-gallon Bags -> 4 Bags/Case -> Bag Label (Product + Ingredient Statement + Lot) -> Fulfillment -> Recall Workspace`

Scheduling remains active throughout these later operations so packaging, pickup/shipping and other work can be assigned without creating a separate scheduling system.

## 32. Codex execution instructions

Use this Build Specification as the implementation contract. Use `Salad_Soulmates_PRD_v2.2.md` as deeper business context, but implement the increments in order and do not enable an operational workflow before its data dependencies and acceptance gate are satisfied.

For each epic:

1. create/update database migrations first when schema changes are required;
2. add domain types/validation;
3. implement calculation/business logic with unit tests;
4. implement server actions/API operations;
5. implement UI using the approved Salad Soulmates visual system;
6. add loading/empty/error states;
7. add integration/E2E tests for the critical path;
8. run lint/typecheck/tests before considering the epic complete;
9. never replace a confirmed business rule with a generic manufacturing assumption;
10. when a requirement is marked as an assumption/open question, implement it visibly/configurably rather than presenting it as confirmed fact.

The first end-to-end demonstration should prove:

> Create ingredients and supplier pack configuration -> release a recipe -> enter a customer order -> generate a production plan -> see 40-gallon mixer batches and equal spice-bucket count -> calculate ingredient requirements -> compare to inventory/inbound -> calculate shortage -> round to supplier purchase units -> leave contextual feedback.
