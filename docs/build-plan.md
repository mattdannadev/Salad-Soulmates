# Salad Soulmates — current build plan

Updated: September 20, 2026

## Current checkpoint

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

| Order | Build phase                                          | Scope / sequencing                                                                                                                                                               |
| ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Engineering standards and existing-code refactor     | Complete remaining real Auth and independent-review acceptance; preserve CI and mandatory engineering standards.                                                                 |
| 2     | Customer orders, inventory assessment and purchasing | Enter customer, products, batch counts and date once. Automatically calculate ingredient needs and supplier purchasing estimates on the order.                                   |
| 3     | Complete receiving and serialization                 | Preserve existing work; receiving updates stock and outstanding inbound for order estimates.                                                                                     |
| 4     | Internal production preparation                      | Generate released batch work and spice buckets from saved orders. Keep production readiness and later start-date results attached to the order; no duplicate order-entry module. |
| 5     | Scheduling and worker schedule                       | Plan production dates and administrator assignments linked to orders, plus worker schedules and approved PTO/mobile/language requirements.                                       |
| 6     | Packaging                                            | Complete the approved packaging workflow.                                                                                                                                        |
| 7     | Shipping                                             | Complete the approved shipping workflow.                                                                                                                                         |
| 8     | Dropdown-list / reference-data management            | Finish administration after shipping while preserving current settings.                                                                                                          |
| 9     | Third-party product-grid replacement                 | Replace product grids last; keep this separate from workflow changes.                                                                                                            |

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
the existing schema without enabling recipe writes. Advanced authoring remains
part of the build, including taste-test and shelf-life records linked to revisions.

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
