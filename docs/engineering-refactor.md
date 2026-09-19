# Engineering refactor — execution and acceptance

Updated: September 19, 2026

Repository: `mattdannadev/Salad-Soulmates`

Baseline: `028880cebe49140271ce37f69ed6ddd406a79640`

Local branch: `refactor/complete-and-preserve-modules`

Status: **remote CI passed; production release authorized; Phase 1 follow-up checks remain open.**

## Latest release checkpoint — September 19, 2026

GitHub access and billing are resolved. PR #1 head `c94ba1e` passed
[Quality run #3](https://github.com/mattdannadev/Salad-Soulmates/actions/runs/35474137049):
formatting, lint, type checks, 145 tests, the Next.js build, six desktop/phone
browser cases, and seven native PostgreSQL tests. Six database cases confirmed
real overlapping lock waits at READ COMMITTED; the seventh preserves denied
recipe-line deletion.

The owner explicitly authorized the merge, production deployment, and two hosted
migrations after the remaining checks were disclosed. Both migrations are now
applied as `20260919231113_refactor_reliability.sql` and
`20260919231118_serialize_inventory_units.sql`. Read-only verification confirmed
the receiver-feedback constraint, receipt advisory lock, ingredient row lock,
reference-code trigger, restricted function execution, and enabled table RLS.
No sample records were inserted. Git filenames and test references are reconciled
to the hosted migration timestamps without changing their SQL.

Real Auth integration, broader browser acceptance, stronger isolation levels,
full policy/migration review, and required checks/reviews on main remain open.
The older execution notes below describe historical checkpoints; their prior
GitHub/billing/browser/PostgreSQL blockers and unapplied-migration statements are
superseded by this checkpoint. See PR #1 for the final deployment outcome.

## All three inputs are part of Phase 1

| Input                          | Execution                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mandatory AGENTS policy        | Installed as root `AGENTS.md`, including the installed Next.js guidance. Applies to existing and future work. Review instructions and a PR checklist point back to it.                   |
| Refactor audit                 | Remediations and verification below implement the audit against the complete current repository. The original audit remains unchanged in `docs/refactor-sources/`.                       |
| Continue-in-Codex instructions | Reconciled current source and migrations, ran a reproducible baseline, added characterization tests before extracting actions, and updated the continuation with actual remaining gates. |

The earlier audit was based on `168768a2008cd87473cc6dda26d16d4fa08567c0`. This execution cloned the full repository at the newer baseline above and preserved its receiving, access approval, settings, and migrations. The previous redirect/documentation patch applied cleanly to that baseline. The older missing hardening patch was not required: its stated defects were addressed directly in current source. Historical 40-test and 43-test standalone harness reports are not evidence for this execution.

## Baseline and schema reconciliation

The untouched baseline passed `npm ci` and `npm run check`, including 22 tests and a production build. The installed Next.js 16.3.5 cookie and error-handling documentation and its exact read-only-cookie error were inspected. Next.js, React, Supabase, TypeScript, and Vitest versions were preserved.

Read-only inspection of the existing Supabase project found migration `20260919055744_recipe_master_and_approved_source_import` in hosted migration history but missing from Git. Its exact stored DDL was restored as a migration; it contains no business-data import statements. Generated database types were retrieved from the actual schema. Local tests now load those product/recipe tables and verify RLS across all 27 application tables.

A new forward migration, `20260919231113_refactor_reliability.sql`, was created with the migration CLI. It changes receipt retry handling, allows receiver feedback, and preserves reference codes. It has been applied only to disposable PGlite databases. No hosted schema or records were modified. The restored migration is already recorded as applied on the hosted project and must not be replayed there manually.

## Changes and evidence

| Area                          | Implemented behavior                                                                                                                                                                                                                                                                                | Evidence / limit                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Style and type safety         | Full compatible Airbnb base, TypeScript, React, accessibility, hooks, and Next.js flat configurations; type-aware unsafe-operation/promise rules; no inline overrides; zero warning limit; strict TS retained and indexed access strengthened.                                                      | Full repository lint and TypeScript gates. Tooling compatibility choices below.                                                                                 |
| Authentication and redirects  | Same-origin callback normalization; generated typed clients; runtime profile/permission validation; auth service failures distinguished from absent sessions; SDK sign-out errors, malformed results, and rejected promises cannot redirect to success.                                             | Redirect tests, action tests, and type check. Real Auth email/cookie-refresh integration remains open.                                                          |
| Cookie writes                 | Only the exact installed framework read-only error can defer during Server Component reads. Writable actions/callbacks fail; unexpected causes propagate with safe diagnostics.                                                                                                                     | Cookie regression tests. Already-written cookies cannot be rolled back.                                                                                         |
| Password reset                | Session-verification failure prevents the write. A successful password change followed by failed or disconnected sign-out reports the changed password.                                                                                                                                             | Action failure-path tests. Reset email delivery was not exercised.                                                                                              |
| Action structure              | `saveRecord` validates operation kind and authorization, then dispatches to ten focused validated handlers. Returned write IDs are checked; missing updated records cannot be accepted silently.                                                                                                    | Eleven characterization tests passed before extraction; expanded action regression suite.                                                                       |
| Queries and persisted records | Generated schema types replace unchecked casts; row and projection schemas validate records; paginated reads preserve RLS; query errors propagate safely.                                                                                                                                           | Runtime boundary tests and full type/lint gates. Pagination is ordered but is not a multi-query snapshot.                                                       |
| Inventory and receiving       | In-memory request tokens survive failed saves. Identical receipt retries return the original receipt; conflicting retries fail. Per-request advisory locks and the existing unique constraint prevent duplicate receipt postings. Invalid four-decimal precision is rejected.                       | Action and actual migration SQL tests. Multi-session PostgreSQL concurrency and browser lost-response behavior remain open. Tokens do not survive page reloads. |
| Quantities and dates          | Integer-tick inventory aggregation avoids decimal drift and rejects corrupt input/overflow. SQL dates retain their calendar day; receipt defaults and timestamps use America/Chicago. The standard 40-gallon batch constant and explicit no-guessed-conversion rule are preserved.                  | Domain/date regression tests. No new production-planning workflow introduced.                                                                                   |
| Recipes and isolation         | Restored actual versioned DDL; tested complete-draft release, active version selection, released-content immutability, and organization/role visibility.                                                                                                                                            | Disposable local database tests. Concurrent release/edit sessions remain untested.                                                                              |
| Existing forms and navigation | Updated imports/exports for standards, explicit button semantics, accessible deactivation confirmation, safer error copy, retry tokens, receiving feedback, and explicit request-time rendering for the authenticated receiver route. Stored reference codes cannot change; labels remain editable. | Lint/type/build plus regression tests. Signed-in desktop navigation/catalog smoke passed; mobile and write-flow acceptance remain open.                         |
| Ingredient review import      | Standards-compliant CSV parser handles BOM, quoted fields/newlines and malformed rows; validates headers; preserves human approval; neutralizes formula prefixes in output and rejects overwriting the input path.                                                                                  | Import tests. Script remains an offline review export, never a database loader.                                                                                 |
| Review and CI                 | Added `.github/workflows/check.yml` running clean install, complete check, and desktop/phone Playwright checks. Third-party actions use verified immutable SHAs. Added canonical-policy review instructions and PR template.                                                                        | Definition only; remote execution and required-check protection are not activated.                                                                              |

## Explicit tooling choices

The legacy `eslint-config-airbnb@19` peer range does not support the repository's ESLint 9 stack. The lockfile instead pins the compatible full flat-config port `eslint-config-airbnb-extended@3.2.0`, alongside `typescript-eslint@8.70.0`. This loads complete configurations, not a hand-picked safety subset. `csv-parse@7.0.2` is the other added development dependency. No framework or database SDK version was upgraded.

Framework-specific adaptations are visible in `eslint.config.mjs`: React function defaults use argument defaults, labels may associate implicitly or explicitly, and `console.warn`/`console.error` support required safe operation diagnostics. Maximum line length is 100 with literal/URL exceptions. Development-dependency imports are allowed in tests, scripts, and configuration files. Generated schema/Next files and build/browser output are excluded from manual style lint; generated schema types remain type-checked. No hand-written source directory is excluded.

Airbnb's stylistic rules format JavaScript/TypeScript. Prettier checks CSS, JSON, Markdown, and YAML, avoiding incompatible competing formatters for the same source. Original supplied requirements/refactor documents remain unchanged. Both style tools run under `npm run check`.

## Verification ledger

Final verification used Node 24.19.0, npm 11.9.0, and the committed dependency lockfile. Runtime-level npm proxy-configuration and pinned ESLint deprecation warnings were retained; they are not lint rule suppressions.

| Check                                             | Result                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untouched baseline `npm ci` and `npm run check`   | Passed: formatting, lint, type checking, 22 tests, build.                                                                                                                                                                                                      |
| Pre-extraction action characterization            | Passed: 11 tests against the original action dispatcher.                                                                                                                                                                                                       |
| Intermediate application type check and tests     | Passed: 99 tests, before the final expanded cases.                                                                                                                                                                                                             |
| Final clean dependency install and complete check | Passed: `npm ci` installed 422 packages; `npm run check` passed formatting, zero-warning lint, strict type checking, all **104 tests in seven files**, and the Next.js production build.                                                                       |
| Browser tests                                     | Prepared for desktop and 390px phone against an isolated local Auth/API fixture; not run successfully. Chromium download failed; the separately available browser blocked localhost with `ERR_BLOCKED_BY_CLIENT`. These are not hosted Auth integration tests. |
| Remote GitHub branch/PR                           | Blocked: connected integration returned HTTP 403, `Resource not accessible by integration`; shell had no push credentials. No remote branch or PR created.                                                                                                     |
| Hosted migration/data writes, merge, deployment   | Not performed.                                                                                                                                                                                                                                                 |

The complete baseline, final check output, patch, local commit, and application instructions are included in the review delivery. No credentials, dependency directories, or private operational records are included.

## Remaining acceptance gates

- [ ] Run the prepared desktop and phone browser suite in a browser-capable environment. Inspect loading/empty/error screens, keyboard behavior, ingredient deactivation, receiving/inventory retries after a lost response, worker/receiver roles, and mobile layout. Expand the current smoke suite for those interaction paths before closing this gate.
- [ ] Verify actual Supabase Auth session refresh, invitation, password-reset email/callback, and sign-out behavior in an approved test environment. The local fixture cannot prove these integrations. Do not write test records to the shared hosted database.
- [ ] Exercise overlapping PostgreSQL sessions for receipt retries, recipe release/edit, and ingredient-unit changes during first inventory postings. PGlite coverage is sequential. A new row-locking migration targets the default READ COMMITTED posting/unit-update race; overlapping sessions and stronger isolation levels still require verification before applying it.
- [x] Review invitation partial failure: Auth invitation and application request/profile updates cross services and cannot be atomic. If Auth succeeds but saving its user ID fails, an administrator must reconcile the existing invitation; blind retries are not guaranteed to recover. Preserve the explicit partial-success message.
- [ ] Review the full diff and the new migration. Assess all hand-written modules against the mandatory policy; lint and generated types alone do not prove full compliance or operational readiness.
- [ ] Obtain repository write access, publish a draft PR, run CI on the proposed commit, and configure/verify required checks and reviews on main using authorized repository administration. The local YAML does not constitute active branch protection.

Phase 1 remains open until these gates are satisfied. Do not advance the next feature phase, merge, apply the new hosted migration, or deploy automatically.

## Technical references

- Installed Next.js 16.3.5 docs under `node_modules/next/dist/docs/` and its `RequestCookiesAdapter` implementation.
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript).
- [Compatible flat-config port](https://github.com/nishargshah/eslint-config-airbnb-extended).
- [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/nextjs) and the pinned SSR package changelog.

## Continuation: feature preservation and final hardening

Remote main was rechecked and is still the baseline above. The resumed clean
install and complete check passed 116 tests before these changes.

- Fixed the isolated administrator's incomplete permissions; a failing regression
  demonstrated the missing 14 permissions before the correction.
- Added real read-only Products/Recipes screens using existing tables and RLS,
  permission checks, persisted-record validation, English/Spanish labels, version
  selection and ingredient/QC detail. Draft browsing never activates a draft.
- Added server-rendering tests for normal/empty/error/denied/missing paths, active
  version selection, unrelated version links and Spanish display. Extended the
  desktop/phone browser suite to cover Recipes and every restored menu entry.
- Fixed password-reset service errors being reported as success; the regression
  failed before the fix. Successful responses remain neutral about account
  existence. Preview invitation/reset callbacks now use the Preview host instead
  of the production host.
- Reviewed invitation partial failure and tested saved-ID retries, failed profile
  assignment and failed invitation-ID persistence. Auth and the database still
  cannot commit atomically; the unsaved-ID case explicitly requires administrator
  reconciliation before retrying.
- Prepared `20260919231118_serialize_inventory_units.sql` with the Supabase CLI.
  Its trigger locks the ingredient row while a posting commits, validates the
  current actor/tenant/facility, retains INSERT RLS and revokes direct helper
  execution. A restricted definer context permits receivers to lock a row without
  granting ingredient-edit access. Existing local receiver, RLS, history and
  migration tests pass. This is not evidence of multi-session concurrency safety;
  review overlapping sessions and isolation-level behavior before hosted use.
- Reconciled original/current scope in `feature-preservation.md`; advanced recipe
  authoring and other gated workflows are still required, not silently dropped.

Current environment limits: Chromium installation/download failed; local browser
execution and native PostgreSQL/Auth services remain unavailable. GitHub branch
creation was retried and returned HTTP 403, `Resource not accessible by integration`.
Remote CI/PR/protection cannot be claimed active. Vercel Preview access is restored.
No new hosted database, production release or shared-data mutation was performed.

Continuation check: `npm run check` passed formatting, zero-warning lint, strict
TypeScript, **141 tests in 11 files**, and the Next.js production build. Test
counts include the original suite; they do not include the unrun Playwright suite.

The committed application `e6561347b9b456e94f7374bb4db9a0f022a3e240` passed the
complete check again. Isolated Vercel deployment
`dpl_4HdDcB9Stgk5rCHkwmc5U1sckhcL` is READY; its remote build passed and the browser
confirmed the commit-specific synthetic banner. See `browser-preview.md` for the
current URL and browser verification limits.

Signed-in desktop verification subsequently passed for all 13 existing admin
navigation destinations, recipe ingredients/QC/history and explicit draft
selection. The Settings screen showed all 19 seeded administrator permissions.
Captured application-origin console errors/warnings were empty (the browser
extension had its own metadata errors). No phone viewport capability is exposed
in this browser, so mobile acceptance stays open. The prepared Playwright suite
was corrected to match the observed “Ingredients library” heading and enumerates
four desktop/phone tests; enumeration is not execution. Production aliases were
confirmed to remain on `dpl_6ADKczn9R32yjaQ6cuoiKwRkiDpz`.

## Refactor-gate continuation

The GitHub branch-create operation was rechecked and still returns HTTP 403,
`Resource not accessible by integration`. No remote branch, draft PR, required
check or review-protection setting was changed.

Added `npm run test:postgres` and a `postgres-concurrency` CI job using PostgreSQL
17.11. Six native cases cover competing receipt retries, both recipe release/edit
orderings and both inventory/unit-change orderings. The tests wait for an actual
PostgreSQL lock before releasing the competing transaction. The runner creates
and removes a fresh random database on a fixed loopback test port, ignores hosted
connection variables, and excludes the company-data migration. Its bootstrap SQL
and connection safeguards are verified separately under PGlite/unit tests.
`pg` and its types are pinned development-only dependencies.

Expanded the desktop/phone Playwright suite with an inventory lost-response retry
case. It verifies preserved form values and the same request ID on retry using a
bounded, localhost-only fixture diagnostic. It does not claim successful database
posting against the deliberately write-disabled fixture.

Review found and reproduced a permission-ordering defect in the pending inventory
locking trigger: its definer context could inspect an ingredient before INSERT
RLS rejected an unauthorized worker. The unapplied migration now checks the
relevant inventory permission before reading/locking the ingredient. The new
regression failed before the fix; receiver and tenant/history tests remain intact.
This does not close multi-session or isolation-level acceptance.

Actual environment attempts:

- Native suite: failed at startup with `ECONNREFUSED 127.0.0.1:55432`; none of the
  six overlapping-session cases executed. No native PostgreSQL/Docker runtime is
  available here.
- Desktop/phone suite: six launch failures because the pinned Chromium Headless
  Shell executable is absent. App/fixture startup succeeded. These are not six
  application-behavior failures and not passing browser checks.
- Real Auth remains open. The callback currently exchanges a `code`; invitation
  email template and fresh-device/reset behavior must be checked against a local
  Auth service before acceptance. No hosted Auth configuration was changed.

See `refactor-gate-runbook.md` for exact execution instructions, remaining browser
coverage, and local Auth acceptance criteria. Changes in this continuation affect
tests, CI, documentation and an unapplied migration; the working isolated Vercel
Preview remains on application commit `e656134`.

Final local result for this gate continuation: clean `npm ci --offline --no-audit
--no-fund` installed 437 packages; the final `npm run check` passed formatting,
zero-warning lint, strict TypeScript, **145 tests in 13 files**, and the production
build. The inventory permission regression and native fixture bootstrap passed.
A separate attempt to install only the smaller pinned Chromium Headless Shell
also exhausted its download retries with timeouts. Neither browser nor native
concurrency execution is marked passed. Production, shared data and the deployed
Preview were unchanged during this continuation.

## Draft publication preparation

The original worktree's shared Git metadata became unavailable, while the source
remained intact. Recovery against unchanged main produced application/test commit
`a5704176d6798ace8a3acdbef0e21407aed25852`; staged source was checked byte-for-byte
against the preserved checkout. A clean commit export passed
`npm ci --offline --no-audit --no-fund` (437 packages) and `npm run check`
(format, lint, strict types, 145 tests, build). The replacement checkout has its
own Git metadata; the old local commit history was not recovered.

`docs/draft-pr.md` contains the publication-ready draft description and remaining
acceptance checklist. GitHub branch creation still failed with HTTP 403,
`Resource not accessible by integration`; Git push has no configured credentials.
The branch has no open PR and main reports protection disabled. Remote CI has
therefore not run. The existing browser, native PostgreSQL, real Auth and full
review gates remain open; this local check does not close them. No production,
Preview, hosted schema, or shared-data changes were made during recovery.

After the owner reconnected GitHub, branch creation succeeded for
`refactor/complete-and-preserve-modules`. The prior write-access block is resolved.
Publishing the prepared tree and running the two CI jobs are the next gates;
they are not yet recorded as passed.
