# Implementation decisions

## 2026-09-20 — Collapsible application navigation

The owner requested a collapsible sidebar. The collapsed desktop rail shows the
leaf logo, an expand icon and page icons; expanding restores the full branding and
page labels. Logo navigation returns Home. Icon links retain localized accessible
names and hover labels, active-page indication and existing permission filtering.
Keep the selected state during app navigation. On phones retain the horizontal
navigation layout, with the same toggle hiding or showing labels.

## 2026-09-20 — Supplier directory and visible creation action

The owner requested adding suppliers and listing them like the other catalog
screens, while explicitly retaining open purchase orders. Show supplier name,
contact details, status and open purchase-order count in a table. Put Add supplier
in the page header with a dedicated entry form that returns to the directory.
Keep expandable purchase history, customer demand and contact/settings below each
supplier. Preserve existing permissions, purchasing logic and saved records.

## 2026-09-20 — Release packaging setup and all outstanding PRs

The owner explicitly requested finishing packaging, merging all outstanding PRs,
building, deploying and providing a Preview. This authorizes PRs #7 (continuity),
#8 (shipping preparation) and #9 (packaging setup), plus their tested additive
migrations in the existing hosted database. Packaging remains setup only, with
one label per bag and editable 3-by-5-inch defaults. Shipping remains preparation
only; production completion, tank transfers and actual fulfillment stay deferred.

Hosted migrations are `20260920051807_packaging_setup` and
`20260920051826_shipping_drafts`. Their SQL is unchanged from the tested candidates;
do not replay the old candidate timestamps. RLS is enabled, anonymous inserts and
authenticated updates/deletes are denied, and neither table contains test records.
Security advisors match the previous baseline. Combined checks and deployment
evidence are recorded in PR #9. Real Auth acceptance, independent review and
physical printer/scanner acceptance remain open.

## 2026-09-20 — Packaging setup before scheduling

The owner requested packaging next, then selected **Build packaging setup first**
when asked about its missing production-completion/tank-transfer dependency.
Implement product packaging configuration and controlled, versioned label content;
defer physical packaging execution until production/tank genealogy is available.
The owner confirmed one label per bag, approximately 3 × 5 inches, and may change
the size later. Initialize width 3 inches and height 5 inches with editable dimensions.

Preserve existing product defaults until a version is explicitly approved. Keep
saved orders and customer pricing/packaging snapshots unchanged. Use a clearly
marked sample preview without a real lot. Do not invent printer integration,
production completion, ingredient consumption or tank-mixing rules. Scheduling
remains pending. See `packaging-setup.md` for implementation and release boundaries.

## 2026-09-20 — Repository as the durable planning record

The owner requested executing the GitHub documentation workflow so development
can continue across ChatGPT Work and Codex. Keep the existing engineering policy,
versioned requirements, build plan and decision log authoritative; do not create
duplicate differently cased PRD/plan files. docs/README.md is the common entry point.
Update accepted decisions, plan status and verification evidence with each change.

GitHub confirms PRs #1, #2, #4, #5 and #6 merged at this checkpoint. Scheduling
and worker schedule is next. Existing acceptance gaps remain open. Archive stale
continuation instructions rather than allowing old access failures or local paths
to direct new sessions. No application or database change is part of this update.

## 2026-09-20 — Order-linked production and authorized merges

The owner requested the customer orders / production planning build step, then
explicitly instructed merging this and the other completed PRs. Preserve the
order-owned workflow: no separate planning entry point and no repeat order entry.
Add facility-calendar start/completion dates and a Draft/Confirmed/Cancelled
preparation state. Confirmation is preparation approval, not execution or
ingredient consumption. Crew scheduling remains the next build item.

Keep whole 40-gallon batch demand and saved recipe/packaging/price snapshots.
Generate mixer and spice-prep records atomically, one spice preparation per batch.
Revisions preserve physical-work identities and require an explanation when
reopening confirmed/cancelled preparation. Show shortages against the start date;
confirmation with shortages requires a recorded resolution. Existing single
material commitments remain authoritative. Do not post inventory during planning.

The owner subsequently requested a Preview of final merged `main` and explicitly
approved publishing the production-planning branch to `mattdannadev/Salad-Soulmates`.
PRs #4 and #2 are merged. Apply the tested additive production migration before
merging dependent code, then build a Preview from the exact final main commit.
No test records go into the hosted database.

## 2026-09-20 — Finish receiving and merge into the connected Preview

