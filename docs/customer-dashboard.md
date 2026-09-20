# Customers and operations dashboard

Implementation branch: `feature/customer-directory-orders`. Release and owner
acceptance remain separate gates; verification results are recorded in the PR.

- Customers have contact, email, phone, address and notes; revision-checked edits
  preserve names and saved order terms. Directory lists open orders and dates.
- Orders select a saved customer, display the master details, and load active
  prices for that customer's dressing and package. Add/view customer links are
  available beside the lookup. Products remains the price-maintenance screen.
- Batch totals derive from package price: 3 × 40 gallons / 2 gallons per bag ×
  $12.50 per bag = $750. Missing customer pricing requires configuration first.
- Customer pickup date replaces the earlier needs-by label. Internal scheduling
  still uses its own ingredient-ready/start dates. Navigation says Orders.
- Home shows pickup dates, customers, each dressing's batch count, and order totals;
  confirmed supplier purchases stay outstanding until fully received. Ingredient
  balances distinguish unrecorded stock from zero and prioritize active demand.
- Recently shipped remains explicitly unavailable until actual shipment posting;
  drafts are never counted. Product/batch detail is required for future shipments.
- Readers and actions enforce existing permissions and RLS. Additive customer
  fields have safe defaults. No customer/order/sample records are seeded in hosting.

## Verification and next gate

Run `npm ci`, `npm run check`, all browser scenarios on desktop and phone, and
PostgreSQL concurrency checks in CI. The customer browser scenario covers master
creation, package-price setup, selection, populated contact details, calculated
batch totals, open-order dates and dashboard product/batch counts. Database tests
cover retries, stale edits, identity protection, invalid input and tenant/access
boundaries. Visually inspect populated and empty dashboards at both sizes.

Apply the additive migration only after checks pass, merge under the owner's
release authorization, verify Vercel Ready and authenticated read-only pages.
Physical production, finished inventory and actual shipment confirmation remain
separate build-plan work. Owner visual/operational acceptance remains outstanding.

## Release verification — September 20, 2026

PR #12 contains this implementation. PR #11 supplier directory is merged as
`1532af1` and its production deployment is Ready; authenticated read-only viewing
confirmed the directory and Add supplier link.

- `npm ci` installed the pinned dependencies. `npm run check` passed formatting,
  lint, types, 334 tests and the production build.
- CI run `35494254302` passed all 22 desktop/phone browser scenarios and 22 native
  PostgreSQL concurrency tests, as well as the full quality/build gate.
- Local installed-Chrome verification caught a phone purchase link obscured inside
  the scrolling supplier table. Supplier details now sit outside the table. The
  four affected desktop/phone supplier and purchasing scenarios passed after this
  fix. Pinned Chromium download was unavailable locally; CI uses pinned Chromium.
- Populated dashboard screenshots were visually reviewed at desktop and phone
  sizes, including dressing names and per-product/total batch counts. The local
  browser tool verified rendering with no browser errors.
- Customer migration `20260920063447_customer_directory` is applied to the existing
  hosted database. The RPC uses invoker privileges and denies anonymous execution.
  No hosted sample records were created. Security advisors retain only the existing
  [authenticated definer-function findings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
  and [leaked-password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Final CI reruns cover the supplier layout adjustment and migration filename
alignment before merge. Production deployment and owner acceptance are still
separate from these pre-merge checks; final release evidence is recorded in PR #12.

## Demand coverage and purchasing follow-up

- Every future pickup appears, sorted earliest first, with products and batches.
  Today and overdue counts remain available in the metrics and Orders screen.
- Ingredient coverage uses one database snapshot for all active material plans,
  including overdue commitments. Supply excludes held/expired material and only
  includes confirmed outstanding purchases due by each production/pickup date.
  Cumulative demand allocates shared supply once; the worst dated gap determines
  the shortage. Later inbound cannot mask an earlier gap. Expiry is conservative
  across horizons; these are planning estimates, not physical reservations.
- Generate supplier purchase drafts recalculates this snapshot transactionally,
  selects preferred/sole active supplier packs, and rounds to whole packs. Drafts
  group by supplier and supporting order, with arrival requested by the first
  shortfall. Review arrival feasibility, quantities and pricing before placement.
- Existing drafts for an ingredient are flagged rather than duplicated or treated
  as inbound. Ambiguous/missing/unit-mismatched supplier packs are also flagged.
  The transaction records a retry receipt; a lost response can be retried without
  buying twice, including after subsequent draft confirmation/cancellation.
- Ordinary draft writes and bulk generation serialize through a short purchase
  table lock. No supplier calls or inventory postings occur in the transaction.
- Dashboard read failures surface as errors, not zero demand. Purchasing requires
  the existing planning write and supporting read permissions; RLS remains active.

Pending: final combined verification, PR, merge and production deployment.

## Combined release verification — demand and navigation

Branch `feature/dashboard-demand` includes the demand follow-up and the separately
requested collapsible navigation. Clean `npm ci --no-audit --no-fund --offline=false`
installed 429 pinned packages. `npm run check` passed formatting, ESLint, strict
TypeScript, 345 automated tests and the production build. Four focused installed-
Chrome browser scenarios passed, exercising purchase generation/retry and sidebar
scrolling on desktop and phone. The complete browser suite and native PostgreSQL
concurrency CI are the remaining pre-release checks. No hosted test data was used.
