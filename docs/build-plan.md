# Salad Soulmates — current build plan

Updated: September 24, 2026

## UI/UX overhaul — approved cross-cutting work

The owner approved a comprehensive UI/UX overhaul to make every screen and
workflow consistent, smooth, recoverable, and easy to learn. The canonical scope,
sequencing, interaction contracts, screen-family requirements, acceptance
journeys, and verification gates are in the
[UI/UX overhaul build plan](ui-ux-overhaul-build-plan.md). Treat that plan as
required context for all user-facing implementation work. It does not authorize
production deployment, shared-database sample data, or changes to existing domain
and authorization safeguards.

## Native mobile companion plan

The standalone Expo/React Native delivery plan is
[Mobile build plan](../../Mobile/docs/build-plan.md). It inherits this product
roadmap's business rules, sequencing, decisions, and release gates while
tracking mobile-specific architecture, device, accessibility, and store-release
work separately. It does not authorize a second backend, direct privileged
database access from a device, production credentials, deployment, or release.

## Current checkpoint

### Plant operations configuration — approved next delivery slice

Implement the operations-manager reference workflow as **plant configuration**,
not fixed application behavior. This slice extends the existing workforce
scheduling foundation in the following order:

1. Add a plant work-assignment policy: supervisor-assigned, worker-claimed
   daily queue, or hybrid. A claim must be atomic, attributable, conflict-safe,
   auditable, and must not create inventory, receiving, production, packaging,
   shipment, or cleaning completion records by itself.
2. Replace the worker-facing “spices” category with **ingredient prep**, and
   support the operational queue categories receiving, loading for shipment,
   ingredient prep, mixing, packaging, and cleaning. “Ingredient prep” includes
   dry and wet ingredients. Queue cards must deep-link into their canonical
   workflow—Receiving Inventory for a PO/delivery, Batch Worksheet for ingredient
   prep, mixer execution, packaging, fulfillment/shipping, or the associated
   plant/production context for Pre-Op/Post-Op—instead of duplicating transaction
   entry on a checklist.
3. Add configuration contracts for planning cadence/horizon, preparation lead
   time, mixing capacity, capacity-fill/make-ahead eligibility and release,
   post-mix hold/cooling and packaging lead time, cases per pallet and rounding,
   and raw-ingredient cycle-count cadence/scope. The reference defaults are
   Friday weekly planning, day-before prep, 6 productive mixing hours in an
   8-hour day, next-day packaging, 45 cases per pallet, and weekly counts.
4. Keep **Plant** as the manufacturing-facing UI term while retaining the
   facility-scoped database/authorization boundary. Every setting must be
   versioned or snapshotted on the planned/executed record where a later change
   could change historical meaning.

Acceptance: one plant can use a supervisor-assigned schedule while another uses
a worker-claimable daily queue; a task can retain its required crew size and more
than one worker claim/assignment; claims are race-safe and preserve attribution;
all reference values can be changed without code changes; planning keeps
make-ahead quantity distinct from customer demand; and existing facility-scoped
permissions, published-schedule behavior, audit history, inventory idempotency,
and worker-phone boundaries remain intact. This authorizes implementation and
non-production validation only—not a production migration, merge, or deploy.

The scheduler UI is a single compact command center: the calendar/timeline is
the primary surface and a contextual drawer carries task editing/detail. Do not
build separate tall pages for queue, pickup, PO-delivery and staffing data.
Its default is a configured plant workweek of daily calendars, each showing
planned task hours against daily productive capacity; day view is a drill-in.

Order follow-up: allow an authorized user to correct an active customer pickup
date with a required reason and immutable change record. Keep the customer order
and material-demand horizon synchronized, preserve the production-completion
boundary, and require an explicit review of purchasing/production after a change.

Platform tenant administration: add a separately deployed operator site backed
by the existing Supabase project. It must let a platform operator provision an
organization, see its lifecycle state and enabled-user count, and
suspend/reactivate it without deleting tenant history. Platform operators are
not tenant-role administrators; all cross-tenant operations require server-side
authorization and immutable audit records. Keep product and control-plane
contracts/migrations together. Verify platform-role denials, tenant-suspension
denials, cross-tenant RLS negatives, and UI error/empty states. Dedicated tenant
databases remain deferred pending an evidenced contractual or operational need.

