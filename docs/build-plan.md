# Salad Soulmates — current build plan

Updated: September 19, 2026
Owner instruction: execute all three supplied engineering documents within the first refactor phase.
Execution status: **refactor CI passed; production release explicitly authorized; Phase 1 follow-up acceptance remains open.**

Latest owner decision (September 19): merge PR #1, deploy the live app, and apply
the two pending migrations. CI passed 145 tests plus the build, six browser cases,
and seven native PostgreSQL tests. The migrations are applied; see `decisions.md`
for their authoritative hosted versions. This supersedes older access/deployment
blockers in the historical progress notes below. Real Auth and the remaining
verification/review items must still be completed before advancing feature phases.

## September 20 feature candidate

The owner asked to run the next build step. Materials requirements and purchasing
are now being prepared as a draft implementation on `feature/materials-purchasing`.
See `materials-purchasing.md` for behavior, schema and verification. This is not a
Phase 1 acceptance claim: real Auth and independent-review gates remain open,
and this feature is not merged, deployed or applied to the hosted database.

## Approved delivery order

| Order | Build phase                                                       | Scope / sequencing                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Engineering standards, hardening, and full existing-code refactor | All three supplied documents are mandatory scope. Complete this acceptance gate before advancing new feature work. Written instructions or isolated passing tests alone do not close it. |
| 2     | Materials requirements and purchasing                             | Requirements calculation and purchasing workflows.                                                                                                                                       |
| 3     | Complete receiving and serialization                              | Preserve existing work; complete remaining behavior and acceptance coverage.                                                                                                             |
| 4     | Customer orders and production planning                           | Complete the order-to-production planning workflow.                                                                                                                                      |
| 5     | Scheduling and worker schedule                                    | Administrator assignments plus worker-facing schedules; preserve approved PTO, mobile, and language requirements.                                                                        |
| 6     | Packaging                                                         | Complete the approved packaging workflow.                                                                                                                                                |
| 7     | Shipping                                                          | Complete the approved shipping workflow.                                                                                                                                                 |
| 8     | Dropdown-list / reference-data management                         | Finish reference-data administration after shipping. Preserve existing settings/reference-list implementation during the refactor; do not remove it to match this sequence.              |
| 9     | Third-party product-grid replacement                              | Replace product display grids with the selected nicer third-party component last; do not bundle a grid redesign into the refactor.                                                       |

The order above is the latest owner direction and supersedes older sequencing, not confirmed business requirements. Existing partially implemented features must remain intact.

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

## Current progress

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