The owner requested “Let's finish receiving and serialization,” then explicitly
instructed “Merge changes once complete.” PR #4 targets the existing
`feature/materials-purchasing` Preview branch. This supersedes the earlier
candidate-only merge restriction for receiving. Complete the automated checks,
apply the tested additive migration to the existing hosted database as the
matching application's prerequisite, and merge the verified candidate.

Keep PR #2 against production main separate. Preserve the single hosted database;
verification uses disposable records only. Real Auth acceptance, independent
review and physical printer/scanner checks remain open and are not inferred from
the merge. See `receiving-serialization.md` and PR #4 for the release evidence.

## 2026-09-20 — Suppliers open into purchasing work

The owner wants supplier expansion to show purchase orders and their statuses,
not an edit form. Each supplier now shows its five most recent purchase orders,
a link to all supplier purchases, and active customer orders grouped by customer
with order-created, customer-needed and supplier-expected delivery dates.
Supplier contact/settings and new-supplier entry remain separately collapsed.

New purchase order carries the chosen supplier through customer-order selection
and limits the composer to that supplier's packs and matching ingredients. It
uses the existing shortage calculation, draft, confirmation and receiving flow;
no independent demand worksheet or supplier transmission is introduced.

Partially received and Received are derived from receipt quantities for every
purchase line. Draft, Confirmed and Cancelled remain the stored workflow states.
The outstanding-customer list means active customer demand associated by existing
ingredient IDs or saved purchases. Shipment/fulfillment completion remains future
work; receiving ingredients does not complete the customer's finished-product order.

Catalog-only viewers retain supplier access without purchase/customer queries.
Purchasing reads and writes retain their existing permission and RLS boundaries.
This is a UI/data-read extension with no migration or hosted sample data.

## 2026-09-20 — Customer-order Preview rollout verified

