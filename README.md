# Salad Soulmates

Next.js + TypeScript application for order-driven food production planning and a simple Spanish worker experience. Vercel is the hosting target; Supabase provides PostgreSQL, Auth and Storage.

## Current status

The foundation app runs locally against the single configured Supabase database. The first administrator is active. Sign-in, ingredient details and Spanish names, allergen setup, suppliers and purchasing packs, opening inventory/adjustments, and contextual feedback are implemented. The worker route is a Spanish availability notice, not a live worksheet. Hosted deployment and signed-in owner review remain pending; the full order-to-purchase vertical slice and later production flows are not enabled.

## Start here

- [Database setup and verification](docs/database.md)
- [Review and deployment gates](docs/review.md)
- [Owner decisions and source precedence](docs/decisions.md)
- [Build Specification v1.1](docs/requirements/Salad_Soulmates_Build_Specification_v1.1.md)
- [PRD v2.2](docs/requirements/Salad_Soulmates_PRD_v2.2.md)
- [Mockup reference index](docs/mockups/README.md)

## Directory map

```text
src/
  app/          Routes and server actions
  components/   Shared forms, navigation and feedback
  domain/       Business types, validation and calculations
  lib/          Auth, database and other infrastructure helpers
supabase/
  migrations/   Versioned database changes
tests/          Domain and database verification
docs/
  requirements/ Original versioned product specifications
  mockups/      Reference screenshots and screen index
scripts/        Small development utilities when needed
```

Keep routes focused on page composition. Put business logic in `domain`, infrastructure in `lib`, and reusable UI in `components`. Add a feature subfolder only once a feature has enough files to need one. Avoid duplicate database migration trees or a monorepo until there is a real second application.

## Development

Use Node 24 and npm. `npm ci` installs the locked dependencies. Copy `.env.example` to `.env.local` only on a new checkout and fill in the project URL and publishable key; this machine is already configured. Never commit `.env.local`.

Commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Lint, TypeScript, 18 local database/domain tests, and the production build pass. These checks do not substitute for signed-in owner review against the hosted database. On this Windows network, set `NODE_USE_SYSTEM_CA=1` before starting the app with Node 24.

Database tests run in disposable local PostgreSQL through PGlite and never touch the hosted database. Do not run reset or seed commands against the single hosted project.

## Product invariants

- Customer demand drives planning and purchasing.
- Standard mixer batch: 40 gallons; exactly one spice bucket per batch.
- Ceiling rounding remains a visible provisional assumption with explicit overage.
- Recipes must be released and immutable before planning uses them.
- Planning commitments are not actual ingredient consumption.
- Scheduling/PTO and Spanish-first worker mobile are committed Increment 1A scope.
- Receiving/serialization precedes live batch execution; packaging, shipping and invoicing follow later.
- Contextual feedback remains part of review.

The owner selected one hosted database; see `docs/decisions.md` for the override to the original staging-database recommendation.

