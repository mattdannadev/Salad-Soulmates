# Database setup

## One hosted database

Use the existing **Salad Soulmates** Supabase project in **Danna Lab**:

- Project reference: `ddpfmzssgxkvvfkpcvuv`
- Dashboard: https://supabase.com/dashboard/project/ddpfmzssgxkvvfkpcvuv
- API URL: `https://ddpfmzssgxkvvfkpcvuv.supabase.co`
- One hosted database, per the owner's September 18 decision. See `decisions.md`.

The Supabase `main / PRODUCTION` badge names the project's primary branch. It does not mean that the unfinished application is approved for live operations.

## Foundation

The first migration creates organizations, facilities, profiles, ingredients, controlled Spanish display names, allergens, ingredient/allergen links, suppliers, supplier packs, an append-only inventory ledger, contextual feedback, and audit history. All twelve application tables use Row Level Security.

The second migration adds only the company and a **Main facility** using **America/Chicago**. This is a configurable facility label, not an asserted legal site name. Business data is intentionally empty.

Admin, reviewer, worker and receiver are supported profile roles. Only provisioned active profiles can access application data. A Supabase dashboard login is separate from an application user account; profiles do not automatically inherit dashboard access.

## Applying changes

Keep every schema change in `supabase/migrations`. Test locally before applying it to the hosted project. Initial setup was run transactionally through the visible Supabase SQL Editor, with each source migration recorded in `supabase_migrations.schema_migrations` (`version`, `name`, `statements`). Do not rerun an applied migration or reset this shared database.

For future CLI use, link this exact project and confirm remote migration history before `supabase db push`. Keep passwords and access tokens outside source control. Use a reviewed migration for changes; never run a seed/reset command against this hosted project once it contains business data.

## Verification

`npm test -- tests/database.test.ts` runs disposable PGlite PostgreSQL tests, including row-level tenant isolation, worker/reviewer permissions, prevention of self-promotion, audit/history protection, idempotent inventory submissions, unit consistency across facilities, tenant-safe foreign keys, pack constraints, atomic ingredient saves and contextual feedback. This test suite does not connect to Supabase.

Verified on the hosted project on September 18, 2026:

- 12 application tables with RLS enabled; 0 application tables without RLS.
- Both migration versions recorded: `202609180001` and `202609180002`.
- Foundation migration source matches the locally tested source after CRLF/LF normalization.
- Anonymous role has no ingredient SELECT permission; a real REST call returned HTTP 401 / PostgreSQL code `42501`.
- Authenticated role cannot update/delete inventory history or insert/update its own profile role.
- No operational ingredient records were inserted.
- Public user signup and anonymous sign-in are disabled; email/password sign-in and email confirmation remain enabled.
- Site URL is currently the local development default, `http://localhost:3000`. Add the actual app URL when hosting is configured.

Local tests complement, but do not replace, authenticated hosted Auth/API and end-to-end application checks. The owner-approved first administrator (Matt Danna) is provisioned and active for Salad Soulmates / Main facility. Hosted application sign-in succeeded and the administrator dashboard loaded with the expected identity. Review of actual record-entry workflows remains pending.

## App connection

The application uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in ignored `.env.local`; these have been configured locally. A publishable key is intentionally public; RLS and authenticated user sessions control access. No service-role key is needed by the application. The environment file is verified as ignored by Git.

On this Windows machine, Node needs the operating system certificate store to reach Supabase through the local network. Use `NODE_USE_SYSTEM_CA=1` with Node 24 when running the app. The connection check passed using `node --use-system-ca`; never disable TLS verification.

For each additional app user, provision the chosen user through Supabase Auth and link that user's UUID to a profile with the company, facility and approved role. Do not grant admin rights to arbitrary signups or create shared worker credentials.

## Build gates

The current schema is the foundation and first master-data slice. Products/recipes, scheduling/PTO, orders/planning, and worker assignments are subsequent migrations within Increment 1A. Serialized receiving remains 1B, live Spanish batch execution remains 1C. Storage is provided by Supabase; no public bucket is created before an actual upload workflow and its access policies exist.


