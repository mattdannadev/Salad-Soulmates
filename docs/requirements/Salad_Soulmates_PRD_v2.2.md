# Salad Soulmates Operations, Production & Traceability

## Product Requirements Document

**Version:** 2.2  
**Status:** Build-ready phased product specification; approved visual direction with remaining operational discovery explicitly identified  
**Build strategy:** Incremental product slices; validate each slice in working mockups before production development  
**First build slice:** Master data + order-driven planning/inventory + workforce scheduling + Spanish worker mobile foundation  
**Long-term primary outcome:** Replace the current paper production trail with an order-driven system that plans production, knows what ingredient inventory is available or needs to be purchased, records the exact serialized supplier materials used in each spice-prep/mixer batch, prints the finished bag label, and supports rapid backward/forward recall traceability.

---

## 1. Product vision

Salad Soulmates needs a simple operations system that digitizes the way the business already plans, prepares, mixes, packages, and traces dressing. The product should remove paper and duplicate entry without forcing a generic warehouse or manufacturing process onto a small, order-driven operation.

The application must ultimately replace two major paper processes:

1. **Material planning / inventory worksheet** — converts upcoming customer demand into planned product batches and then into ingredient quantities and supplier purchasing units.
2. **Product Batch Worksheet Log** — currently acts as the product formula, production execution record, source-lot trace record, QC record, and operator signoff. The application will replace this paper worksheet with a guided digital workflow rather than merely displaying a spreadsheet on a screen.

The product will be built in small validated slices. Each slice is prototyped and tested with Salad Soulmates before a live backend is added.

### 1.1 Confirmed end-to-end operating model

The current confirmed production flow is:

`Customer orders`  
`-> required gallons by product`  
`-> planned 40-gallon mixer batches`  
`-> exactly one spice-prep bucket per mixer batch`  
`-> ingredient requirements`  
`-> compare against on-hand/inbound inventory`  
`-> purchase shortages in supplier pack sizes`  
`-> receive and serialize/barcode supplier ingredient packages`  
`-> scan actual serialized ingredients into the spice bucket / mixer batch`  
`-> mix one 40-gallon batch`  
`-> transfer that batch to a holding tank`  
`-> fill 1-gallon bags`  
`-> 4 bags per case`  
`-> bag label carries product name + ingredient list + lot #`  
`-> shipment/customer`.

### 1.2 Core genealogy

The critical traceability chain is:

`Supplier`  
`-> supplier lot / receipt`  
`-> serialized physical ingredient package`  
`-> spice-prep bucket`  
`-> 40-gallon mixer batch`  
`-> production lot`  
`-> holding tank transfer`  
`-> 1-gallon bags / cases`  
`-> shipment / customer`.

The one-to-one relationship between a spice-prep bucket and its 40-gallon mixer batch is a confirmed requirement.

### 1.3 Build principle

For each meaningful product slice:

1. Document the current process and source paperwork.
2. Create an interactive mockup using Salad Soulmates terminology.
3. Let Salad Soulmates users perform representative tasks in the mockup.
4. Revise based on observed feedback.
5. Build only the approved slice against the real backend.
6. Validate with real records before moving to the next slice.

---

## 2. Source-document analysis: the current paper trail

This section is based on the eight photographed documents supplied during discovery. The documents establish the current paper structure, but handwritten notes, abbreviations, calculations, and formula values must be validated before production master data is loaded.

### 2.1 Inventory / Material Requirements Worksheet — two pages

**Source files**

- `01_Inventory_Material_Requirements_Worksheet_Page_1.jpeg`
- `02_Inventory_Material_Requirements_Worksheet_Page_2.jpeg`

Despite the printed title **Inventory Worksheet**, this document functions primarily as a **production-planning and material-requirements calculator**, not as a detailed perpetual warehouse inventory ledger.

#### Inputs observed

The worksheet contains planned batch-count lines for products including:

- Leo's
- Balsamic
- Honey Mustard
- Caesar
- Ranch
- Bleu Cheese
- Gumby's Ranch
- a `THRU` field that appears to represent a planning horizon/date and still requires confirmation

It also references suppliers such as Sysco, PFG, Borden Dairy, and Wiscon Cheese.

#### Calculation pattern observed

The sheet converts planned product batches into purchasing/staging quantities using calculations of the general form:

`planned product batches × ingredient requirement per batch ÷ supplier pack size = cases/pails/bags/each required`.

Observed materials include oil, lemon juice, balsamic vinegar, Worcestershire sauce, brown sugar, mustards, honey, yogurt, mayonnaise, bleu cheese crumbles, ranch mixes, buttermilk, white sugar, and Paroma cheese.

The worksheet mixes purchasing units such as **EA, CS, GL, PAILS, BAGS, and LBS**. Handwritten pack-size notes/corrections are visible on some rows. This is evidence that supplier-package configuration and conversion factors must be data, not hard-coded formulas.

#### Revised product implication

The future digital replacement should be **order-driven**:

- open/upcoming customer orders create required finished-product demand;
- demand is converted to required gallons by product;
- required gallons are converted to planned 40-gallon mixer batches using the product's standard batch yield and the approved rounding/overage rule;
- each planned mixer batch automatically creates one planned spice-prep bucket;
- released recipe versions determine total ingredient requirements;
- requirements are compared with usable on-hand inventory and confirmed inbound inventory;
- the system calculates shortage quantities;
- shortages are converted into supplier purchase units such as cases, pails, bags, or each;
- the raw shortage and rounded purchasing recommendation are displayed separately;
- authorized users can override purchase quantity without changing recipe requirements;
- the supplier item/pack configuration used for the calculation is preserved.

Salad Soulmates does **not** maintain a large warehouse stock as the primary operating model. Inventory is generally ordered as customer demand comes in, so material planning is more important than traditional min/max replenishment. Inventory levels are still required and must remain visible.

### 2.2 Product-specific Batch Worksheet Logs — six pages

**Source files**

- `03_Batch_Worksheet_Log_Gumbys_Ranch_Dressing.jpeg`
- `04_Batch_Worksheet_Log_Honey_Mustard.jpeg`
- `05_Batch_Worksheet_Log_WNM_Ranch_Dressing.jpeg`
- `06_Batch_Worksheet_Log_Leos_Select_Italian.jpeg`
- `07_Batch_Worksheet_Log_Balsamic_Vinaigrette.jpeg`
- `08_Batch_Worksheet_Log_Creamy_Caesar.jpeg`

These paper sheets combine several responsibilities:

1. **Recipe/formula** — product-specific ingredient rows and measurements.
2. **Production execution record** — dates, batch counts, initials, weights, yield and signoff.
3. **Source-lot trace record** — a `LOT #` field beside ingredient rows.
4. **QC/packaging record** — product-specific weight ranges and additional product/yield fields.

The application is intended to **replace** these worksheets with guided digital production screens. The paper layout is evidence for required data and terminology, not a requirement to reproduce a spreadsheet interface.

#### Common header fields observed

Across the worksheets, the application must be capable of representing:

- product/dressing name;
- finished lot number;
- `GL`, `CS`, `PL`, and/or `LABELS` fields where present;
- Fix Date(s);
- Mix Date(s);
- one or more Batch counts;
- operator initials;
- `Added Lot #` fields;
- Weight fields;
- product-specific accepted weight/range text;
- total batches;
- yield;
- product-specific fields such as pails, racks, gallons, cases;
- operator `BY` signoff.

