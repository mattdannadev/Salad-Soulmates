# Customer orders and production preparation

Production preparation is part of the saved customer order. The existing order
entry, customer packaging/prices, ingredient estimates, purchasing and serialized
receiving remain intact. This candidate includes PRs #2 and #4 and the supplier
purchase-history improvements.

## Delivered behavior

- Enter start and completion dates in the facility calendar. Completion cannot be
  before start or after the customer's needed date.
- Save a draft to create explicit 40-gallon mixer batches and exactly one planned
  spice preparation per batch, in one transaction. Batch/product/recipe identities
  come from the immutable order snapshot. The bounded maximum is 10,000 batches
  per order; there is no silent truncation.
- Confirm preparation after reviewing ingredient coverage. Unresolved shortages
  require a recorded resolution. Confirmation does not claim ingredients have
  arrived or authorize physical production execution.
- Check usable stock, expiry and confirmed inbound against the production start,
  and use that date as the default expected delivery for new supplier purchases.
  Orders without active preparation retain the customer-needed-date horizon.
- Revise dates as a draft before reconfirming. Reopening confirmed/cancelled work
  requires a reason and preserves the existing mixer/spice identities.
- Cancel preparation with a reason before cancelling the customer order. Cancelling
  preparation alone keeps the customer's ingredient commitments active. Cancelling
  the order releases those commitments through the existing workflow.
- Show preparation state, totals and individual paired records in the order on
  desktop and phone. Saved-order cards show the planned start date.

## Reliability and access

Versioned migration `20260920031816_order_production_planning.sql` is additive and
requires the receiving and customer-order migrations. New tables have explicit
grants and organization/facility RLS. Invoker functions and table triggers enforce
validation even for direct API writes. The existing trigger-only cancellation
lookup remains non-callable by authenticated/anonymous users.

Parent-order locks serialize generation, revision and cancellation. Optimistic
revisions reject conflicting updates while identical lost-response retries return
the existing result. Batch and spice rows are immutable to app users. Every change
is audited. Planning does not create inventory events or duplicate commitments.

## Verification

- `npm ci --no-audit --no-fund`: passed with the pinned lockfile.
- Combined starting baseline: 232 tests and production build passed.
- `npm run check`: formatting, Airbnb lint, strict TypeScript, 262 automated tests
  and production build passed after integrating the supplier/receiving code.
- New database tests use all actual migrations in disposable PGlite. Coverage
  includes retries, stale revisions, date limits, shortages, expiry, inbound,
  cancellation, direct-API tampering, permissions and facility isolation.
- Action tests cover malformed input, permissions, SDK errors, unsafe database
  messages, missing acknowledgments, lost connections and Auth redirects.
- Native PostgreSQL coverage adds overlapping generation, competing revisions and
  cancellation racing generation. CI also exercises the full desktop/phone flow.
- Local Chromium download timed out. A recovered Chromium executable could not
  start its browser daemon, and the disposable native PostgreSQL runner could not
  create or switch to the unprivileged account required by initdb in this runtime.
  Browser and native PostgreSQL verification remain pending for this feature.
- The owner explicitly approved publishing this branch to the connected GitHub
  repository after automatic approval review requested confirmation. Full feature
  CI runs after publication.
- PR #4's latest receiving/supplier browser fix is included. Its upstream workflow
  is separate evidence and does not verify these new production-planning changes.

## Release and remaining scope

The owner authorized merging this and other completed PRs. Apply tested additive
migrations to the existing database before releasing dependent application code;
reconcile repository filenames with the hosted migration versions. No automated
operating records are written to the hosted database.

Worker/crew scheduling is the next build item. Physical production scans, actual
ingredient consumption, packaging and shipping remain later phases. Existing
real-Auth, independent-review and physical printer/scanner acceptance items are
not silently marked complete by these automated checks.
