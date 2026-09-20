# Shipping foundation — packaging integration pending

The owner authorized building the independent shipping work now and completing
physical fulfillment after packaging is ready. This candidate starts from main
`3262e17` in a separate `Shipping` checkout so concurrent packaging work is preserved.

## Implemented

- Navigation is **Shipping** / **Envíos**, with an order-linked preparation page.
- Read existing customer demand, saved packaging units and needed dates; no duplicate order entry.
- Save immutable shipment or pickup drafts with proposed date, whole-unit partial quantities and notes.
- Saved drafts are independent alternatives, not allocations or deliveries. They may overlap;
  their totals must never be subtracted from demand or finished inventory.
- Draft history remains visible after order cancellation. New drafts require an active order.
- Server and database validate scope, permissions, products and quantities. All exposed data
  has organization/facility RLS. Drafts cannot be edited or deleted by application users.
- Stable request IDs and transaction locks prevent duplicate inserts on retries. Reusing an ID
  with different content fails. The form holds the attempted payload after an uncertain response.
- English/Spanish UI, desktop/phone layout and honest empty/error states.

Apply `supabase/migrations/20260920051826_shipping_drafts.sql` before deploying this
release. It was applied to the existing hosted database on September 20 under explicit owner release authorization. SQL is unchanged; do not replay the old candidate timestamp.
Reads require `orders.read` and `planning.read`; preparation also requires
`orders.write` and `planning.write` to use the existing order-cancellation lock safely.
No operational records were inserted into the hosted database.

## Finish after packaging

1. Connect real packaged balances, their stable identities, product/production-lot links,
   packaging conversions, holds and availability. Never type a customer lot manually or
   derive finished stock from planned mixer batches.
2. Add a separate confirmed fulfillment ledger and atomic confirmation operation. Lock
   both order and packaged stock, validate remaining quantities, deduct stock once,
   and retain operator, actual timestamp, method, customer, product, lot and units.
3. Derive partial/complete fulfillment from confirmed records only. Drafts remain
   planning history. Handle concurrent shipments and uncertain-response retries.
4. Add returns linked to original fulfillment, preserving lot identity and an approved
   stock disposition; do not assume returned food becomes usable inventory.
5. Verify end-to-end packaging-to-customer trace, held/insufficient stock, mixed units,
   over-fulfillment, tenant isolation and concurrent confirmations in native PostgreSQL.

There is no confirmation endpoint, shipment status, stock deduction, invoice creation,
carrier purchase, or customer notification in this candidate. The disabled confirmation
control explains the packaging dependency. Shipping remains an incomplete build phase.

## Verification

September 20 follow-up: the owner reported a spinner over the unavailable
confirmation button. The deployed button was disabled with no runtime errors;
the global disabled-button style incorrectly used the busy `wait` cursor.
Disabled actions now use `not-allowed`. Desktop/phone regression coverage checks
both the disabled state and cursor. Shipment confirmation remains unavailable.

Validation results are recorded at completion of this candidate. Tests use disposable
PGlite and synthetic local Auth/API fixtures, never the shared database. Real Auth,
packaging integration and native multi-session shipping concurrency remain open.

- `npm ci --ignore-scripts`: 429 packages installed; audit reported zero vulnerabilities.
- Shipping domain/action/data/page/database suite: 33 tests passed.
- Desktop and 390px phone browser flows passed with installed Chrome. The pinned
  Chromium download timed out; a temporary Chrome configuration used isolated ports
  3011/4011 to avoid the concurrent packaging tests. The temporary overrides were removed.
- Browser checks cover empty queue, order navigation, partial pickup preparation,
  persisted draft after reload, disabled confirmation, no horizontal overflow and
  shipping runtime console errors. The baseline missing `/favicon.ico` is excluded.
- `npm run check`: passed formatting, lint, TypeScript, all 295 tests and production build.
- Native multi-session
  PostgreSQL, hosted migration/advisors and real Auth were not run for this candidate.