The exact meanings of **Fix Date**, **Added Lot #**, **PL**, **Racks**, and some weight checks are not fully established by the photographs and remain discovery questions.

#### Common ingredient-table fields observed

- `LOT #`
- `INGREDIENTS`
- `MEASUREMENTS`
- `LBS.`
- allergen callouts, including examples for Milk, Egg, Soy, and Fish
- one or more `BY` signoff lines

Several products contain more than one ingredient-table block. The digital recipe model therefore requires ordered sections/stages and cannot assume a flat ingredient list.

### 2.3 What the paper batch worksheet becomes digitally

The paper worksheet will be decomposed into three connected digital objects:

1. **Released Recipe Version** — defines what one standard 40-gallon mixer batch should contain.
2. **Spice Preparation** — exactly one spice-prep bucket for exactly one planned mixer batch. This is where the actual serialized supplier ingredients used for the spice blend are scanned and attached to recipe lines.
3. **Mixer Batch Execution** — the corresponding 40-gallon mix, production/QC signoff, and transfer to the holding tank.

The worker should not have to repeatedly re-enter or copy recipe lines. A planned batch opens the correct recipe automatically.

### 2.4 Product-specific formula examples observed

These values are discovery evidence only and must be validated before production use.

#### Gumby's Ranch Dressing

Observed lines include Borden's LF Buttermilk, West Creek Mayonnaise-HD, Hidden Valley Ranch Mix, Potassium Sorbate, Sodium Benzoate, and Xanthan Gum. Allergen callouts include **Milk** and **Egg, Soy**. A product-specific range of **39.5–40.5 lb** appears on the form.

#### Honey Mustard

Observed lines include Garlic, Xanthan Gum, Red Cayenne Pepper, Sugar, Dried Egg, Mustard Flour, Brown Mustard, Yellow Mustard, Soybean Oil, Water, Apple Cider Vinegar, Honey, Yogurt, and Salt. Allergen callouts include **Egg** and **Milk**. Multiple ingredient sections are present and a range of **142–146 oz** appears.

#### WNM Ranch Dressing

Observed lines include Borden's LF Buttermilk, Kraft Mayonnaise-HD, OP Ranch Mix, Potassium Sorbate, Sodium Benzoate, and Xanthan Gum. Allergen callouts include **Milk** and **Egg, Soy**. A range of **32–36 lb** appears.

#### Leo's Select Italian

Observed lines include soybean oil, white vinegar, lemon juice, water, garlic, onion powder, salt, red pepper, black pepper, xanthan gum, buttermilk solids, Parmesan/Romano cheese, parsley, sweet basil, and oregano. Multiple sections, allergens, operator-friendly measures, and pound equivalents are present. A range of **132–136 oz** appears.

#### Balsamic Vinaigrette

Observed lines include garlic, xanthan gum, white pepper, red pepper, onion powder, balsamic vinegar, gluten-free soy sauce, brown sugar, vegetable oil, salt, and water. Multiple sections and a **Soy** allergen callout are present. A range of **134–138 oz** appears.

#### Creamy Caesar

Observed lines include garlic, salt, black pepper, white pepper, onion powder, sugar, xanthan gum, maltodextrin, buttermilk solids, dried eggs, Paroma cheese, sweet basil, oregano, anchovy paste, Worcestershire sauce, soybean oil, white vinegar, lemon juice, water, yellow mustard, and caramel color. Allergens include **Milk, Egg, Fish, and Soy**. Multiple sections are present and a range of **129–133 oz** appears.

### 2.5 Design conclusion from the source documents

A recipe line must support more than `ingredient + quantity`:

- ingredient;
- operator-facing measurement such as `7 cups`, `2 gallons`, `30 packages`, or `5 cases + 10 lb`;
- normalized quantity/UOM used for calculations where known;
- optional normalized pounds equivalent;
- section/stage;
- sequence;
- allergen information;
- source-serial/source-lot capture during spice preparation;
- operator note/instruction.

Supplier package conversions belong in supplier-item configuration, not recipe code.

---

## 3. Confirmed operating requirements

### 3.1 Lot assignment

- The **internal DDDYY Production Lot** is assigned early in the production day, before the dressing is mixed.
- Format is **DDDYY**: three-digit day-of-year + two-digit year. September 18, 2026 is day 261, so the code is **26126**.
- It is generated from the assigned production date in facility local time; it does not depend on mix completion. Mix Date remains separate.
- DDDYY is internal-only, not a database primary key or customer-facing label/recall value. Products and multiple runs may share it on the same date; the production-lot UUID is the system identity.
- Customer-facing finished-label lot text and customer recall lookup require a separately approved finished-label lot policy. They must not use DDDYY.

See `docs/decisions.md`, **Source Lots and internal DDDYY Production Lots**, for the authoritative Source Lot, fallback, correction and uniqueness rules.

### 3.2 Planned 40-gallon mixer batches

- One standard mixer batch produces **40 gallons**.
- The number of mixer batches needed is calculated **before production** from upcoming customer demand and planned finished-product gallons.
- The exact rounding/overage rule when demand is not evenly divisible by 40 gallons must be validated with Salad Soulmates.
- Each planned mixer batch has a sequence within the production lot, e.g. Batch 1 of 4.
- Internally, each mixer batch has a globally unique ID even when several share the same DDDYY production code.

### 3.3 One spice-prep bucket per mixer batch

This is a confirmed one-to-one relationship:

`1 planned 40-gallon mixer batch = 1 spice-prep bucket`.

Therefore, if a production plan contains four 40-gallon mixer batches, the system also creates four spice-prep records/buckets.

Requirements:

- every mixer batch has exactly one spice-prep record;
- every spice-prep record belongs to exactly one mixer batch;
- a spice-prep bucket may not be allocated across multiple mixer batches;
- serialized ingredient materials scanned while preparing the spice blend are recorded against that spice-prep record and therefore against its mixer batch and production lot.

### 3.4 Easy batch/spice scanning workflow

The system should minimize scans and manual selection while preserving genealogy.

Recommended confirmed workflow direction:

1. System creates the planned production lot and planned mixer batches.
2. Each mixer batch/spice-prep pair receives an internal scannable identifier.
3. A barcode/QR label can be printed/attached to the spice-prep bucket or otherwise presented for scanning.
4. Worker scans the batch/spice identifier once to open the correct work context.
5. App loads the released recipe for that 40-gallon batch.
6. Worker scans each serialized supplier ingredient package as it is used for the spice blend.
7. App validates that the scanned material matches the expected ingredient and is usable.
8. The source serial, supplier lot, quantity used, operator and timestamp are saved against the applicable recipe line.
9. When the spice bucket is complete, it is marked ready for its one corresponding mixer batch.

A short human-readable batch code may be displayed, for example `LEO-26126-B02`, while the barcode should encode a unique internal ID to prevent collisions between products sharing the same date-based lot.

### 3.5 Mixer to holding tank

- The completed spice preparation is used for its corresponding 40-gallon mixer batch.
- Each completed 40-gallon mixer batch transfers to a **holding tank**.
- The system must preserve which mixer batches contributed to the holding tank.
- Holding-tank aggregation must never destroy the ingredient genealogy inherited from the contributing batches.
- Rules around carryover, tank cleaning, or mixing multiple production lots in a holding tank are not yet confirmed and remain discovery items.

