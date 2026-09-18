# Foundation review and deployment

## Implemented

- Email/password sign-in, session refresh, active profile checks and role-aware routing.
- Admin/reviewer workspace: ingredients, controlled Spanish names, allergens, suppliers, and supplier pack definitions.
- Facility-specific on-hand totals from the immutable opening/adjustment ledger. Reasons are required. Retries reuse a request ID to prevent duplicate writes.
- Contextual feedback and administrator review, including the current route and ingredient reference where applicable.
- Spanish worker landing page with large controls and feedback. It clearly says scheduling and worksheet execution are not available yet.
- Reference mockups and original specifications remain in docs. No example operating records were loaded into the hosted database.

## Validation recorded September 18, 2026

- `npm run lint`, `npm run typecheck`, `npm test`: pass (18 tests).
- `npm run build`: all routes compile for the Next.js/Vercel target.
- The owner signed in successfully against hosted Supabase. The browser dashboard shows Matt Danna / Admin and the expected empty ingredient, supplier and feedback counts. Review of actual record-entry workflows remains pending.
- PostgreSQL tests exercise actual migration SQL in disposable PGlite, not a mocked database. They check organization/facility boundaries, role restrictions, append-only history, request deduplication, supplier pack rules and atomic ingredient saves.

## Review with the owner

Use real approved information in the shared database; test fixtures belong only in the disposable database.

1. Sign in as the provisioned administrator. Confirm Home shows the correct identity and current counts.
2. Review the first ingredient, its base unit, controlled Spanish name and allergen assignments before saving it. Reload and verify persistence.
3. Add an approved supplier and its actual pack size from the ingredient detail screen. Verify only one active preferred pack is allowed.
4. Record a reviewed physical opening quantity with a reason. Verify the facility balance and history; later corrections use an adjustment.
5. Submit page feedback and mark it reviewed in Feedback.
6. Review the worker shell on a 390px phone viewport. Do not treat it as a working schedule or production worksheet yet.

## Vercel hosting gate

Import `mattdannadev/Salad-Soulmates`, branch `main`, with the Next.js preset and Node 24. Set the two public Supabase environment variables from `.env.example` using the existing project. No service-role key is required. Keep secrets out of Git.

Configure the canonical hosted URL and any approved callback URLs in Supabase Auth after a real domain exists. Password sign-in works locally without an email redirect. Self-signup remains disabled; additional users need explicit provisioning and assigned roles.

Preview deployments share the one hosted database. They must not load sample business records or run automated write tests against it. Leave migrations as an explicit reviewed step rather than an automatic reset/deploy hook.

## Next implementation gates

Products and immutable released recipes → scheduling/PTO and assigned worker views → customer orders → order-driven 40-gallon planning and 1:1 spice buckets → inventory/inbound shortages and purchasing recommendations. Preserve the visible ceiling/overage assumption. Complete Increment 1A acceptance before receiving/serialization (1B), then live Spanish batch execution (1C).

Storage upload workflows, password recovery email delivery, production monitoring and recovery procedures remain to be configured before broad rollout.

