# Customer orders and production preparation

Production preparation is part of the saved customer order. The existing order
entry, customer packaging/prices, ingredient estimates, purchasing and serialized
receiving remain intact. This includes merged PRs #2 and #4 and the supplier purchase-history improvements.

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

Versioned migration `20260920032256_order_production_planning.sql` is additive and
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
- Local Chromium/native PostgreSQL execution was unavailable in this runtime. The
  published candidate passed all 20 native PostgreSQL cases in CI run
  `35486368318`, including the three new concurrent production cases.
- `npm run check` and all 14 desktop/phone browser cases also passed in that
  CI run. The new browser flow checks draft creation, paired records, shortage
  rejection/confirmation, revision and cancellation with no page errors or overflow.
- The owner explicitly approved publication. Terminal Git had no push credentials;
  the connected GitHub app published the exact verified tree as PR #6.

## Release and remaining scope

The owner authorized publication, completed PR merges and a Preview of final main.
The tested additive production migration was applied to the existing hosted
project as version `20260920032256`; the repository filename and disposable test
loader match that version. Post-apply inspection confirmed RLS on all three new
tables, invoker RPCs and no anonymous execution grants. No automated operating
records were written to the hosted database.

The security advisor reports the same pre-existing items: five authenticated
[definer helpers](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
This release introduces no new security-advisor findings.

Worker/crew scheduling is the next build item. Physical production scans, actual
ingredient consumption, packaging and shipping remain later phases. Existing
real-Auth, independent-review and physical printer/scanner acceptance items are
not silently marked complete by these automated checks.

## Navigation and order-card follow-up

The September 25 implementation candidate groups existing production entry points
under Production Planning and adds an authorized path to worker preparations.
Saved-order cards expose products and batch counts, customer notes, order date,
and pickup date. Customer notes refer to the current customer record, not a new
order-specific notes field. The schema does not yet distinguish a separately
requested pickup date from the saved customer pickup date.

Verify role-filtered navigation, worker return navigation, missing notes/dates,
multiple product lines, and mobile readability before accepting this increment.
No production deployment or shared-database changes are part of this follow-up.

## 2026-09-25 release integration

The outstanding worker implementation and navigation/card changes were captured
in commit 129388d, then reconciled with main f66102e. The order directory retains
main's grouping, search, product/status filters, deactivate action, and toast.
Worker problem notes survive response validation; worker reads and writes use
presentation, service, and data layers.

Release corrections put the worker migrations after the tenant-scope hardening,
require Confirmed plans and Assigned production lots for writes, scope lock
lookups to organization/facility, fix receipt-facility tracing, and classify
spice consumption as OrderUsage. A hosted read-only preflight found no existing
worksheet executions; no operating records were created or changed by tests.

The owner authorized committing all outstanding changes before deployment.
Historical reactivation and inventory-control migration SQL was verified against
the hosted history by normalized hash; filenames are aligned to those versions
without replaying either migration. Release verification and deployment evidence
are recorded in the final handoff.