### 3.6 Finished packaging

Confirmed current packaging:

- **1 gallon per bag**.
- **4 bags per case**.
- The prior 2-gallon-bag assumption is superseded.

The packaging structure should remain configurable in the data model, but the current Salad Soulmates profile is 1-gallon bags / 4 bags per case.

### 3.7 Bag label and customer recall identifier

A label is printed for the bags placed in the case. The label contains at minimum:

- **Product name**;
- **Ingredient list / ingredient statement**;
- **Lot #**.

Customer-facing recall is deferred until the finished-label lot policy is approved. DDDYY must not be used as the bag-label lot or the customer recall reference.

The system should treat the ingredient statement as controlled product/label content, not casually generate regulatory label wording from raw recipe lines without approval.

### 3.8 Recall path

Backward trace from a customer report should be:

`Product + bag Lot #`  
`-> production lot`  
`-> holding tank/session`  
`-> contributing 40-gallon mixer batches`  
`-> one spice-prep bucket per mixer batch`  
`-> scanned serialized ingredient packages`  
`-> supplier lots / receipts / suppliers`.

Forward trace should be:

`serialized ingredient package or supplier lot`  
`-> spice-prep/mixer batches that used it`  
`-> production lot(s)`  
`-> holding tank / packaged bags and cases`  
`-> shipments / customers`.

---

## 4. Inventory and purchasing model

### 4.1 Operating assumption

Salad Soulmates is primarily **order-driven** and does not keep large amounts of ingredient inventory sitting in the warehouse. Purchasing is triggered largely by upcoming customer demand.

The application should therefore prioritize **material availability and shortage calculation** rather than traditional warehouse min/max replenishment.

### 4.2 Minimum required inventory visibility

For each ingredient, managers must be able to see at minimum:

- quantity on hand;
- quantity usable/available;
- quantity committed to planned production;
- quantity inbound/ordered, when purchasing is implemented;
- projected quantity remaining after planned production;
- shortage quantity for current planned demand;
- source lots/serialized packages that make up the on-hand balance.

Held, quarantined, expired, or otherwise unavailable material must not count as usable inventory.

### 4.3 Demand-driven shortage calculation

The core planning calculation is:

`Open/upcoming customer demand`  
`-> finished gallons required`  
`-> planned 40-gallon batches`  
`-> recipe ingredient requirements`  
`-> minus usable on hand`  
`-> minus confirmed inbound`  
`= shortage`  
`-> round shortage to supplier purchasing pack`.

The system should show both the **raw shortage** and the **recommended order quantity**.

Example behavior only:

If planned production requires 180 lb, usable on hand is 50 lb, and confirmed inbound is 60 lb, the shortage is 70 lb. If the supplier package is 30 lb, the application would recommend the appropriate whole-package quantity according to the configured rounding rule.

### 4.4 Reorder points

Traditional reorder points/safety stock may remain optional configuration for ingredients Salad Soulmates intentionally keeps on hand, but they are **not the primary purchasing driver**.

### 4.5 Inventory events

Inventory quantities must be based on auditable events such as:

- receipt;
- move;
- allocation/commitment to planned production;
- consumption/use in spice prep / mixer batch;
- return/reversal;
- adjustment;
- hold/release;
- disposal.

---

## 5. Product development scope and phases

The application will still be delivered incrementally, but workforce scheduling and the worker phone experience are now part of the core product rather than a later add-on. Salad Soulmates cannot fully replace the paper Batch Worksheet unless the people performing that work can receive assignments and execute the workflow simply on a phone.

### Phase 0 — Completed for current scope: discovery + high-fidelity mockups

- analyze the paper trail and current batch/inventory worksheets;
- validate the order-driven planning model;
- establish the approved visual direction for the application;
- confirm 40-gallon mixer batches and the one-to-one spice-bucket relationship;
- confirm that production workers will use phones and require a very simple Spanish interface;
- no production database writes.

### Phase 1 — Foundation, master data, scheduling, and worker mobile shell

First live staging slice.

Includes:

- authentication, organization/facility and roles;
- ingredient, allergen, supplier and supplier-pack master data;
- product and released recipe/version setup;
- employees and worker login identities;
- worker preferred language, with Spanish fully supported and the default worker experience for the initial rollout;
- administrator scheduling week/day views;
- PTO/availability and conflict checks;
- draft/publish schedule behavior;
- assignments linked to product, production plan, lot, mixer batch and/or spice-prep work when those records exist;
- worker phone home screen **Mi horario** showing only that worker's published work;
- simple Spanish task detail shell that can later open live scan/production execution;
- contextual prototype/staging feedback.

This phase does not pretend that barcode receiving or live production genealogy exists before those modules are built.

### Phase 2 — Orders + production planning + inventory visibility + purchasing

Includes:

- customer order demand by product/date;
- required finished gallons;
- calculated planned 40-gallon mixer batches;
- automatically equal count of planned spice-prep buckets;
- material requirements from released recipes;
- on-hand inventory visibility;
- committed demand and confirmed inbound;
- shortage calculation;
- supplier-package purchase recommendation;
- schedule work suggestions generated from the production plan for admin assignment/publishing.

### Phase 3 — Supplier items + receiving + serialization/barcodes

Includes:

- receiving record and supplier lot;
- physical package/container serialization;
- use supplier barcode when uniquely suitable;
- print Salad Soulmates internal barcode when needed;
- partially used package remaining balance;
- hold/quarantine state;
- worker/receiver phone flow for receiving where authorized.

### Phase 4 — Spanish worker mobile digital Batch Worksheet replacement

This phase replaces the paper Product Batch Worksheet Log for floor execution.

Includes:

- production lot assigned early in the day;
- planned mixer batches under the lot;
- exactly one spice-prep bucket per mixer batch;
- each batch/spice-prep task schedulable to a specific worker;
- worker opens the assigned task from **Mi horario** on a phone;
- Spanish-first, one-step-at-a-time workflow with large controls and minimal typing;
- scan the batch/spice-bucket context once;
- guided recipe lines in the correct order;
- scan the serialized supplier ingredient used for each line;
- confirm required/actual quantity and mark ingredient **Agregado**;
- preserve multiple source packages/lots where needed;
- clear blocking message for wrong ingredient, held lot, unavailable quantity or duplicate scan;
- **Necesito ayuda** action on every operational step;
- complete the one spice bucket for the one linked 40-gallon batch;
- mixer execution/QC fields and signoff;
- transfer the completed 40-gallon batch to the holding tank;
- interrupted work resumes at the same step without losing scans or quantities;
- completion of the operational task updates the linked schedule assignment, while simply marking a calendar assignment complete never posts inventory by itself.

### Phase 5 — Holding tank + packaging + labels + shipping trace

Includes:

- holding-tank/session record and mixer-batch transfers;
- retain all contributing genealogy;
- 1-gallon bag packaging;
- 4 bags per case;
- bag label printing with approved Product Name + Ingredient Statement; finished-label lot content remains pending policy;
- packaged quantity / case counts;
- customer fulfillment and shipment/pickup;
- exact product/lot shipped to customer;
- schedule assignments for packaging/pickup where needed.

### Phase 6 — Trace & recall workspace

The genealogy should already exist from earlier phases. This slice adds the dedicated recall user experience:

