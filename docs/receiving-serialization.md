# Receiving and physical package serialization

Candidate branch: `feature/receiving-serialization-complete`, stacked on the materials
and purchasing candidate (`2f2a7c0`). This implements the next owner-requested build
step. It does not close the carried-forward Auth, independent review or release
acceptance gates.

The resumed candidate preserves the latest supplier purchase-order expansion,
customer orders, packaging/pricing,
order-driven ingredient estimates, account-language fixes and recipe-to-ingredient
links. Receiving and package changes invalidate supplier purchase progress, order
estimates and package views.
The receiving browser suite uses the shared isolated-database setup, verifies
invalid package totals and label reprints, and resolves the actual selected
package serial without assuming a random UUID sort order.

## Delivered behavior

- Post a delivery and its physical packages in one database transaction. Enter one
  quantity per package; uneven packages are supported and must total the receipt.
- Keep the supplier lot, optional supplier item snapshot, receipt date, expiry and
  purchase-line link. The existing partial-inbound and over-receipt checks remain.
- Generate a unique `SSU-` identity and printable QR label for every package.
  Optionally associate a supplier barcode only when it uniquely identifies that
  physical package. Shared product UPCs and shared lot barcodes are not identities.
- Resolve an internal serial or supplier barcode to ingredient, supplier, source
  lot, original quantity, remaining quantity and history. Exact barcode matches
  take precedence over substring lot/ingredient searches. Searches run on the
  server under RLS and return at most 200 packages.
- Reprint the same label without creating another serial or inventory event.
  Labels carry original quantity; the live package page carries current balance.
- Record measured balance corrections and Available/Hold/Quarantined changes with
  a mandatory reason. The immutable event history records the actor, timestamp and
  revision. Corrections post one matching inventory adjustment; retries post none.
- Derive Expired in the facility timezone and Exhausted from a zero balance.
  Marking a package Available cannot override expiration or an empty balance.
- Planning excludes held, quarantined, exhausted and expired packages and expiry
  before the needed date. Serialized receipts and their balance corrections are
  counted once. Existing unallocated receipts retain the earlier planning rule.
- Assign physical identities to older posted receipts without receiving stock
  again. Old receipts missing required supplier-lot evidence remain explicitly
  blocked; this slice does not invent a lot or rewrite immutable receipt history.
- Keep receiving on administrator desktop/phone and the focused `/receiving`
  workspace. Lookup accepts keyboard/scanner input; built-in phone camera capture
  and production scan consumption remain part of the later worker execution phase.

## Database and authorization

Applied migration: `20260920031357_receiving_serialization.sql`. The hosted version
is authoritative; SQL is unchanged from the tested CLI candidate `20260920011757`.
Do not apply both versions.
The migration adds immutable receipt allocations, physical units and package
change events, an RLS-invoker balance view, and validated invoker RPCs. It contains
no operational seed records. All new tables use organization/facility RLS, explicit
grants and audit triggers. Barcode uniqueness is enforced within the organization,
including between its facilities. No definer function or service-role path is added.

`inventory.read` controls lookup. `inventory.receive` controls receipt/allocation
creation. `inventory.adjust` controls balance corrections and hold/release changes.
Receivers and reviewers cannot change package balances or holds. Physical unit
rows are immutable; a restrictive UPDATE policy permits row locking but rejects
actual updates. Events lock the unit and verify the expected revision. Request
advisory locks and unique constraints make identical retries safe.

Supplier-item snapshots preserve packaging configuration without assuming that
all physically delivered packages have the configured nominal size. Allocations
and package identities cannot be casually edited or deleted. A wrong posted
physical allocation needs a separately designed correction workflow.

## Verification

Baseline `npm ci` and `npm run check`: 177 tests and production build passed.
New tests cover atomic receipt rollback, exact totals and precision, missing lots,
barcode conflicts, retries, partial balances, held/expired availability, planning
integration, immutable records and authorization/facility isolation. Browser tests
exercise receiving through labels, lookup, a hold/balance correction and refresh
at desktop and 390px. Native PostgreSQL tests exercise overlapping receipt retries,
package-change retries and stale competing revisions.

Local `npm ci --offline` and `npm run check` passed after integrating the current
purchasing branch: 247 automated tests, formatting, Airbnb lint, strict TypeScript
and the production build.
[CI run 35485861927](https://github.com/mattdannadev/Salad-Soulmates/actions/runs/35485861927)
passed all 247 tests, 17 native PostgreSQL concurrency tests and all 12 browser
cases. Supplier keyboard activation waits for streamed content to become visible.
Final migration-version reconciliation and merge results are recorded in
[PR #4](https://github.com/mattdannadev/Salad-Soulmates/pull/4).
GitHub Actions runs Chromium at desktop and 390px phone sizes and an isolated
PostgreSQL 17 service for true concurrent transactions. PGlite tests are not
presented as native concurrency or real Auth verification. All automated records
are disposable; no tests write to the shared hosted database.

## Authorized Preview release

The owner instructed “Merge changes once complete.” PR #4 targets the connected
`feature/materials-purchasing` Preview; PR #2 against production main remains
separate. After CI passed, the tested additive migration was applied to the existing
hosted project as `20260920031357`. The disposable loader follows the hosted order,
after customer-order estimates. No operational or sample records were inserted.

Post-application checks confirm organization/facility RLS, invoker functions and
view, denied anonymous RPC execution and denied direct trigger-function execution.
Security advisors show no new findings compared with the pre-application baseline.
The matching application must deploy after this schema; its readers require the
new functions and tables. PR #4 records the final commit and Preview checks.

Real Supabase Auth with receiver/admin permissions, independent review and physical
label-size/printer/scanner acceptance remain open. Automated evidence does not
close these gates. Camera capture and production consumption remain later work.