### Environment plan — approved cost-conscious baseline

Use **two Supabase databases/projects** initially: the existing Production
project for live data and one separate Sandbox project for non-production Auth,
migrations, and end-to-end validation. Vercel preview deployments may use the
Sandbox environment while the team is small. Do not create paid Supabase database
branches for each preview by default; they are billed separately. A third,
dedicated Preview database remains a later option when preview isolation or
parallel review work justifies its cost. Production and Sandbox must always use
separate credentials, secrets, and deployment environment variables.

### Enterprise identity / SSO — qualified midmarket delivery gate

SSO is a **qualified midmarket capability**, not a current SMB-pilot promise or
an implied availability date. Keep the existing authentication path for SMB and
for every tenant until its SSO configuration has passed the staged acceptance
gate below. Product authorization remains server-side: SSO proves identity only;
organization, facility, role, suspension, and entitlement decisions must remain
enforced by the application and Supabase RLS rather than by IdP group claims or
client-side state.

1. **Discovery and provider decision:** before implementation, document the
   target buyer's identity requirements, supported IdP(s), tenant model, expected
   user lifecycle, and procurement/security evidence. Choose SAML 2.0 or OIDC
   (and any authentication platform/provider) from compatibility, operational,
   security, and support evidence; do not commit to a protocol or provider in a
   proposal before that gate.
2. **Tenant-safe configuration:** bind each IdP connection to one verified
   organization and verified email domain(s), with an audited, privileged setup
   workflow. Prevent a domain or issuer from being claimed by multiple tenants.
   Define safe handling for invite redemption, existing-password accounts,
   duplicate identities, email changes, contractor accounts, and just-in-time
   provisioning so that account linking never crosses organizations or silently
   escalates permissions.
3. **Lifecycle and access controls:** support the approved create, disable,
   re-enable, role-change, and tenant-suspension paths with immutable audit
   evidence. Provisioning and deprovisioning must preserve least privilege and
   remove access promptly. SCIM is deferred unless a qualified customer volume,
   lifecycle requirement, and delivery/support capacity justify it; it is not
   required merely because SSO is enabled.
4. **Resilience and support readiness:** provide an organization-scoped rollback
   from SSO to the approved fallback sign-in path, and tightly controlled,
   audited break-glass administrator access that cannot bypass tenant suspension,
   server-side authorization, or RLS. Define ownership, support verification,
   emergency recovery, configuration-change approval, and customer-facing
   operating instructions before sale.
5. **Acceptance and security review:** validate a real non-production IdP flow
   for authorized and unauthorized users; verified-domain enforcement; tenant
   isolation; safe linking/conflict cases; invitation and lifecycle events;
   deprovisioning; rollback and break-glass recovery; audit records; and
   organization/facility/RLS negative tests. Complete a security and privacy
   review of assertion/token validation, redirect URIs, issuer/audience/signature
   checks, session handling, logging, secrets, rate limits, and support access.
   Do not mark SSO sellable until the selected integration, operational runbook,
   and these tests are accepted for the contracted scope.

Inventory location-tracking follow-up: add an optional facility-level location
capability for warehouse-oriented customers. Model inventory by ingredient,
facility, stocking location, lot/package, and status, with a human-findable row /
section / level / bin hierarchy and a composed display label. Ingredient detail
must show where currently available material can be found. When the capability is
disabled, retain the SMB-friendly facility-total view and assign unlocated stock to
an explicit Unspecified location; do not create duplicate ingredient records or
break ledger, planning, purchasing, traceability, permissions, or historical
events. Acceptance requires location-level and total balances to reconcile, moves
to be auditable, and the disabled path to require no warehouse-location setup.

Ingredient-reference follow-up: show a read-only, facility-segmented availability
summary on each Ingredient page: on hand, confirmed-open-purchase-order inbound,
and active-production committed quantity. Exclude drafts from inbound; label
owned/on-hand, usable, and unavailable stock without conflating them. When enabled,
the optional location breakdown must reconcile to the facility total. Respect
facility-scoped access and retain Inventory as the single operational workspace for
receiving, adjustments, moves, package/lot detail, and event history.