- search product + lot;
- search supplier lot / serialized ingredient;
- backward and forward graph/results;
- affected on-hand product;
- affected shipments/customers;
- quarantine/hold actions;
- recall report/export;
- mock recall mode.

### Later slices

- QuickBooks invoicing;
- additional purchasing workflow/PO approvals if needed;
- forecasting beyond confirmed customer demand if later valuable.

---

## 6. Users and permissions

| Role | Primary needs | Typical device |
|---|---|---|
| Administrator/Manager | Products, ingredients, recipes, orders, planning, inventory, users/settings | Desktop + phone |
| Receiver | Receive supplier material, capture supplier lot, serialize/barcode packages | Phone/tablet |
| Spice-prep / Production operator | Open assigned batch, scan source material, complete spice prep and mixer execution | Phone/tablet |
| Packaging/shipping user | Package product, print labels, record lot fulfillment | Phone/tablet |
| QA/Recall lead | Trace genealogy, hold/quarantine, execute recall | Desktop + phone |
| Accounting admin | Review fulfillment and create/sync QuickBooks invoices | Desktop + phone |
| Worker | See assigned work and complete only authorized operations | Phone |

Permissions must be role-based. Historical recipe versions, serialized-source usage, completed production batches, transfers, packaging and shipments may not be silently overwritten.

---

## 7. Core domain model

### 7.1 Master data

| Entity | Key fields / purpose |
|---|---|
| Organization | Company/tenant identity |
| Facility | Name, timezone, active status |
| Ingredient | Name, default UOM, allergens, traceability mode, active |
| Allergen | Controlled allergen list/display label |
| Supplier | Name, contacts, active |
| Supplier item | Supplier, ingredient, supplier SKU/name, pack quantity/UOM, units per case, preferred status |
| Product | Dressing/product name, product code, standard batch yield, active |
| Recipe | Product and recipe identity |
| Recipe version | Immutable released formula snapshot, effective date, status |
| Recipe section | Ordered grouping/stage from the paper formula |
| Recipe line | Ingredient, display measurement, normalized quantity/UOM, optional lb equivalent, sequence, notes |
| Recipe QC rule | Product/recipe check, min/max, UOM, instructions |
| Label profile | Approved product name, controlled ingredient statement, lot placement/template |
| Packaging profile | 1-gallon bag, 4 bags/case for current process; configurable for future differences |
| Employee/User | Login, role, facility, active status, preferred language, worker display name |

### 7.2 Transactional data

| Entity | Purpose |
|---|---|
| Customer order | Customer demand by product/date/quantity |
| Production plan | Converts order demand into gallons and planned mixer batches |
| Production lot | Product + assigned production date + internal DDDYY code + planned quantity/status |
| Planned mixer batch | One planned standard 40-gallon batch; sequence within production lot |
| Spice preparation | Exactly one spice bucket for one planned mixer batch |
| Material requirement | Calculated ingredient need from planned batches |
| Purchase/inbound record | Future order/inbound quantity by supplier item |
| Receipt | Supplier delivery header/document |
| Receipt line | Supplier item, Source Lot with Supplier or Salad Soulmates assigned origin, quantity, date, expiration if applicable |
| Serialized ingredient unit | Unique physical supplier package/container identifier linked to receipt/lot |
| Inventory event | Receipt, commitment, usage, move, adjustment, hold/release/disposal |
| Spice material usage | Serialized unit + quantity tied to one spice-prep recipe line |
| Mixer batch execution | 40-gallon mix status, timestamps, operator/QC, spice-prep link |
| Holding tank session | Product/lot tank context receiving one or more mixer batches |
| Holding tank transfer | Mixer batch -> tank + quantity/time/operator |
| Packaging run | Holding-tank/product lot -> 1-gal bags + cases |
| Bag label event | Label template/version + product + lot + print timestamp/count |
| Shipment/fulfillment | Customer/order + product/lot + quantity + date/status |
| Recall case | Trigger, affected genealogy, disposition, contacts, evidence |
| Audit event | Actor, timestamp, action, original/correction references |
| Scheduled work | Activity/date/time/facility, linked product/lot/mixer batch/spice prep/order, instructions, draft/published/cancelled status |
| Work assignment | Scheduled work + one or more assigned employees, worker-facing status and timestamps |
| Schedule revision | Preserves published vs draft changes, publisher and publish timestamp |
| Employee availability | Normal working days/hours by employee/facility |
| PTO block | Employee unavailable period, full-day/date-range/partial-day |
| User preference | Preferred locale/language and worker UI preferences |
| Invoice sync record | Fulfillment-to-QuickBooks sync state |

---

## 8. Phase 1 functional requirements — Ingredients

**ING-01** Administrator can list, search, create, edit, activate and deactivate ingredients.  
**ING-02** Required fields: name, default UOM, active status.  
**ING-03** Optional fields: category, description, internal code, storage notes, preferred supplier.  
**ING-04** Ingredient can carry zero or more allergen flags. Initial observed allergens include Milk, Egg, Soy and Fish.  
**ING-05** Ingredient has a future traceability mode: source serial required, optional, or not applicable.  
**ING-06** Deactivation preserves historical references; referenced ingredients are never hard-deleted.  
**ING-07** Units are controlled values and mass/volume conversion is never inferred silently.  
**ING-08** Controlled conversion/density values may be stored only when explicitly validated.  
**ING-09** Near-duplicate ingredient names warn the administrator before save.

### Phase 1 ingredient acceptance

A Salad Soulmates administrator can reproduce the ingredient master required for at least one real current product worksheet using the terminology, units and allergens they recognize.

---

## 9. Phase 1 functional requirements — Products & Recipes

**RCP-01** Administrator can create a Product and Recipe.  
**RCP-02** Recipe supports ordered sections/stages.  
**RCP-03** Every recipe line stores ingredient, operator-facing measurement, normalized calculation quantity/UOM when known, optional pound equivalent, sequence and note.  
**RCP-04** Recipe lines can use cups, gallons, quarts, ounces, pounds, packages, bags/cases or composite production instructions while retaining a normalized calculation amount separately.  
**RCP-05** Recipe may include expected yield and QC/weight checks.  
**RCP-06** Allergens from ingredient master are surfaced for review.  
**RCP-07** Recipe statuses: Draft, Released, Retired.  
**RCP-08** Released versions are immutable. Editing produces a new Draft.  
**RCP-09** Production always references the exact released recipe-version snapshot used.  
**RCP-10** Administrator can duplicate a recipe/version.  
**RCP-11** Administrator can reorder lines/sections without recreating them.  
**RCP-12** Product supports the standard mixer batch yield; current confirmed standard is 40 gallons.  
**RCP-13** Photographed formula values are not approved master data until validated by Salad Soulmates.

### 9.1 Production-flow preview in Phase 1 mockups

The interactive recipe prototype should include a **Preview Production Batch** action. It should demonstrate how a released 40-gallon recipe becomes a future digital production task without pretending that scanning is live yet.

Preview should show:

- product;
- example production lot position;
- `Mixer Batch 1 of N — 40 gal`;
- its one corresponding spice-prep bucket;
- recipe sections/lines;
- expected measurement;
- future `Scan source ingredient` location;
- allergen callouts;
- future QC/signoff areas.

This preview replaces the earlier assumption that the system should simply recreate the paper worksheet as a spreadsheet.

---

## 10. Orders, production planning and material requirements