Commit `d0881d0` passed the complete CI check (202 tests and production build),
14 native PostgreSQL concurrency tests and all 10 desktop/phone browser tests in
[run 35483619273](https://github.com/mattdannadev/Salad-Soulmates/actions/runs/35483619273).
The browser flow adds two packaging/pricing options for one customer/product,
saves an order, verifies old prices survive an option edit, drafts/confirms a
supplier purchase and partially receives it. Language and recipe stock checks
also pass. Browser evidence remains in the seven-day CI artifact.

The tested additive migration was applied to the existing hosted project as
`20260920022110_customer_order_estimates.sql`. The filename and disposable loader
match that applied history; SQL is unchanged from candidate `20260920014459`.
Do not apply both versions. RLS is enabled; anonymous order writes and direct
execution of the privileged cancellation trigger are denied. Security advisors
show no new findings compared with the pre-application baseline. No synthetic
customer, price, order, inventory or purchase records were inserted.

The isolated validation PR feeds the already authorized feature Preview. PR #2
stays draft and production main is unchanged. Real Auth acceptance and independent
review remain open; automated tests use synthetic Auth and disposable databases.

## 2026-09-20 — Expandable customer packaging and pricing

The owner requested customer-specific packaging and prices without replacing the
existing Products grid. Keep the Product / Standard batch / Packaging / Recipe
columns and product default packaging. Add a collapsed customer pricing/packaging
section beneath each product. A customer may have multiple named options for the
same product, each with a sales unit, gallons per unit and price per unit.

Customer names resolve to stable organization-scoped customer records. Option
prices are explicitly USD with two decimal places; packaging quantities have four
decimal places. Copying product defaults saves the current case configuration;
custom options leave the product default unchanged. Options can be revised or
made inactive. Saved orders snapshot the selected packaging, price, whole-unit
count and line total so later configuration changes do not rewrite order history.
A default package with no customer price is shown as “Not set,” never as free.
Fractional packaging-unit results require correcting the batch count or option;
do not silently round customer quantities. Taxes, freight, invoicing and supplier
transmission are outside this change.

## 2026-09-20 — Customer orders own requirements and purchasing estimates

The owner rejected a separate materials worksheet and a separate Production
planning entry point. Capture customer identity/reference, products, whole-batch
counts and the customer-needed date once on the customer order. Saving the order
must pin the applicable released recipes, calculate ingredients, check current
inventory/commitments/inbound and make purchasing estimates available from that
order. Do not ask users to name or recreate a materials worksheet.

Remove the Materials/Ingredient requirements and Production planning navigation
entries. Preserve old links by routing them into Orders; preserve prior estimates
and purchase history without relabeling them as actual customer orders. Existing
material-plan snapshots can remain an internal calculation/storage mechanism.

This supersedes the earlier manual-worksheet delivery decision and brings the
minimum customer-order capture into the purchasing slice. Internal production
preparation and scheduling remain later work attached to orders: released mixer
batches, one spice bucket per standard batch, start dates, crew assignments and
worker schedules. A customer due date is not a calculated production start date;
initial purchasing estimates use it as a stated horizon until scheduling is built.
No extra order-entry screen, synthetic hosted orders, production consumption,
supplier transmission, or production application release is authorized.

## 2026-09-20 — Recipe links and ingredient requirements terminology

The owner requested links from recipe lines to tracked ingredient records and an
on-hand preview. Use the existing ingredient foreign key and the facility-scoped
inventory ledger, respecting inventory read permission. Unknown stock is shown as
“Not recorded,” distinct from a recorded zero. The stock summary expands by click,
tap or keyboard and includes a hover explanation. Ingredient records show the same
summary. This does not post inventory, change procurement or edit released recipes.
Imported generic “Worksheet block N” headings display as “Ingredients”; meaningful
preparation section names and approved instructions remain intact.

The owner found “Materials” confusing with order-driven production planning. Rename
the navigation and page to “Ingredient requirements,” and clarify that this screen
uses manually entered batch counts and an ingredient-needed date. “Production
planning” remains the separately gated customer-order, batch-calculation and
production-start-date workflow. Keep existing routes and calculation rules.

## 2026-09-20 — Account language and compact navigation feedback

The owner reported that the language selector did not update navigation/dashboard
content and requested English everywhere for Matt Danna. His existing profile was
changed from `es` to `en`; no account identity or role changed. The selector now
captures the chosen value explicitly, verifies the saved response, refreshes the
layout and reports save failures. Dashboard, shell, feedback and worker-screen
copy follow the saved account preference. This does not translate business names,
approved recipes or user-entered records.

The existing responsive navigation moves above the content at 760 CSS pixels or
less. The reported 691-pixel embedded browser viewport therefore uses the same
compact navigation as a phone. Wider windows retain the left sidebar; the owner's
question did not request a navigation redesign.

## 2026-09-20 — Complete receiving and physical serialization candidate

The owner requested execution of the receiving/serialization build step. Continue
from the materials/purchasing branch so receipt-linked inbound behavior remains.
Use immutable physical identities and append-only balance/status events, with
supplier barcode reuse only for unique physical packages. Preserve the current
single-database decision, mandatory engineering standards and open release gates.
Build and verify the additive migration in disposable databases; the request to
build this step does not itself release a new shared-database migration.

## 2026-09-20 — Connected Preview for owner testing

After the candidate passed CI, the owner requested: “Launch so I can test it.”
Launch the feature as Preview in the existing Vercel project. Under the existing
single-database decision, the Preview uses real Supabase Auth and operating data.
The tested additive materials/purchasing migration was applied as a launch
prerequisite; the user was told that saved Preview entries are real records.
No synthetic data was inserted and no second hosted database was created.

The hosted migration version is `20260920011508` (`materials_purchasing`). The Git
filename and disposable-test loader now match it; SQL is unchanged from the tested
candidate `20260920001513`. Do not apply both versions. The two public Supabase
connection variables are scoped to the feature Preview branch. No production
application deployment or PR merge is included. Existing real-Auth acceptance and
independent-review gates remain open.

## 2026-09-20 — Materials and purchasing candidate

The owner requested the next build step after materials requirements and purchasing
were identified. Implement it in a draft PR against current production main,
retaining the open refactor acceptance gates and the single hosted database.
Use explicit batch counts from released recipes until customer-order-driven
production planning is built. Purchase drafts do not send supplier orders;
Confirm records an order already placed outside this app. See
`materials-purchasing.md`. Production deployment and the new migration require
separate release authorization.

## 2026-09-19 — Explicit production release authorization

After CI passed, the owner requested deployment and explicitly confirmed merging
PR #1, updating the live Vercel site, and applying the two pending migrations.
This authorization supersedes the earlier Preview-only restriction for this
release. It does not authorize sample data, a second hosted database, or unrelated
operational changes. Remaining real Auth, broader browser, isolation-level, full
review, and branch-protection acceptance items stay open; authorization does not
claim those checks have passed.

The existing hosted project recorded `refactor_reliability` as `20260919231113`
and `serialize_inventory_units` as `20260919231118`. Their Git filenames now match
that history; SQL content is unchanged from the versions tested in CI. Do not
replay the earlier candidate timestamps as additional migrations.

## 2026-09-18 — One hosted database

The owner explicitly chose one Supabase database for this small company, superseding the separate staging-database recommendation in PRD v2.2 and Build Specification v1.1. Keep those source documents unchanged as historical reference; this decision governs the implementation.

- GitHub: `mattdannadev/Salad-Soulmates`, initial branch `main`, both confirmed by the owner.
- Supabase: **Salad Soulmates**, organization **Danna Lab**, project `ddpfmzssgxkvvfkpcvuv`.
- Use this project for the application. Do not create a second hosted staging database.
- Automated database tests run in disposable local PostgreSQL through PGlite; tests never write to the hosted database.
- Keep schema changes in versioned `supabase/migrations` files and apply transactionally.
- Do not load sample orders, ingredient balances, or fake operating records into the shared database.
- The single-database decision does not enable receiving, production consumption, packaging, or shipping before their acceptance gates.
- Auth roles and organization/facility isolation remain enforced. No database password or privileged service key belongs in the browser or Git repository.

## Reference precedence

Current explicit owner instructions > this decision log > Build Specification v1.1 > PRD v2.2 > illustrative mockup values. Scheduling/PTO and Spanish worker mobile remain committed Increment 1A scope despite a leftover PRD sentence calling scheduling a later slice.

## 2026-09-19 — Refactor scope and revised delivery order

The owner directed that all three supplied engineering documents be executed as the first build-plan refactor phase: the mandatory AGENTS policy, the refactor audit/acceptance criteria, and the continuation instructions. Apply the policy to existing and future code; do not treat documenting it as completing the refactor.

The approved remaining delivery order is: full engineering refactor → materials requirements and purchasing → complete receiving/serialization → customer orders and production planning → scheduling and worker schedule → packaging → shipping → dropdown-list/reference-data management → third-party product-grid replacement last.

Preserve current receiving, access-approval, settings/reference-list, and other newer work. The later placement of reference-data completion does not authorize deleting implementation already present. This is a sequencing change, not an authorization to change confirmed operational rules. See `docs/build-plan.md` and `docs/engineering-refactor.md` for scope and actual progress. No automatic merge, production deployment, new hosted database, or shared-database test writes are authorized by this refactor.

## 2026-09-19 — Preserve the full app in the isolated Preview

The owner asked to finish the refactor and include Recipes and the other missing
original features. The Preview's incomplete synthetic administrator permissions
hid existing destinations; correct the fixture rather than weakening production
authorization. Products and Recipes were placeholder pages in current main.
Connect read-only catalog/version views to the existing schema and explicitly
carry forward authoring and the remaining original requirements in the build
plan. Keep the Preview synthetic, and keep production and shared data unchanged.

The owner explicitly reaffirmed full administrator access. The synthetic Preview
administrator receives all seeded permissions, and admin capabilities must remain
available on phones as well as desktop. This does not authorize shared-database
writes or enable unfinished operational modules. The reattached September 16
prototype package is retained as requirements context, with later explicit
business decisions and the current build specification taking precedence.

## 2026-09-20 — Customer directory and operational home

Orders use a customer lookup with Add customer and View customers actions. The
customer directory holds contact, email, phone, address and notes, plus open
orders with order and pickup dates. Customer names stay stable to preserve
existing pricing and order identity; contact edits are revision checked.

The owner clarified that the date is **Customer pickup date**, and navigation
must say **Orders**. Prices come from customer/product/package records. Batch
totals are calculated from package price and the number of packages in a
40-gallon batch; there is no independent batch price or volume discount.

Home becomes a live operations dashboard: pickups, outstanding confirmed supplier
purchases, ingredient balances, and production preparation. Pickup cards show
each product and its batch count plus the order total. Recent shipped cards must
also show products and batch counts when physical fulfillment is implemented.
Shipping drafts are not actual shipments; the current section explains this gate.
Owned inventory includes held stock and must not be represented as available stock.

## 2026-09-20 — Dated demand and supplier purchase generation

Upcoming pickups includes every active order strictly after today's facility date,
ordered soonest first; today's count and overdue counts remain separate. Product
names and batch counts stay on every pickup card. The fixed desktop navigation
must scroll independently so every destination remains reachable.

The owner requested purchasing based on orders and available versus missing
inventory. One dashboard action generates supplier purchase drafts from current
cumulative active demand, grouped by supplier and supporting order. It uses the
preferred active supplier pack (or the sole active choice), rounds to whole packs,
and flags ambiguous packs and existing drafts for review. It does not mark orders
placed or transmit supplier messages. Confirmed outstanding inbound counts only
when due by the production date, or pickup date until production is scheduled.
Shared supply counts once. Held/expired stock is excluded by existing availability
rules, and later deliveries cannot conceal an earlier shortage. Expiry treatment
is conservative: stock must remain usable at each demand horizon.
