# Isolated browser verification deployment

Updated September 19, 2026. Danna Lab Vercel access is restored. The first isolated Preview is READY; this continuation prepares an updated export with Recipes and complete administrator navigation.

## Scope and authorization

The owner authorized a reachable test deployment to verify the existing refactor.
Use Vercel Preview for the existing Salad Soulmates project in Danna Lab. Do not
promote to production, change production aliases, apply migrations, seed the
shared database, or create another hosted database.

The deployed application commit and both fixture hashes are recorded in each export's `verification-manifest.json`.

Project: `prj_YMEJXmvuW9afmm629PvtzeOI9qEr` (`salad-soulmates`).

Team: `team_VlPPQZIePTHvlAAaoOXbtgtp` (`danna-lab`).

## Prepared implementation

`scripts/prepare-browser-preview.mjs` exports only application source, public
assets, dependency manifests and required configuration from a full Git commit.
It refuses existing destinations and requires expected source patterns before
applying overlays. Environment files, documentation, business records, migrations
and Git history are excluded. `verification-manifest.json` records the base
application commit, fixture hash and every overlaid application file.

Only the exported copy adds a visible test banner, fixed synthetic connection settings, and a
custom SDK fetch transport. That transport returns synthetic responses in the
server process and never calls the network. There is no public test API endpoint.
It rejects unexpected destinations, business-data writes and unsupported routes.
An explicit preview flag is required; production targets and configured real
database credentials are refused at build and request time.

This is a smoke-test fixture with one synthetic administrator, all 19 seeded
permissions, synthetic recipe/product/ingredient/settings examples and empty
operational tables. It supports test login, refresh, catalog/detail reads,
empty-state screens, write-failure behavior, and sign-out. It does not reproduce real Supabase Auth,
RLS, email delivery, concurrent database sessions, successful receipt posting,
or worker/receiver role behavior. Browser success against it cannot close those
separate acceptance gates.

## Reproduce the export

From this repository:

```bash
node scripts/prepare-browser-preview.mjs ../browser-preview FULL_REVIEWED_COMMIT_SHA
```

From the newly exported directory:

```bash
npm ci
SS_BROWSER_TEST_PREVIEW=1 npm run build
```

Link the export to the existing Vercel project and deploy with target Preview.
The owner has authorized this isolated source upload. Do not use `--prod`.
Inspect environment variable names and remove inherited real database credentials
from this deployment's overrides; never change the production variables. The
export's configuration enables the explicit test flag for build and runtime.
Its guard refuses a real Supabase URL/key or database credentials rather than
quietly using them. Keep existing deployment protection enabled.

Wait for Vercel's READY status, then open the returned deployment URL in the GPT
browser. Confirm the visible test banner and application commit before exercising
the prepared flows. Report actual browser observations separately from unit tests.

The synthetic login is `admin@example.test`, password `local-test-password`.
These are fixture constants, not credentials for any real account. Use the
browser's supported authentication flow; do not ask for real production secrets.

## Verification and remaining gates

- The resumed clean `npm ci --offline --no-audit --no-fund` and baseline check
  passed 116 tests. The current complete check passed **141 tests in 11 files**,
  formatting, lint, TypeScript and the production build.
- The first isolated Preview at
  <https://salad-soulmates-m67qyz45c-danna-lab.vercel.app/login> reached READY.
  Its incomplete administrator permission set explains the missing navigation.
  Use the latest deployment recorded below when reviewing the corrected build.
- Vercel project/team access and the CLI are authenticated. Deployment protection
  remains enabled. Preview-only credential overrides clear inherited database
  secrets without changing any project-level environment variable.
- Local Chromium installation/download failed. Real Auth/email flows,
  overlapping PostgreSQL sessions and successful operating-data writes are not
  verified by this synthetic deployment.
- GitHub branch creation still returns HTTP 403, `Resource not accessible by
integration`; the remote draft PR and CI run remain blocked.
- No production release, production alias changes, hosted migrations or shared
  database writes were performed.

## Updated deployment

- Application commit: `e6561347b9b456e94f7374bb4db9a0f022a3e240`.
- Preview: <https://salad-soulmates-ftbqxnve1-danna-lab.vercel.app/app/recipes>.
- Deployment: `dpl_4HdDcB9Stgk5rCHkwmc5U1sckhcL`, confirmed **READY**, target Preview.
- Vercel remote build completed successfully. The browser displayed the synthetic
  environment banner with commit `e656134` and the login screen.
- After secure sign-in, the browser verified Home and every admin navigation
  destination: Ingredients, Suppliers, Products, Recipes, Orders, Planning,
  Inventory, Receiving, Team, Access Requests, Settings and Feedback. Recipe
  details showed ingredient quantities, notes and QC; switching to a draft showed
  its empty sections without borrowing released content. Settings displayed all
  19 administrator permissions. The Recipes desktop screenshot was inspected.
- No application-origin errors/warnings were observed in captured console logs;
  the browser extension emitted unrelated metadata errors. Mobile viewport,
  successful writes and real Auth remain unverified by this browser check.
- The production alias still resolves to the unchanged deployment
  `dpl_6ADKczn9R32yjaQ6cuoiKwRkiDpz`; all three existing production aliases remain
  assigned there.
- `npm run check` also passed on the committed application: 141 tests and build.
- CLI Git push dry-run cannot authenticate; the connected GitHub branch-create
  call returns 403. The local review branch remains unpublished.