**PLAN-01** Customer orders contain customer, requested date, product and quantity in the sale/fulfillment unit.  
**PLAN-02** System converts order demand into required gallons using configured product/package conversions.  
**PLAN-03** System calculates planned 40-gallon mixer batches before production.  
**PLAN-04** Each planned mixer batch automatically creates exactly one planned spice-prep record.  
**PLAN-05** System expands released recipes across planned batch counts to calculate ingredient requirements.  
**PLAN-06** Same ingredient across multiple products is aggregated while retaining product-level contribution detail.  
**PLAN-07** Requirements compare to usable on hand, committed stock and confirmed inbound.  
**PLAN-08** System displays raw shortage and suggested supplier purchase quantity separately.  
**PLAN-09** Supplier purchasing recommendation uses configured pack sizes/case counts.  
**PLAN-10** Do not sum incompatible units without approved conversions.  
**PLAN-11** Authorized user can override purchase quantity without changing calculated need.  
**PLAN-12** Calculation is reproducible from the recipe versions, order demand and pack configuration used at the time.  
**PLAN-13** Traditional reorder points are optional secondary configuration, not the primary trigger.

---

## 11. Supplier items, receiving and serialization

**SUP-01** One ingredient may be purchased from multiple suppliers/items.  
**SUP-02** Supplier item stores supplier SKU/name, package quantity/UOM, units per case and current purchase configuration.  
**SUP-03** Pack definitions are effective-dated/versioned where practical so later pack changes do not rewrite old planning calculations.  
**SUP-04** Recipes remain ingredient-based; supplier pack changes never alter the formula.

**REC-01** Receiver records supplier, supplier item/ingredient, Source Lot, received quantity, UOM, date and optional expiration/best-by. Preserve the supplier-provided lot when present; otherwise assign the approved Salad Soulmates fallback.
**REC-02** If the supplier's existing barcode uniquely identifies the physical package at the needed traceability level, it may be used.  
**REC-03** Otherwise Salad Soulmates generates an internal barcode/serial label.  
**REC-04** Every serialized physical ingredient unit links to its receipt line and Source Lot.
**REC-05** Multiple physical units may share a Source Lot while retaining individual serial identities.
**REC-06** A partially used physical unit retains identity and remaining quantity.  
**REC-07** Duplicate serial scans are blocked/resolved explicitly.  
**REC-08** Hold/quarantine/expired material cannot be selected for production.

---

## 12. Digital spice preparation and mixer execution

### 12.1 Create production lot and planned batches

**PROD-01** Administrator creates/confirms a production lot before mixing begins.  
**PROD-02** Internal DDDYY code is generated from the assigned local production date. It is not customer-facing and is not the finished-label lot.
**PROD-03** Mix Date is captured separately and does not have to exist before the lot is assigned.  
**PROD-04** Production lot stores product, internal DDDYY code, planned gallons, planned mixer batch count and status; its UUID remains the system identity.
**PROD-05** System creates the planned sequence of 40-gallon mixer batches under the lot.  
**PROD-06** System creates exactly one spice-prep record for each mixer batch.  
**PROD-07** Each mixer batch/spice-prep pair receives a unique internal ID and scannable identifier.

### 12.2 Spice-prep scanning

**SPC-01** Worker scans the spice-prep/mixer-batch identifier once to open the correct task.  
**SPC-02** App loads the exact released recipe-version snapshot for one 40-gallon batch.  
**SPC-03** Each traceable recipe line requires one or more source-material records before spice prep is complete.  
**SPC-04** Worker scans a serialized supplier ingredient package.  
**SPC-05** System validates that the package maps to the expected ingredient and is usable.  
**SPC-06** Actual quantity used is captured explicitly or via a later validated weighing workflow; scanning must not assume the entire package was used.  
**SPC-07** If multiple source packages/lots are used for one recipe line, each is stored separately and quantities are summed.  
**SPC-08** Facility water or another explicitly configured non-traceable line need not require a source scan.  
**SPC-09** Duplicate scans/submits are idempotent and cannot double-consume inventory.  
**SPC-10** Wrong ingredient, held, quarantined or expired material is blocked.  
**SPC-11** Corrections require audited reversal/adjustment rather than silent edits.  
**SPC-12** Spice prep cannot be marked Ready until required lines are satisfied or an authorized exception is recorded.  
**SPC-13** A spice-prep bucket may only be used for its one linked mixer batch.

### 12.3 Mixer batch

**MIX-01** Mixer task clearly shows Product, internal DDDYY production code, and `Mixer Batch X of N — 40 gal`.
**MIX-02** Mixer batch requires its one linked spice prep to be Ready unless an authorized exception exists.  
**MIX-03** Operator records required production/QC results and signoffs configured from the product recipe.  
**MIX-04** Completion records actual batch/yield information required by Salad Soulmates.  
**MIX-05** Completed mixer batch transfers to a holding tank through a recorded transfer event.  
**MIX-06** Completed execution becomes read-only except through audited correction.

---

## 13. Holding tank

**TANK-01** System records a holding-tank/session identity and the product/lot context.  
**TANK-02** Every mixer-batch transfer into the tank records mixer batch, quantity, timestamp and operator.  
**TANK-03** Tank genealogy is the union of all source-material genealogy from its contributing mixer batches.  
**TANK-04** The application must not lose batch/source relationships after the product is combined in the tank.  
**TANK-05** Rules for carrying product across days, mixing production lots, residual product and tank cleaning are pending discovery and must not be invented silently.  
**TANK-06** Until validated otherwise, the system should warn/block combining different product/lot contexts in the same active tank session.

---

## 14. Packaging and bag labels

### 14.1 Current packaging profile

**PKG-01** Current finished unit is a **1-gallon bag**.  
**PKG-02** Current case contains **4 one-gallon bags**.  
**PKG-03** Packaging configuration remains data-driven so future product/customer differences do not require code changes.  
**PKG-04** Packaging event references the holding-tank session/product lot from which product was filled.  
**PKG-05** Actual bag/case counts and waste/short-fill adjustments are recorded as needed once the operational detail is validated.

### 14.2 Bag label

**LBL-01** System prints a bag label containing at minimum Product Name and approved Ingredient Statement. Finished-label lot content is deferred pending the separate approved customer-facing lot policy.
**LBL-02** Packer does not re-key the finished-label lot once that policy is approved. The internal DDDYY production code must not be printed as that lot.
**LBL-03** Product name and ingredient statement come from controlled product/label configuration.  
**LBL-04** The label template/version used is auditable.  
**LBL-05** Label print/reprint events are logged where practical.  
**LBL-06** The label is the primary customer-facing recall reference.

---

## 15. Inventory control

**INV-01** Inventory is visible by ingredient, supplier lot, serialized unit, location and status.  
**INV-02** Managers see on hand, usable available, committed to planned production, inbound, projected remaining and shortage.  
**INV-03** Current balances derive from ledger-style events.  
**INV-04** Usage captured during spice prep/mixer production reduces the correct serialized physical unit exactly once.  
**INV-05** Multiple source units/lots preserve each contribution.  
**INV-06** Adjustments require reason and authorization.  
**INV-07** Remaining partially used packages remain searchable and traceable.  
**INV-08** Held/quarantined/expired material is excluded from available production stock.  
**INV-09** Reorder thresholds/safety stock are optional, not the core purchasing workflow.  
**INV-10** Inventory views should favor current order fulfillment questions: `Do we have enough for planned production? What are we short? What is inbound?`

