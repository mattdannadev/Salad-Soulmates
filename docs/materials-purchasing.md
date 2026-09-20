# Materials requirements and purchasing

Implementation branch: `feature/materials-purchasing`, based on production main `90fd1f8`.

This is the next feature candidate requested on September 20. The existing real
Auth and independent-review gates remain open. Preparing this draft does not mark
Phase 1 accepted. The later launch request authorized a connected Preview; see
the launch record below. Production application release remains pending.

## Current behavior after owner testing

The owner rejected standalone materials worksheets and a separate production
planning entry point. `/app/orders` is now the single demand-entry point: customer,
reference, products, whole 40-gallon batch counts, packaging/pricing options and
the customer-needed date. Saving atomically records the order and its ingredient
requirements using the active released recipe for each product.

- Requirements, usable inventory, other commitments, confirmed inbound and
  shortages appear on the saved order. Saving commits demand without consuming
  stock. Supply is recalculated on return using current receipts and purchases.
- The customer-needed date is the estimate horizon. It is not an automatic
  production start date or supplier arrival deadline; internal production and
  scheduling remain later order-linked work.
- `/app/materials` and `/app/planning` lead to Orders. They are removed from the
  navigation. Historical standalone estimates and purchase links remain readable
  without manufacturing customer orders for them.
- The Products grid retains its original four columns and defaults. Expandable
  customer options support multiple packaging units and USD prices per customer
  and product. Defaults can be copied as a case or overridden with a named unit
  and explicit gallons per unit. Options can be edited or inactivated.
- Orders snapshot chosen packaging and prices. Unconfigured prices stay “Not set.”
  Batch quantities must divide into whole packaging units; no customer quantity
  rounding is hidden. Price totals are product line subtotals, excluding taxes and
  freight. Changing an option cannot alter a saved order.
- Review purchasing from the order. Supplier selection, whole-pack rounding,
  override reasons, immutable purchase snapshots and confirmed-inbound rules
  remain intact. Drafts do not count as inbound; confirming records an order
  already placed externally and does not transmit it to a supplier.
- Partial receiving adds owned stock and reduces outstanding inbound once.
  Expired receipt stock is excluded using the estimate horizon. Existing holds,
  staging, production consumption and lot execution remain later scope.
- Cancel and replace a saved customer order to revise demand. Linked open purchase
  drafts must be cancelled first; confirmed inbound remains independently on
  record. Customer order history and its estimates are not deleted.

## Customer-order extension

`20260920022110_customer_order_estimates.sql` adds organization-scoped customers,
customer/product pricing options and facility-scoped customer orders. The order
and internal material snapshot share an ID and save atomically. RLS and triggers
validate direct writes as well as RPCs. Request IDs protect against duplicate
orders, and optimistic revisions protect option-price edits. A narrow trigger-only
privileged lookup prevents old estimate cancellation paths bypassing order-write
permission. No new privileged browser client or operational seed data is added.

The extension passed 202 automated tests, the production build, 14 native
PostgreSQL concurrency tests and all 10 desktop/phone browser tests in
[CI run 35483619273](https://github.com/mattdannadev/Salad-Soulmates/actions/runs/35483619273).
It is applied as `20260920022110` to the existing database, with no synthetic
operating records. SQL is unchanged from candidate `20260920014459`; the Git
filename and test loader were reconciled to the applied version. No production
application release or merge is included.

## Data and security

Migration: `20260920011508_materials_purchasing.sql`, originally generated with
Supabase CLI 2.102.0 and renamed to match the applied hosted version. It adds `material_plans`, `purchase_drafts`, `purchase_draft_lines`, and an
optional purchase-line reference on receiving lines. It contains no operational
seed data. It was applied transactionally to the existing hosted project on
September 20 after the owner requested a test launch.

RLS restricts organization and facility; existing `planning.read`/`planning.write`
permissions govern worksheets and purchases. Receiving users can read purchase
headers/lines to select inbound, but cannot read worksheets or create purchases.
The app also requires ingredient, recipe and inventory read access to avoid silently
calculating against hidden supply. All operational mutations are audited.

RPCs run as the signed-in invoker. The receipt and ingredient-unit triggers use
narrow, non-callable privileged helpers for locks that read-only receivers cannot
acquire directly. No new service-role access is introduced. Worksheet and draft
request IDs are retry-safe; status updates use optimistic revisions. Receipt locks
serialize against other receipts and cancellation. Ingredient row locks preserve
base units when the first worksheet is being saved.

Quantities must be validated in the ingredient base unit with at most four decimal
places, matching the inventory ledger. Unsupported precision is explicitly rejected.

## Verification

Baseline: clean `npm ci` and `npm run check`, 145 tests and the production build.
Feature verification: 177 automated tests, strict TypeScript, Airbnb lint, formatting,
and the production build passed. [CI run 35479540224](https://github.com/mattdannadev/Salad-Soulmates/actions/runs/35479540224)
also passed all 12 native PostgreSQL concurrency tests and all 8 browser tests across
desktop and phone. Its four screenshots are available in the `browser-evidence`
artifact (retained for seven days). Browser suites run sequentially because they
share one mutable fixture. A read-only audit of the 75 released recipe lines found
no incompatible base units or quantities exceeding four decimal places.

New coverage exercises persisted requirements, duplicate/conflicting submissions,
pack selection/rounding, permission failures, supplier snapshots, confirmations,
partial receipts, over-receipts, cancellation, and facility isolation.

Desktop and phone browser tests use a localhost-only synthetic Auth service plus
the real migration SQL in disposable PGlite. Native PostgreSQL tests separately
exercise overlapping request, unit-change, receipt and cancellation transactions.
Neither creates users or data in the shared hosted database. Browser evidence is
retained as a CI artifact. This fixture is not real Supabase Auth verification.

## Release order and remaining gates

1. Review the schema and candidate diff; finish the carried-forward real Auth and
   independent-review gates. Native concurrency coverage targets READ COMMITTED.
2. The additive migration is applied as `20260920011508`. Do not replay the earlier
   candidate filename `20260920001513` as another migration.
3. Deploy the corresponding application commit. New receiving readers depend on
   these tables, so the migration must precede deploying this application version.
4. Validate with approved real operational records. Do not seed sample orders,
   balances, receipts or purchases into the shared project.

## Connected Preview launch — September 20

The owner requested: “Launch so I can test it.” The existing Vercel project hosts
this feature as Preview. Its two public Supabase connection settings are scoped to
`feature/materials-purchasing`. It uses the existing real database and sign-in;
records saved in this Preview are real operational records.

The applied migration preserves the exact tested SQL. All three new tables have
RLS enabled, anonymous RPC execution is denied, and receipt trigger helpers are
not directly executable by authenticated clients. Post-application checks found
zero worksheets or receipts; no test records were inserted. Security advisors
reported only the pre-existing privileged authorization-function and leaked-password
protection findings, with no new findings from this migration.

PR #2 remains draft. No merge or production application deployment occurred.
Real Auth acceptance and independent review remain open; a connected Preview does
not claim those gates passed.
