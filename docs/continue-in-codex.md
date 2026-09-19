# Continue the approved Phase 1 refactor

Work in the existing `mattdannadev/Salad-Soulmates` repository. Read root `AGENTS.md`, current owner decisions, `docs/decisions.md`, `docs/build-plan.md`, and `docs/engineering-refactor.md`. All three original engineering inputs are mandatory scope. The original audit and continuation remain in `docs/refactor-sources/` as historical records.

The initial execution used a full clone at `028880cebe49140271ce37f69ed6ddd406a79640` and local branch `refactor/engineering-standards-2026-09-19`. The review delivery includes a Git bundle, patch, source archive, baseline/final verification logs, and application instructions. Inspect current main, uncommitted work, and the package commit before applying anything. Reconcile subsequent changes rather than overwriting them. The earlier 40/43-test standalone harnesses are historical and must not be reported as current application verification.

The current implementation includes the standards configuration, typed/validated query boundaries, focused save operations, auth/cookie/redirect fixes, date/decimal handling, retry protections, CSV review validation, restored hosted recipe DDL, a new unapplied reliability migration, tests, and a CI definition. Do not repeat the refactor from scratch or apply the missing older hardening patch over it.

Run `npm ci` and `npm run check` on the final proposed commit. Install the pinned Playwright browser with `npx playwright install --with-deps chromium`, then run `npm run test:browser`. Browser tests use an isolated local API fixture and never connect to hosted Supabase. Expand and verify lost-response inventory/receipt retries, deactivation, worker/receiver roles, keyboard access, and mobile layout. Verify real Supabase Auth flows separately in an approved environment; do not place synthetic users/records in the shared hosted project.

Complete each remaining checkbox in `docs/engineering-refactor.md`, including concurrent PostgreSQL sessions, invitation partial-failure review, full diff review, remote CI, and required-check/review settings. PGlite cannot prove multi-session concurrency. GitHub writes were denied with HTTP 403, so no remote branch or PR exists. Once write access is available, push this branch and create a **draft** PR; keep it draft until acceptance is complete.

The restored migration `20260919055744_recipe_master_and_approved_source_import.sql` is copied from actual hosted migration history and is already applied there. The new migrations `20260919174033_refactor_reliability.sql` and `20260919193053_serialize_inventory_units.sql` have only run in disposable local tests. Review and reconcile migration history before any separately authorized hosted application. Never reset or create another hosted database.

Preserve existing UI/routes, public contracts, tenant/facility RLS, immutable recipes and inventory history, lot/date/timezone rules, approved units/conversions, current receiving/settings/access workflows, and worker/mobile requirements. The current sequence places reference-data completion after shipping and product-grid replacement last. Do not start a new feature phase until Phase 1 is accepted. Do not merge, deploy, or modify shared operational data as a side effect of this work.

Report actual commands/results and remaining risks. A local CI file is not active protection, a mock Auth fixture is not real Auth integration, and a passing unit suite is not browser verification.

Latest continuation: local branch `refactor/complete-and-preserve-modules` adds
recipe/product browsing, complete Preview administrator permissions, bilingual
catalog labels, Auth failure/callback regressions and a pending inventory-row
locking migration. Read `docs/feature-preservation.md` before further feature work.
Vercel access is restored; Preview uploads are authorized. GitHub branch creation
was retried and still returns HTTP 403. Do not treat the older Vercel access block
as current. The isolated exporter now takes both its fixture and data from the
selected commit, so commit all intended changes before exporting.

Gate continuation now includes `npm run test:postgres`, a dedicated native
PostgreSQL CI job, and a desktop/phone lost-response retry scenario. Read
`docs/refactor-gate-runbook.md`. Native tests require an explicitly disposable
loopback PostgreSQL instance; they must not be redirected to hosted data. The
pending inventory-lock migration now checks write permission before its privileged
ingredient read. GitHub still rejects writes, Chromium is missing, and real Auth
remains unverified. Do not infer gate completion from the locally passing unit suite.

Publication recovery: the former checkout's shared Git metadata was no longer
available. The preserved source was recovered against unchanged remote main
`028880cebe49140271ce37f69ed6ddd406a79640` as commit
`a5704176d6798ace8a3acdbef0e21407aed25852`. Every staged added/modified file was
compared byte-for-byte with the preserved source. A clean export passed a fresh
offline install and the complete check (145 tests plus build). Continue from
`/workspace/scratch/319af47af5c2/refactor-gates-final`, which has independent Git
metadata, rather than the former linked worktree. The earlier commit chain could
not be recovered, so this commit preserves its resulting source as one change.

The draft PR body is ready in `docs/draft-pr.md`. Branch creation still returns
HTTP 403 `Resource not accessible by integration`; a normal Git push dry run
also reported missing credentials. No existing PR was found for this branch.
The main-branch API reports protection disabled. Restore the GitHub connection's
repository write authorization before publication; do not report CI or branch
protection as active. Browser, native PostgreSQL, real Auth, and full review
acceptance remain open. Production, hosted data, and the working Preview were
not changed during this recovery.

GitHub reconnection subsequently restored write access: branch creation succeeded
for `refactor/complete-and-preserve-modules`. Publication and CI are now proceeding
through the connected GitHub app. The earlier HTTP 403 is historical; inspect the
remote branch/PR and its current checks before retrying publication.