Inventory management follow-up: make the Inventory workspace writable for users with
inventory-adjust permission. Record immutable manual gains, manual shrinks and
order-fill usage with ingredient, effective date, type and reason; show those
alongside purchase-order receipts. Ingredients must support optional base-unit
reorder point, par level and default reorder quantity, and the Ingredients grid
must show those controls with on-hand and low-stock status.

Receive Inventory follow-up: show all confirmed outstanding purchase orders,
filter by supplier, and select multiple orders from the same supplier. Populate
ordered/received/outstanding quantities and allow actual quantities, lot splits,
and package allocations. Acceptance requires atomic receipt/ledger/package
posting, safe retries, concurrent over-receipt prevention, complete labels,
English/Spanish desktop and phone flows, and preservation of manual receiving.
See `receive-purchase-delivery.md` for the implementation contract and gates.

Inventory-unit follow-up: the Inventory screen and the dashboard's on-hand
balances must use the stored receipt/ledger unit for each ingredient. Test gallon
and ounce balances as well as the existing pound fixture; keep the configured
ingredient unit as the empty-history fallback and reject inconsistent ledger
units rather than attempting a conversion.

Navigation follow-up: retain the desktop collapse/expand shell, including its
leaf-only brand, accessible icon links, logo-to-Home navigation and Spanish labels.
On phone-sized viewports (verified at approximately 457px), replace the long
above-content sidebar with a compact fixed navigation bar: Dashboard is the
visually prominent home destination, primary sections remain one tap away, and a
menu exposes every permission-allowed section with clear active states. Verify both
desktop states, mobile menu opening/closing, route changes and localized labels.

Phone Safari responsiveness follow-up: at the iPhone 12 acceptance viewport
(390px wide), ensure the post-login application shell has no horizontal overflow
or clipped left/right page edges. Apply safe-area-aware horizontal gutters and
audit the fixed drawer, scrim, feedback control, and bottom navigation so they do
not exceed the visual viewport. Make the top-left hamburger the prominent phone
navigation control with a 48px minimum touch target (52px preferred), a larger
visible menu icon, and preserved accessible name, expanded state, keyboard use,
and close behavior. Retain the bottom “More” control as an optional thumb-reach
entry to the same drawer unless a subsequent product decision replaces it. Add
browser coverage at 390px for no horizontal overflow, the header control opening
and closing navigation, scrim dismissal, route-selection dismissal, and reachable
focusable controls; then confirm the result on a physical iPhone 12 in Safari.

Customer and dashboard follow-up: see [scope and acceptance](customer-dashboard.md).
Use saved customer lookup and package pricing; calculate batch totals from package
prices. Label the date Customer pickup date and navigation Orders. Home must show
real pickups with product names and batch counts, outstanding supplier receipts,
and owned ingredient balances. Actual shipped records remain gated.

Supplier directory follow-up: show a catalog table and header Add supplier action,
retaining open purchase-order counts and expandable purchasing/customer demand.
Verify creation returns to the directory and purchase access remains available
on desktop and phone, using disposable browser fixtures only.

Purchasing follow-up: remove Purchasing from the main navigation. Start manual
replenishment from Inventory with the chosen ingredient fixed while selecting its
supplier, or from a supplier with one or more of its configured ingredients.
Retain customer-order demand/gap purchasing and the existing draft/confirmation
rules. Receiving behavior remains a separate follow-up.

Administration follow-up: let access managers create a user directly in Settings
with its facility and access profile selected before invitation. Show the branded
setup-email preview, preserve the existing recoverable invitation workflow, and
validate the real Supabase Auth template/callback in an approved non-production
environment before treating email delivery as accepted.

Shipping usability follow-up: unavailable actions must not display a busy cursor.
Keep confirmation disabled until physical fulfillment is implemented; cover its
disabled state and cursor in the desktop/phone shipping checks.

## Financial unit economics and order margin — approved follow-up

