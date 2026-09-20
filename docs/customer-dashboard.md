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
