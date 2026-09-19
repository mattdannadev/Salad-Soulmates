# Refactor application boundaries, restore Recipes, and add isolated acceptance gates

Target: `main` in `mattdannadev/Salad-Soulmates`.
Head: `refactor/complete-and-preserve-modules`.
Publish as **draft**. Phase 1 acceptance remains open.

## Problem and resulting behavior

The existing application needed consistent validation, error handling, strict
typing, and regression coverage before the next build-plan phase. The isolated
Preview also hid existing destinations because its administrator fixture lacked
14 seeded permissions, while Products and Recipes were placeholder pages.

This change preserves the current receiving, access-approval, settings, worker,
and reference-data implementation while tightening application boundaries. The
Preview administrator has all 19 seeded permissions. Products and Recipes now
show validated catalog data, released/draft version selection, ingredients,
preparation sections, and QC details in English and Spanish. Recipe authoring
and the remaining operational modules stay explicit in the build plan.

The refactor adds typed database clients, runtime record validation, focused
save handlers, safe callback paths, checked Auth/cookie failures, and inventory
retry handling. It reconciles the already-applied recipe migration with Git and
prepares two forward migrations for reliability and inventory-unit locking.
Those forward migrations have not been applied to the hosted database.

## Validation

- Untouched main baseline: 22 tests and the production build passed.
- Recovered application/test commit `a5704176d6798ace8a3acdbef0e21407aed25852`:
  `npm ci --offline --no-audit --no-fund` installed 437 packages; `npm run check`
  passed formatting, zero-warning lint, strict TypeScript, **145 tests in 13
  files**, and the Next.js build. This was run from an export of that commit.
- Prior signed-in desktop verification of the isolated Vercel Preview covered
  all 13 administrator destinations, recipe versions/details, and all 19 seeded
  administrator permissions. This is separate from the unexecuted local suite.
- CI defines `quality` (full check plus six desktop/phone browser cases) and
  `postgres-concurrency` (six overlapping-session cases on disposable PostgreSQL).
- Native PostgreSQL execution previously failed at startup because no local
  service was available. Browser execution failed at launch because Chromium
  was unavailable and its download timed out. Neither suite is marked passed.
- GitHub write access was restored after reconnecting the account. The refactor
  branch was created successfully. CI results will be recorded on this draft PR;
  main last reported protection disabled.

## Acceptance checklist

- [x] Preserve existing routes and newer modules; document original feature scope.
- [x] Validate the recovered application/test commit with the complete local check.
- [x] Review invitation partial failure and make administrator recovery explicit.
- [x] Keep test data disposable and the deployed Preview synthetic.
- [ ] Execute and pass both GitHub CI jobs on the proposed PR commit.
- [ ] Expand and pass browser acceptance for worker/receiver roles, deactivation,
      keyboard behavior, loading/error states, and receiving lost-response retries.
- [ ] Verify real Supabase Auth refresh, invitation, password-reset callbacks,
      and sign-out using a disposable local stack with local email capture.
- [ ] Verify overlapping PostgreSQL sessions and assess stronger isolation levels.
- [ ] Complete full-codebase policy and migration review; passing lint is not
      evidence of complete engineering-policy compliance.
- [ ] Configure and verify required CI checks and reviews on main through
      authorized repository administration.

Keep this PR draft until the acceptance checklist is complete. This change does
not authorize a merge, production deployment, hosted migration application, or
shared-database writes. See `docs/engineering-refactor.md`,
`docs/refactor-gate-runbook.md`, and `docs/feature-preservation.md`.