---

## 16. Orders and fulfillment

**ORD-01** Customer order records customer, requested date, product and requested quantity.  
**ORD-02** Order demand feeds production planning and material requirements.  
**ORD-03** Partial fulfillment remains open for remaining quantity.  
**ORD-04** Actual shipment/pickup records product, approved customer-facing finished-label lot when that policy exists, and quantity delivered.
**ORD-05** Shipment/pickup confirmation is distinct from a scheduled pickup task.  
**ORD-06** Returns reference original fulfillment and preserve lot identity.

---

## 17. Trace and recall

### 17.1 Customer-facing backward trace

Primary use case:

1. After the finished-label lot policy is approved, customer reads the **Product Name** and approved lot from the label on the 1-gallon bag.
2. Salad Soulmates searches using that approved customer recall key.
3. System resolves the linked production lot.
4. System identifies the holding-tank session and every 40-gallon mixer batch contributing to that lot/tank.
5. Each mixer batch reveals its one spice-prep record.
6. Each spice-prep record reveals every serialized ingredient package/lot used.
7. Each serialized package links to supplier receipt, supplier lot and supplier.

### 17.2 Forward trace from supplier material

`Supplier lot / serialized ingredient`  
`-> spice-prep usages`  
`-> mixer batches`  
`-> production lots`  
`-> holding tank / packaged product`  
`-> shipments/customers`.

### 17.3 Requirements

**TRC-01** Search supports the approved customer recall key when available, internal DDDYY production code, internal mixer-batch ID, spice-prep ID, serialized ingredient barcode, Source Lot, receipt, shipment and customer identifiers as available.
**TRC-02** If a non-unique code or lot text matches multiple records, show context/candidates rather than guessing.
**TRC-03** Results show quantities at each branch where captured.  
**TRC-04** Recall workspace identifies affected on-hand raw material, affected finished product, open orders, shipments and customers.  
**TRC-05** Authorized users can quarantine/hold affected inventory.  
**TRC-06** Produce printable/PDF and CSV recall evidence.  
**TRC-07** Mock recall mode performs analysis without changing live status unless promoted.  
**TRC-08** Long-term target: trained user completes a mock recall in under two minutes once all required modules exist.

---

## 18. Workforce scheduling, PTO and worker assignment — core scope

### 18.1 Scheduling outcome

The administrator must be able to turn the production plan and other operational needs into a clear worker schedule. Workers should not need to understand the full planning system; after login they see only their own published work and can open the linked operational task directly.

### 18.2 Administrator scheduling

**SCH-01** Desktop provides a week view with employees as rows and days as columns, plus a day/list view.  
**SCH-02** Admin can create work for spice prep, mixer batch, receiving, packaging, cleaning, customer pickup/shipping and general work.  
**SCH-03** A scheduled item may link to product, production lot, planned mixer batch, its one spice-prep bucket, order, customer or location.  
**SCH-04** Production planning may generate draft work suggestions, but the administrator chooses employee(s), date/time and publishes the schedule.  
**SCH-05** Support click-to-add and edit forms; desktop may additionally support drag/drop reassignment with the same validations.  
**SCH-06** Assignments may remain unassigned until staffing is decided; uncovered production work must be visible.  
**SCH-07** Scheduling validates overlapping assignments and approved PTO.  
**SCH-08** Normal worker availability is visible; an admin override outside normal availability requires an explicit reason.  
**SCH-09** Draft/publish behavior is required. Workers continue to see the last published version until a revision is published.  
**SCH-10** Reschedule/cancel history records who changed the assignment and when.  
**SCH-11** Phone admin view uses daily lists and staged forms; no scheduling capability may require desktop-only access.

### 18.3 Employees, availability and PTO

**PTO-01** Maintain active employees, roles, facility, login identity and normal available days/hours.  
**PTO-02** Admin records full-day, date-range or partial-day PTO/unavailability.  
**PTO-03** New or moved assignments that overlap PTO or another active assignment are blocked.  
**PTO-04** If new PTO overlaps existing published work, show the impacted assignments and require reassignment/cancellation before finalizing the PTO.  
**PTO-05** Leave reasons are private to authorized admins; workers only need to know their own unavailable periods.

### 18.4 Worker schedule

**WRK-01** Worker login opens **Mi horario** on phone: today's work first, then upcoming published assignments.  
**WRK-02** Worker sees only their own assignments and their own PTO/unavailability.  
**WRK-03** Each task card shows time, simple task name, product, lot/batch when relevant and one primary **Comenzar** action.  
**WRK-04** A spice-prep/mixer assignment opens the exact linked operational task; the worker never searches a general batch list to find their job.  
**WRK-05** Workers can report a problem / request help without leaving the task.  
**WRK-06** Calendar status and physical production status are distinct. Merely marking a calendar task complete must never consume inventory or create production history. When the linked operational workflow is successfully completed, the schedule assignment may be completed automatically.

### 18.5 Spanish worker experience

Spanish is a required product capability for the initial floor rollout, not an optional future enhancement.

**LANG-01** Worker mobile screens are fully usable in Spanish; Spanish is the default for the initial worker rollout.  
**LANG-02** English may remain available as a user preference/toggle, but switching language must not lose task state.  
**LANG-03** Translate navigation, task names, instructions, validation, errors, confirmations and help text.  
**LANG-04** Product names, lot numbers, barcodes, numeric quantities and units remain unchanged unless a controlled display translation exists.  
**LANG-05** Ingredient master supports an approved Spanish display name used on worker screens. Do not silently machine-translate production instructions.  
**LANG-06** Operational instructions that require translation are maintained/reviewed as controlled content.  
**LANG-07** Example worker labels include: **Mi horario**, **Preparar mezcla de especias**, **Lote**, **Mezcla 2 de 4 — 40 gal**, **Cubeta de especias 2**, **Escanear ingrediente**, **Cantidad requerida**, **Agregado**, **Continuar**, **Necesito ayuda**, and **Completar cubeta**.

---

## 19. QuickBooks invoicing — later slice

- Target QuickBooks Online unless owner confirms Desktop.
- Salad Soulmates remains source of truth for products, recipes, production lots, ingredient genealogy, inventory and physical fulfillment.
- QuickBooks remains accounting source of truth for invoice IDs, balances, payments and accounting adjustments.
- Invoice candidates are created only from confirmed physical fulfillment.
- Admin reviews customer, quantity, price, terms and tax before explicit creation.
- Idempotency/reconciliation prevents duplicate invoices.
- Sending invoice email is a separate explicit action.

---

## 20. UX requirements

### 20.1 General

- Use Salad Soulmates terminology: Recipe, Lot #, Mixer Batch, Spice Bucket/Spice Prep, Mix Date, Ingredients, Measurements, Lbs, Yield, By.
- Minimum 48px touch targets on floor workflows.
- One primary action per mobile production step.
- Scanning should reduce typing, not add scans that do not improve traceability.
- Worker should scan the batch/spice context once, then scan source ingredients into that context.
- Color is never the only signal.
- Manual entry is available if scanning fails, with reason/audit when appropriate.
- Errors state expected ingredient, scanned material and resolution.
- Interrupted tasks resume without losing scans, quantities or progress.

### 20.2 Administrator navigation