The product goal is a truthful **margin for every ordered sales unit** (a bag,
case, or other customer package), plus order-level revenue, cost, gross profit,
and margin percentage. Ingredient quantities, supplier packs, recipe batches,
and customer packages are distinct units in that calculation; none may be
silently treated as interchangeable.

Supplier price history and the Pricing workspace provide the starting data, and
purchase planning may show a price-based estimate. They are not historical order
margin by themselves. The following delivery order is required:

1. **Unit economics foundation.** Retain each ingredient's base calculation UOM.
   Add explicit, same-family conversion rules (for example oz/lb and fl oz/gal)
   and calculate supplier cost per ingredient base unit from the effective pack
   price. Never convert mass to volume, or infer a missing conversion. Flag the
   resulting cost as unavailable until an approved conversion or ingredient
   density/yield rule exists.
2. **Effective-dated commercial inputs.** Preserve append-only supplier prices
   and add effective-dated customer price history. A customer price, supplier
   source/preference status, and recipe version used for a historical order must
   remain explainable after later edits. The planning margin view must clearly
   distinguish a current projection from an as-of calculation and must not claim
   historical order truth.
3. **Immutable order-margin snapshots.** Introduce normalized customer order
   lines and cost-breakdown records while retaining the existing JSON order item
   snapshot during migration. At order creation, calculate and store the selected
   recipe version, ordered package count, revenue per package and total, cost per
   gallon, ingredient cost per batch and package, supplier-item/price and pack
   snapshots for every ingredient, total cost, gross profit, margin percentage,
   and an explicit margin status. Missing, inactive, ambiguous, or incompatible
   costs result in `unavailable`, never a zero-cost margin.
4. **Order and operations visibility.** Display per-bag/case margin and
   order-level totals on Orders, with a detailed explanation of the saved cost
   basis. Keep confirmed supplier quotes and actual purchase costs separate from
   planning estimates. Historical order margins are read from snapshots, never
   recomputed from current recipes or price books.
5. **Fully loaded margin.** Extend the ingredient-only margin with explicit,
   separately tracked packaging, labor, freight, tax, waste, and overhead costs.
   Until each cost source exists, label the calculation as ingredient margin or
   contribution margin; do not present it as fully loaded margin.

Acceptance requires price-effective-date boundaries, UOM conversions and blocked
cross-family conversions, multiple package sizes, missing-cost states, stale
customer/supplier-price changes, recipe revisions, direct-database protection,
and proof that later price/recipe/source changes cannot alter a saved order-line
margin. Include disposable PostgreSQL and browser coverage for per-package and
order aggregate results.

The owner subsequently prioritized packaging setup and authorized releasing all
outstanding PRs: #7 (continuity), #8 (shipping preparation), #9 (packaging setup).
See `packaging-setup.md`, `shipping.md` and PR #9 for this release and verification.
The two additive setup migrations are applied to the existing hosted database.
Scheduling remains pending. Physical packaging and shipment confirmation still
require production completion, tank genealogy and actual finished inventory.

The following main checkpoint predates those release candidates:

GitHub main `3262e179a258c3cf1ae261f4f1bbae55dd5032d1` includes merged PRs
#1 (refactor), #2 (orders/purchasing), #4 (receiving), #5 (migration alignment),
and #6 (order-linked production preparation), verified September 20.
PR #3 is closed without merging. See [continuation](continue-in-codex.md)
and the feature documents for release evidence.

**Next feature: scheduling and worker schedule.** Real-Auth, independent-review
and physical printer/scanner acceptance remain open. Merged implementation does
not mean every phase is fully accepted or that deployment was verified here.

The dated implementation notes below preserve the sequence of owner corrections.
Their candidate-only restrictions and access failures are historical where later
decisions explicitly supersede them. Follow the current decision log and task scope.

## September 20 owner correction — one order-driven workflow

Customer orders are the single demand-entry point. The owner rejected separate
Materials worksheets and a separate Production planning entry point. The flow is:

1. Capture the customer/reference, products, whole-batch counts and needed date.
   Select customer-specific packaging/prices where configured.
