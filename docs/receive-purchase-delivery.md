# Receiving multiple purchase orders

The Receive Inventory entry point lists confirmed purchase orders with outstanding
quantities. One delivery belongs to one supplier and may cover multiple purchase
orders. Rows remain allocated to a specific purchase line even when ingredients
repeat across orders. Different lots or expiration dates create separate receipt
lines. Manual receiving remains a separate existing workflow.

## Posting contract

`receive_purchase_delivery(payload)` returns one receipt UUID. The header contains
`request_id`, `supplier_id`, `received_on`, `supplier_reference`, and `note`.
Each line contains a stable `id`, `purchase_draft_line_id`, `quantity`,
`supplier_lot`, `expiration_date`, and `packages` containing `quantity` and optional
`supplier_barcode`. The database derives ingredient and unit from the purchase
line. Limits are 100 receipt lines and 200 total physical packages per delivery.

The transaction validates the whole delivery, serializes competing purchase
receipts, and creates one header with all receipt lines, original inventory
events, source-lot evidence and package identities. Any failure rolls back the
whole delivery. An identical request returns the existing receipt; changed
content under an existing request ID fails. The original single-line RPCs remain
compatible for manual receipts and existing clients.

Purchase identity, ordered quantities, base units and pack snapshots remain
immutable. Receiving does not require a customer order and never changes purchase
confirmation semantics. An inactive supplier, ingredient or configured pack must
be resolved before posting. Pack snapshots describe the order; measured physical
package quantities may differ from the configured nominal pack size.

Actual quantities start blank. A receiver explicitly fills an outstanding amount
or enters the measured delivery. A zero or blank line is skipped and remains
outstanding. The composer supports several lot splits and packages per purchase
line. Pending submissions retain the exact payload and retry token until the
outcome is resolved; a transport timeout must not become a new stock posting.

Owned inventory is the sum of immutable inventory events, including all suppliers
and source lots for an ingredient in its stored unit. Serialized package balances
are not added again to that total. Available stock retains its separate hold,
quarantine, expiry and planning rules. Count corrections do not reopen purchase
outstanding quantities. Receipt reversal, returns and evidence correction remain
separate unresolved product workflows.

## Migration and recovery

Apply the additive migration before deploying the receiving client. Do not alter
historical migration files or infer missing historical PO, lot or package data.
No operational backfill is required. Validate receipt/event/package quantities,
PO totals and scope using disposable test databases before release.

Application rollback must retain posted multi-line receipts and all history.
Disable new entry if necessary; never undo actual stock as a deployment rollback.
Confirm the rollback client can show every receipt line and package label, or
ship a forward fix. The existing hosted database must not receive synthetic test
data. Local implementation does not imply migration application or deployment.

## Verification and handoff

Migration: `20260921132435_receive_purchase_delivery.sql`, generated with the
Supabase CLI. It has been exercised only in disposable local databases. The
single-line receiving RPCs remain compatible. The native test bootstrap also now
loads the existing standalone-purchasing migration in dependency order.

Database verification: the focused PGlite suite passes all 10 tests; native
PostgreSQL 17.10 passes all 27 concurrency tests. The manual/multi-PO regression
holds only the daily source-lot allocator lock before starting the competing
delivery, then completes the manual receipt. This reproduces the lock ordering
that would deadlock before the fix. Independent database review has no remaining
implementation findings. Three read-model tests cover pagination past 500 rows,
later-page failures, and invalid persisted records.

All eight desktop and phone browser cases pass, including lost-response reload
recovery and session-storage cleanup failure. The entry and completion screens
were visually inspected at desktop and 390px phone widths. Independent database
and UI review has no remaining actionable findings. All 386 unit tests,
TypeScript checks and the production build pass. The full `npm run check` passes
formatting but currently stops at unrelated lint errors in concurrently edited
action and settings files; receiving's focused lint passes.

On Windows, the
optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` environment variable can select an
installed Chrome executable; leaving it unset preserves CI's bundled Chromium
configuration. Generated `.vercel` deployment output is excluded from ESLint,
matching its existing Git exclusion; source lint rules remain unchanged.

Real Auth and physical printer/scanner acceptance are separate gates. No hosted
migration, deployment, merge or commit has been performed by this receiving task.
