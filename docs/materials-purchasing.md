# Materials requirements and purchasing

Implementation branch: `feature/materials-purchasing`, based on production main `90fd1f8`.

This is the next feature candidate requested on September 20. The existing real
Auth and independent-review gates remain open. Preparing this draft does not mark
Phase 1 accepted or authorize a production deployment/database migration.

## Behavior

- `/app/materials` saves named worksheets of released 40-gallon recipe versions and
  batch counts. Ingredient quantities and their contributing recipe lines are
  snapshotted. Saving reserves planning demand; it never consumes owned stock.
- Each worksheet shows requirements, usable stock, commitments from other active
  worksheets, confirmed inbound due by the needed date, and the resulting shortage.
  The selected worksheet is not subtracted twice. Reopening a worksheet recalculates
  supply against current receipts and confirmed purchases.
- Stock from a receipt that expires before the needed date is excluded. Opening
  balances and adjustments have no lot-expiry metadata; their ledger quantity is
  included. Holds, staging and consumption are still later workflow work.
- `/app/purchasing` defaults to an active preferred pack or the only active pack.
  Multiple unpreferred choices require selection. Incompatible units block drafting;
  no conversion factor or density is guessed.
- Supplier drafts preserve SKU, pack size, units, raw shortage, recommended whole
  packs, purchased quantity, and a required reason for overrides. Drafts do not
  count as inbound. The database recomputes these values when saving.
- A user can record an order already placed with a supplier by entering its external
  reference and marking it Confirmed. No supplier email or order transmission occurs.
- Receiving can link to a confirmed purchase line. Partial receipts add owned stock
  and reduce outstanding inbound exactly once. Over-receipts, wrong suppliers,
  wrong ingredients/units, conflicting retries and cross-facility links are rejected.
- Saved worksheets are immutable. Cancel and create a replacement to change batch
  counts; cancellation releases commitments. Cancel any linked Draft first.
  Confirmed inbound stays on record independently. Received purchases cannot be
  cancelled; quantity corrections/returns require a later explicit workflow.
- Drafts are immutable snapshots. Cancel and replace an unreceived draft to change
  its date/quantities. Additional drafts can cover a remaining shortage after an
  earlier purchase is confirmed.

The later customer-order/production-planning phase will supply demand. This slice
uses explicit batch counts and does not create mixer batches, spice buckets or
production schedules. Existing approved recipe revisions, testing, scheduling,
packaging, shipping, reference-data and grid-upgrade scope remains unchanged.

## Data and security

Migration: `20260920001513_materials_purchasing.sql`, generated with Supabase CLI
2.102.0. It adds `material_plans`, `purchase_drafts`, `purchase_draft_lines`, and an
optional purchase-line reference on receiving lines. It contains no operational
seed data and has not been applied to the hosted project.

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
2. Explicitly authorize and apply the single additive migration to the existing
   hosted project, after checking its migration history.
3. Deploy the corresponding application commit. New receiving readers depend on
   these tables, so the migration must precede deploying this application version.
4. Validate with approved real operational records. Do not seed sample orders,
   balances, receipts or purchases into the shared project.

No merge, production deployment or hosted migration occurred in this feature build.