2. Save the order with released recipe versions and calculated ingredient quantities.
3. Show current inventory, commitments, confirmed inbound and shortages on the order.
4. Prepare supplier purchasing estimates from that order, with pack rounding and
   explicit review before recording externally placed supplier orders.
   Suppliers also show recent purchase orders/statuses, outstanding customer orders
   with dates, and supplier-specific purchase creation. Supplier contacts/settings
   stay collapsed separately from purchasing work.
5. Continue into internal batch preparation, production dates and scheduling as
   those capabilities are delivered. Do not require demand to be entered again.

Keep the Products grid and its default packaging. Add expandable customer pricing
and packaging for each product, allowing multiple units/prices per customer and
preserving selected terms on each saved order. This is part of the current order
slice, not the later product-grid replacement or physical packaging execution.

Remove the separate Materials/Ingredient requirements and Production planning nav
items. Keep old URLs usable by routing them into Orders and preserve existing
estimate/purchasing history. Internal material snapshots are implementation data,
not a second user-created worksheet. The customer-needed date is the initial
estimate horizon; production start dates remain unscheduled until the scheduling
rules are implemented.

The minimum order capture and its purchasing estimate now belong in the current
Preview slice on `feature/materials-purchasing` (draft PR #2). This supersedes the
earlier manual batch worksheet sequencing. Preserve the single hosted database and
real-data Preview decision. Real Auth and independent-review gates remain open;
no automatic merge or production application deployment is authorized.

## September 20 receiving/serialization completion

The owner requested the next receiving/serialization build step. The implementation
is on `feature/receiving-serialization-complete`, stacked on the current purchasing candidate. It
adds physical package identities, optional unique supplier barcodes, QR labels,
lookup, partial balances, audited holds/releases and planning availability. See
`receiving-serialization.md` for scope, verification and release prerequisites.
This advances implementation under the current owner instruction while preserving
the open Phase 1 acceptance gates. No acceptance gate is silently marked complete.
The owner subsequently instructed “Merge changes once complete.” PR #4 merges
into the existing `feature/materials-purchasing` Preview after verification and
the matching additive migration. This supersedes the candidate-only merge
restriction for this slice; PR #2 against production main remains separate.

## September 20 order-linked production planning

Implemented on `feature/order-production-planning`, including the latest supplier
and receiving candidates. Each saved customer order now owns production dates,
explicit 40-gallon mixer batches and one spice-prep record per batch. The start
date drives ingredient expiry/inbound checks and the purchasing arrival default.
Draft/confirm/revise/cancel controls preserve recipe snapshots and batch identities.
See `order-production-planning.md` for validation and release evidence.

The owner subsequently instructed: “Merge this and other PRs once complete.” This
authorizes the tested release and supersedes earlier no-merge instructions for
these candidates. Complete verification and database prerequisites before merging.
The broader real-Auth and physical printer/scanner acceptance items remain visible.

## Shipping foundation — packaging integration pending

The owner authorized independent shipping work while Packaging is built separately.
The shipping candidate adds order-linked shipment/pickup drafts only. Confirmation,
finished inventory deductions, actual fulfillment and returns await packaging.
See [Shipping foundation](shipping.md). This does not mark phase 7 complete.

## Approved delivery order

September 20 owner update: implement **packaging setup** ahead of scheduling,
including editable bag/case configuration and versioned label content with an
initial 3 × 5 inch label, one per bag. The owner explicitly deferred production
completion and tank transfers. Physical packaging execution remains dependent on
those workflows; scheduling is still pending. See `packaging-setup.md`.

| Order | Build phase                                          | Scope / sequencing                                                                                                                                                                     |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Engineering standards and existing-code refactor     | Complete remaining real Auth and independent-review acceptance; preserve CI and mandatory engineering standards.                                                                       |
| 2     | Customer orders, inventory assessment and purchasing | Enter customer, products, batch counts and date once. Automatically calculate ingredient needs and supplier purchasing estimates on the order.                                         |
| 3     | Complete receiving and serialization                 | Preserve existing work; receiving updates stock and outstanding inbound for order estimates.                                                                                           |
| 4     | Internal production preparation                      | Generate released batch work and spice buckets from saved orders. Keep production readiness and later start-date results attached to the order; no duplicate order-entry module.       |
| 5     | Scheduling and worker schedule                       | Plan production dates and administrator assignments linked to orders, plus worker schedules and approved PTO/mobile/language requirements.                                             |
| 6     | Packaging                                            | Complete the approved packaging workflow.                                                                                                                                              |
| 7     | Shipping                                             | Complete the approved shipping workflow.                                                                                                                                               |
| 8     | Dropdown-list / reference-data management            | Finish administration after shipping while preserving current settings.                                                                                                                |
| 9     | Third-party product-grid replacement — **Complete**  | AG Grid is now the shared grid foundation, including Spanish localization, used by the application directories. Keep future workflow changes separate from this completed replacement. |

Phase 5 implementation is in progress: see [Worker scheduling](scheduling-worker-schedule.md) for the approved facility-scoped calendar, employee assignment, utilization, permission, and audit contract. Calendar UI and release verification remain to be completed before marking the phase complete.

The scheduler is the facility's daily event board: it must support production
work (spices, mixing, making product, wrapping, and cleaning) plus unrelated
work. Production Runs are traceability groupings linked to applicable events;
their lot numbers are issued at actual start, never while merely scheduling.
Phase 5 acceptance includes separated, labeled calendar-view filters and
scheduling actions; timeframe-aware utilization in the staffing selection
panel; click-an-empty-day and form-first assignment paths; optional (never
required) drag/drop; work context on calendar cards; and consistently compact
controls.

### Dashboard schedule — planned Phase 5 capability

Add a schedule to the main dashboard that gives workers a clear, read-only view
of the operational day and upcoming work. It must surface the key dated events:
customer pickups, supplier drop-offs, employee shifts, and spice-mixing work.
Operations supervisors must be able to view the schedule for each facility they
are authorized to supervise, including a combined view when they supervise
multiple facilities; workers must see only the facilities and schedule detail
their existing permissions allow. Reuse the facility-scoped scheduling,
authorization, audit, and localization contracts rather than creating a separate
calendar or bypassing the underlying order, purchasing, and workforce records.
Acceptance includes clear empty/loading/error states, chronological event
ordering, facility attribution, desktop and phone usability, and permission
negative tests for cross-facility access.

This owner correction changes workflow and sequencing, not confirmed recipe,
lot/date, inventory, facility isolation, packaging or workforce rules.

## Phase 1 — all three documents

| Input                                   | Repository role                                                                    | Required result                                                                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Salad_Soulmates_AGENTS.md`             | Root `AGENTS.md`                                                                   | Canonical engineering policy applying to existing and future code, not a one-time prompt.                                                                                                            |
| `Salad_Soulmates_Refactor_Audit.md`     | `docs/engineering-refactor.md` plus the original audit in `docs/refactor-sources/` | Full audit scope, remediation, acceptance gates, actual verification evidence, and explicit remaining risks. The original audit is historical evidence, not proof that its missing patch is applied. |
| `Salad_Soulmates_Continue_In_Codex.txt` | `docs/continue-in-codex.md` plus original text in `docs/refactor-sources/`         | Continue in the existing repository/current branch safely, reconcile newer source, complete the full refactor, and leave incomplete work in a draft PR.                                              |

### Execution workstreams

1. **Policy and enforcement:** install the canonical policy; configure complete compatible Airbnb JavaScript/React rules and TypeScript-aware safety/promise checks; verify dependency and lockfile changes; activate reviewed, immutable-pinned CI actions.
2. **Existing-code audit and remediation:** characterize behavior before restructuring; address redirect, cookie, sign-out, password-update, and inventory-retry defects; split `saveRecord` into focused operations after action tests; audit authentication, proxy, queries, forms, imports, domain calculations, and every implemented workflow. Validate runtime input, remove unsafe casts using actual schema types, preserve authorization and inventory idempotency, and document non-obvious contracts.
3. **Verification and review:** run `npm ci` and the full `npm run check` with pinned dependencies, plus relevant browser and disposable local-database tests. Cover invalid/missing/unauthorized requests, duplicates, conflicts, external errors, retries, and loading/empty/error states. Report exact results and unrun checks. Keep incomplete work draft; require review before merge and separate authorization before production deployment.

### Non-negotiable preservation rules

Preserve current UI/workflows, routes, data, organization/facility isolation and RLS, approved lot/date rules and facility timezone, unit conversions, recipe/version invariants, immutable released records, inventory history/idempotency, and mobile/worker behavior. Use only the existing hosted database; tests use disposable local databases and must not seed or write to shared hosted data. Do not introduce unimplemented product modules as refactoring. Do not merge or deploy automatically.

### Exit gate

Phase 1 is complete only when all in-scope hand-written code has been reviewed, full compatible standards enforcement is active, complete checks pass on the actual proposed commit, and critical successful/failure workflows have browser/local-database coverage as appropriate. Production readiness cannot be inferred from passing local checks alone.

## Historical refactor progress — superseded checkpoint

The continuation is on local branch `refactor/complete-and-preserve-modules`.
Remote main was rechecked and remains `028880cebe49140271ce37f69ed6ddd406a79640`.
The refactor preserves the newer receiving, access, settings and recipe-schema
work. The owner's latest request explicitly adds usable Products/Recipes browsing
and restores every administrator destination in the isolated Preview.

See `feature-preservation.md` for the route-by-route inventory and carried-forward
recipe builder, revision, testing, scheduling and mobile requirements. Recipes and
Products previously had placeholder screens; new catalog/detail readers expose
the existing schema without enabling recipe writes. Recipe ingredient rows show an
expandable on-hand summary only for recorded balances, including a recorded zero;
unrecorded balances remain compact. Advanced authoring remains part of the build,
including taste-test and shelf-life records linked to revisions.

Products also provide a collapsed active-recipe preview with the released version,
yield, sections and recorded ingredient measurements. Acceptance requires the
preview to remain collapsed initially, respect recipe/ingredient read visibility,
and leave formulation editing exclusively on the recipe workflow.

The original continuation baseline passed all 116 tests and the build. Current
verification results are recorded in `engineering-refactor.md`. Vercel access is
restored and isolated Preview deployment works. GitHub branch creation still
returns HTTP 403, so remote CI and the draft PR remain blocked. Real Auth and
multi-session PostgreSQL integration checks remain separate acceptance gates.
Phase 1 must not be marked fully accepted until those gates and review are closed.
No production deployment, merge or shared-database changes are authorized.

## Retained later scope from the original handoff

The reattached original PRD/mockups retain full admin access on desktop and phone,
prep/lot genealogy, customers and packaging/label configuration, holds/releases,
trace/recall evidence and exports, and QuickBooks invoicing. The later build
specification places the dedicated recall workspace and QuickBooks in subsequent
increments; retain them after the approved near-term sequence rather than dropping
them because those screens are not implemented yet. No invoices or supplier
messages are to be sent as a side effect of development or testing.

## Dashboard demand follow-up — implemented, release verification

Branch `feature/dashboard-demand` adds independently scrolling navigation, all
future pickups in date order, dated ingredient coverage and automatic supplier
purchase drafts. Acceptance requires shared-stock allocation, late inbound,
whole-pack rounding, supplier ambiguity, duplicate/retry protection, permission
and facility isolation, desktop/phone browser checks and native PostgreSQL
concurrency checks. Physical production and shipment completion remain gated.
Verification and release evidence is recorded in `customer-dashboard.md` and PR #13.

## Production navigation and order-card follow-up — implementation candidate

Expose the existing worker preparations under Production Planning, with navigation
filtered by current permissions and a usable return path. Preserve the focused
worker experience and order-linked production planning. Enrich saved order cards
with product names, per-product and total batch counts, customer notes, order date,
and pickup date. A separate requested pickup date awaits a confirmed definition.

Acceptance: authorized administrators can reach worker preparations from desktop
and mobile navigation; worker access stays scoped; order-card details remain
readable on phones, show missing-value fallbacks, and preserve existing order links.
Implementation, automated validation, merge, deployment, and owner acceptance are
separate gates. This release incorporates prior worker execution
work and has been reconciled with main f66102e before release.