As modules are released, administrator navigation may include:

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
- Receiving
- Production
- Feedback

Unimplemented modules must be hidden or clearly marked as unavailable rather than looking functional.

### 20.3 Worker mobile navigation

Worker mobile is a separate, intentionally reduced experience. Initial navigation should normally be limited to:

- **Mi horario**
- **Trabajo actual** when a task is in progress
- **Necesito ayuda**
- language/profile access as needed

Workers must not see administrator navigation merely because the app is responsive.

### 20.4 Required production mobile flow

A production task must be recognizable at a glance, for example:

**Leo's Select Italian — Lote 26126**  
**Mezcla 2 de 4 — 40 gal**  
**Cubeta de especias 2**

The worker flow then presents one clear step at a time:

1. Confirm assigned task / scan the batch-spice context once when required.
2. Show the next recipe ingredient and required measurement.
3. **Escanear ingrediente** or authorized manual entry.
4. Validate the serialized source against the expected ingredient/status.
5. Confirm actual quantity if needed.
6. **Marcar agregado** / continue.
7. Repeat until all required lines are complete.
8. **Completar cubeta**.
9. Continue into the linked mixer/QC/holding-tank steps when authorized.

The screen should emphasize progress, expected ingredient, required amount and the primary action. Administrative inventory, supplier and planning detail should be hidden from the worker unless directly necessary to resolve an exception.

### 20.5 Full administrator mobile access

Authorized administrators must be able to perform their permitted workflows from phone as well as desktop. Desktop can use denser operations views; mobile uses searchable lists/staged forms without reducing permissioned capability.

---

### 20.6 Worker mobile design constraints

- Target current iPhone/Android browser widths; 390px is the primary acceptance width.
- Minimum 48px touch targets and large scan/continue buttons.
- Avoid dense tables; use one ingredient/task card per step.
- Keep visible text short and action-oriented.
- Preserve current task state across refresh/navigation/language switching.
- Show progress such as **Ingrediente 3 de 9** and a clear completed/remaining count.
- Wrong scan or blocked material stops progression and offers **Necesito ayuda**; workers cannot self-override restricted conditions.
- Scanner/camera failure must have a controlled manual-entry fallback.
- Worker should not need to type supplier lot numbers when a valid barcode can be scanned.

## 21. Technical architecture

- **Application/frontend:** Next.js + TypeScript responsive PWA
- **Web hosting/deployment:** **Vercel**
- **Database:** **Supabase PostgreSQL**
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage where required
- **Authorization:** Supabase Row Level Security + application-level role checks
- **Source control:** GitHub
- **Validation/API:** typed server actions/API layer with schema validation
- **Internationalization:** application locale framework with reviewed Spanish worker copy and English admin/worker fallback
- **Scanning:** browser/camera scanning initially; dedicated scanner support later if needed
- **Labels:** browser/network-print label abstraction; exact printer integration selected during label implementation
- **Observability:** structured application/error logs without exposing sensitive operational data

Vercel hosts the application. Supabase provides the managed database/auth/storage services. No production environment should be provisioned until Phase 1 mockups are approved and the user is ready to authenticate in the browser.

### 21.1 Environments

- local development;
- preview/test;
- production.

Interactive mockups must remain clearly separate from live production data.

---

## 22. Nonfunctional requirements

- Multi-tenant-ready organization/facility model even if Salad Soulmates is the only initial company.
- Row-level authorization by organization/facility/user role.
- TLS in transit and managed encryption at rest.
- Append-only audit events for trace-critical operations and corrections.
- Managed backups / point-in-time recovery appropriate to selected Supabase plan.
- Idempotent scan/submit APIs.
- Transactional writes for ingredient usage, inventory events, mixer/tank transfers, packaging and shipment confirmation.
- Barcode validation target under 1 second on normal facility connectivity where feasible.
- Trace query target under 10 seconds at future production volume.
- Accessible management interface targeting WCAG 2.1 AA.
- Responsive on current iOS Safari, Android Chrome and desktop Chromium browsers.

---

## 23. Initial build proposed schema

### Ingredient

- id
- organization_id
- name
- internal_code (optional)
- category (optional)
- default_uom
- traceability_mode
- active
- created_at / updated_at

### Allergen / IngredientAllergen

- allergen_id
- name
- ingredient_id

### Product

- id
- organization_id
- name
- product_code
- standard_batch_yield (current standard 40)
- standard_batch_uom (gal)
- active
- notes

### Recipe

- id
- product_id
- name

### RecipeVersion

- id
- recipe_id
- version_number
- status: Draft / Released / Retired
- effective_date
- expected_yield / yield_uom
- notes
- created_by / released_by / timestamps

### RecipeSection

- id
- recipe_version_id
- name or generated section label
- sequence

### RecipeLine

- id
- recipe_section_id
- ingredient_id
- display_measurement
- normalized_quantity
- normalized_uom
- normalized_lbs (optional)
- sequence
- instructions

### RecipeQCRule

- id
- recipe_version_id
- name
- minimum_value
- maximum_value
- uom
- instructions

### Employee / UserPreference

- employee/user/profile id
- organization_id / facility_id
- display_name
- role
- active
- preferred_locale (`es` initial worker default; `en` supported)

### EmployeeAvailability

- employee_id
- weekday/date
- available_from / available_until
- facility_id

### PTOBlock

- employee_id
- starts_at / ends_at
- status
- private_admin_note (optional)

### ScheduledWork / WorkAssignment / ScheduleRevision

- activity_type
- facility/date/start/end
- linked_entity_type / linked_entity_id
- instructions / localized instructions
- draft/published/cancelled state
- one or more assigned employee IDs
- assignment status and worker timestamps
- revision / published_by / published_at

---

## 24. Future trace-critical schema

### ProductionLot

- id (UUID)
- product_id
- assigned_production_date
- internal_dddyy_code (internal-only; non-unique)
- planned_gallons
- planned_mixer_batch_count
- status
- created_by / created_at

### MixerBatch

- id (UUID)
- production_lot_id
- sequence_number
- planned_yield = 40 gal unless configured otherwise
- recipe_version_id / immutable recipe snapshot reference
- status
- started_at / completed_at
- operator(s)

### SpicePreparation

- id (UUID / scannable barcode)
- mixer_batch_id (unique one-to-one)
- display_code (e.g. product-lot-batch short code)
- status
- prepared_by / started_at / completed_at

### SupplierItem / Receipt / SerializedIngredientUnit

- supplier item pack/UOM configuration
- receipt line
- supplier lot
- unique physical package serial/barcode
- original quantity/UOM
- remaining quantity/UOM
- status/location
- expiration/best-by where relevant

### SpiceMaterialUsage

- spice_preparation_id
- recipe-line snapshot/reference
- serialized_ingredient_unit_id
- supplier lot snapshot
- quantity_used / UOM
- operator
- timestamp
- correction/reversal linkage

This record is a primary genealogy edge for recall.

### HoldingTankSession

- id
- tank identifier
- product_id
- production_lot_id
- opened_at / closed_at
- status

### HoldingTankTransfer

- holding_tank_session_id
- mixer_batch_id
- quantity / UOM
- transferred_by / timestamp

### PackagingRun

- holding_tank_session_id / production_lot_id
- bag_size = 1 gal current profile
- bags_per_case = 4 current profile
- bags_filled
- cases_completed
- waste/variance if captured
- operator / timestamps

