# Refactor gate execution

This runbook supplements the acceptance checklist in `engineering-refactor.md`.
No hosted database, production deployment, external email or supplier/customer
message is needed for these checks.

## Native PostgreSQL concurrency

`npm run test:postgres` opens separate PostgreSQL sessions and checks actual lock
waits through `pg_stat_activity` before committing the competing transaction.
It covers six overlap cases and a permission regression:

1. Inventory posting first, then a base-unit change: the change must fail.
2. Base-unit change first, then a posting in the old unit: the posting must fail.
3. Identical concurrent receipt retries: exactly one ledger posting.
4. Conflicting concurrent receipt retries: explicit conflict rejection.
5. Recipe release first, then a content edit: immutable-content rejection.
6. Last recipe line moved to another draft first, then release: empty-recipe rejection.
7. Direct recipe-line deletion remains denied, including for administrators.

The sixth case uses the existing permitted UPDATE path. Recipe tables deliberately
grant SELECT/INSERT/UPDATE, with no DELETE grant or policy; the test does not expand
those permissions to create an otherwise unavailable operation.

The runner accepts no database URL or hostname. It connects only to
`127.0.0.1:55432`, creates a randomly named `ss_gate_*` database, applies the actual
migrations, seeds synthetic identities and removes that database afterward. The
company-data migration is excluded. It requires explicit opt-in and a dedicated
local test password; inherited application/database connection variables are
ignored. It may create the `authenticated` and `anon` roles on the disposable
cluster. Do not point a port forward at a hosted service.

On a machine with Docker:

```bash
docker run --rm -d --name salad-refactor-postgres \
  -e POSTGRES_PASSWORD=isolated-ci-test-only \
  -p 127.0.0.1:55432:5432 postgres:17.11
```

After `docker exec salad-refactor-postgres pg_isready -U postgres` succeeds:

```bash
SS_DISPOSABLE_POSTGRES=1 \
SS_TEST_POSTGRES_PASSWORD=isolated-ci-test-only \
npm run test:postgres
```

Stop that dedicated container afterward with
`docker stop salad-refactor-postgres`.

The `postgres-concurrency` CI job provisions the same version independently of
the quality/browser job. The suite fails if PostgreSQL is unavailable; it does
not silently skip the gate. PGlite separately verifies the bootstrap SQL,
permissions and isolation guards, but cannot prove simultaneous-session behavior.
The overlap cases currently target PostgreSQL's default READ COMMITTED isolation.
REPEATABLE READ/SERIALIZABLE behavior still requires assessment before approving
the candidate locking migration for hosted application.

## Browser gate

```bash
npx playwright install --with-deps chromium
npm run test:browser
```

The suite has desktop and 390px phone projects. It covers sign-in validation,
full administrator navigation, Recipes/version selection, Products, inventory,
receiving, sign-out, account/callback routing and a lost inventory-response retry.
The retry check forwards the first action then drops its browser response and
checks that the next submission preserves the same request ID and form values.
A localhost-only diagnostic endpoint records synthetic inventory request IDs and
reasons, bounded to 50 attempts; it is not part of the exported Vercel fixture.
Business-data writes remain deliberately rejected by this fixture. Successful
posting/commit behavior is covered separately by the database suite.

Passing these tests still does not prove real Supabase Auth or complete worker,
receiver, keyboard, deactivation and receiving-retry acceptance. Continue expanding
those paths before closing the full browser gate.

## Real Auth gate

Use a disposable local Supabase stack with captured local SMTP, never synthetic
users in the shared hosted project. Docker is required by the existing local
Supabase configuration. Record the CLI/Auth versions and callback/email template
configuration with the test evidence.

Verify all of the following through the application:

- Sign-in and expired-session refresh persist cookies through Proxy and the next
  server-rendered request.
- An invitation opened in a fresh browser/device establishes the intended session
  and permits password setup. Do not test only the original administrator's tab.
- A password-reset email reaches the local mail capture, its callback establishes
  a writable session, password update succeeds, and sign-out completes.
- An expired/reused/invalid link fails safely; Auth/network and cookie-write
  failures do not report success.
- After sign-out, the browser loses its session and the revoked refresh token
  cannot create another session. Assess access-token expiry separately.

Review finding: the current callback handles `code` with
`exchangeCodeForSession`; the actual invitation/reset email template and
cross-device behavior have not been verified. Confirm that contract against the
local Auth service before changing templates or declaring invitation acceptance.
No hosted email template or Auth setting has been modified.

## GitHub and final review

Publish `refactor/complete-and-preserve-modules` as a draft PR once repository
write access is available. Run both CI jobs against the proposed commit. Required
checks/reviews on main must be configured and verified through authorized repo
administration; a workflow definition alone is not protection. Review all pending
migrations, including isolation-level behavior, before any separate authorization
to apply them. Do not merge or promote the Preview as part of this gate run.

References: [node-postgres transactions](https://node-postgres.com/features/transactions),
[PostgreSQL activity monitoring](https://www.postgresql.org/docs/current/monitoring-stats.html),
[Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).