### LabelProfile / BagLabelPrint

- product_id
- approved display product name
- approved ingredient statement
- label template/version
- production_lot_id / lot code
- print count / timestamp / operator

### ShipmentFulfillment

- order/customer
- product_id
- production_lot_id
- quantity/cases
- date/time
- operator/status

---

## 25. Acceptance tests

### 25.1 Phase 1 recipe setup

1. Recreate the structure of at least two photographed multi-section product formulas.
2. Preserve operator-facing measurements such as cups/oz/gal/lb/packages/cases.
3. Show allergens on the recipe and production preview.
4. Release a recipe and prove a later edit does not modify the released version.
5. Preview `Mixer Batch 1 of N — 40 gal` with one corresponding Spice Prep record.

### 25.2 Production planning — later slice

1. Enter/open customer demand for a product.
2. Convert demand to required gallons.
3. Calculate planned 40-gallon mixer batches before production.
4. Create the same number of planned spice-prep records automatically.
5. Expand released recipes to total ingredient requirements.
6. Compare requirements with on-hand/inbound stock.
7. Display shortage and recommended supplier-package purchase quantity.

### 25.3 Receiving/serialization — later slice

1. Receive an ingredient with supplier lot.
2. Create or capture a unique physical-package barcode/serial.
3. Receive multiple packages under the same supplier lot while retaining separate identities.
4. Partially use a package and retain remaining quantity and identity.

### 25.4 Spice prep / mixer batch — later slice

1. Assign internal production code `26126` early in the production day before mixing.
2. Planned production creates multiple 40-gallon mixer batches as required.
3. Every mixer batch has exactly one spice-prep bucket.
4. Scan the spice-prep/batch identifier once to open the correct recipe.
5. Scan the correct serialized source package against a recipe line.
6. Scan a second source package/lot for the same line and preserve both.
7. Attempt wrong/held ingredient and block it.
8. Complete Spice Prep and mark it Ready.
9. Use only that spice prep for its linked mixer batch.
10. Complete the 40-gallon mixer batch and transfer it to the holding tank.
11. Trace the mixer batch back to every serialized ingredient used.

### 25.5 Packaging / recall — later slice

1. Record multiple mixer-batch transfers into a holding tank while retaining each batch's genealogy.
2. Package product into 1-gallon bags and 4 bags per case.
3. Print bag labels showing the correct Product Name and Ingredient Statement; do not print DDDYY.
4. Defer bag-label lot lookup until the customer-facing finished-label lot policy is approved.
5. Search a supplier lot and return every affected production lot and customer shipment.

---

## 26. Open discovery questions

These do not block the initial master-data/scheduling build, but they matter before receiving, live worker production, packaging and recall are finalized.

1. What exact rule is used when order demand is not an even multiple of 40 gallons: round up to a full batch, allow a partial final batch, or plan standard overage?
2. What approved finished-label lot format and customer recall key should replace the former DDDYY assumption?
3. If the same product has multiple production lots/runs in one day, what customer-facing finished-label lot distinguishes them, if required?
4. If a planned lot is assigned early in the day but the actual mixing occurs the next day, does the internal DDDYY code remain the originally assigned code or change to the actual mix date?
5. What exactly does **Fix Date** mean operationally?
6. What does **Added Lot #** represent on the current paper worksheets?
7. What do `PL`, `RACKS`, and other product-specific yield/header fields mean?
8. What are the printed product-specific weight ranges measuring?
9. Which existing supplier barcodes uniquely identify a physical package versus only an item/SKU or supplier lot?
10. What printer/label stock is used for ingredient serialization and for finished bag labels?
11. Is the bag label physically applied to every one-gallon bag, or are labels printed as a set for the four bags placed in one case? The customer can read the lot from the bag label either way, but print-count/pack workflow depends on the physical process.
12. Can a holding tank ever contain more than one production lot or product, or carry product into another production day?
13. How are tank residuals/waste recorded today?
14. Which recipe lines do not require source serialization (for example facility water)?
15. Which customer-order unit is most useful for planning: cases, bags, gallons, or a combination?

---

## 27. Source artifact register

The eight photographed source documents are retained under these names:

1. `01_Inventory_Material_Requirements_Worksheet_Page_1.jpeg`
2. `02_Inventory_Material_Requirements_Worksheet_Page_2.jpeg`
3. `03_Batch_Worksheet_Log_Gumbys_Ranch_Dressing.jpeg`
4. `04_Batch_Worksheet_Log_Honey_Mustard.jpeg`
5. `05_Batch_Worksheet_Log_WNM_Ranch_Dressing.jpeg`
6. `06_Batch_Worksheet_Log_Leos_Select_Italian.jpeg`
7. `07_Batch_Worksheet_Log_Balsamic_Vinaigrette.jpeg`
8. `08_Batch_Worksheet_Log_Creamy_Caesar.jpeg`

These are discovery evidence and should remain beside the PRD so mockup/build decisions can be checked against the actual paper process.

---

## 28. Explicit product decisions as of v2.2

- Build incrementally; do not attempt one monolithic launch.
- Working mockups are required before each meaningful live build slice.
- The first live staging increment now includes master data, order-driven planning/inventory, workforce scheduling and the Spanish worker mobile schedule shell.
- The existing Product Batch Worksheet Log will be **replaced**, not merely reproduced as a digital spreadsheet.
- The source worksheets remain the evidence for recipe structure, required fields, QC and current terminology.
- Customer/order demand drives production planning and purchasing.
- One standard mixer batch is currently **40 gallons**.
- The planned number of mixer batches is calculated before production.
- **One mixer batch = one spice-prep bucket**, always one-to-one.
- Each mixer batch/spice-prep pair receives a unique internal scannable identifier.
- Worker scans the batch/spice context once, then scans serialized source ingredient packages into recipe lines.
- Worker production execution is phone-first and Spanish-first; workers see only their own published assignments and simple operational steps.
- Scheduling, PTO/conflict checks and draft/publish behavior are core product requirements, not a later add-on.
- Supplier physical ingredient packages are serialized/barcoded so the exact source can be traced.
- Production lot is assigned early in the day before mixing begins.
- DDDYY is an internal production code, not a customer-facing lot format.
- Mix Date is separate from lot assignment.
- Customer-facing recall reference and finished-label lot policy remain pending; they must not use DDDYY.
- Current packaging is **1-gallon bags, 4 bags per case**; the earlier 2-gallon assumption is superseded.
- Bag label contains at minimum Product Name and approved Ingredient Statement; finished-label lot content remains pending its separate policy and must not be DDDYY.
- Completed 40-gallon mixer batches transfer to a holding tank while retaining individual batch/source genealogy.
- Inventory is still required, but the primary inventory question is material availability for current/upcoming orders rather than maximizing warehouse stock.
- Inventory views must show on hand, available, committed, inbound, projected remaining and shortage.
- Purchasing recommendations come from order-driven material shortages rounded to supplier pack sizes.
- Reorder points/safety stock are optional secondary controls, not the main planning model.
- Human-readable recipe measures and normalized calculation quantities coexist.
- Supplier pack sizes/conversions are configurable data, not hard-coded formulas.
- Allergens shown on the current paper worksheets must be supported.
- Vercel hosts the application; Supabase provides PostgreSQL/Auth/Storage.
- Scheduling, QuickBooks and advanced recall workflow remain later slices.
