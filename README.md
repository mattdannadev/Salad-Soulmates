# Salad Soulmates

Next.js + TypeScript application for order-driven food production planning and a simple Spanish worker experience. Vercel is the hosting target; Supabase provides PostgreSQL, Auth and Storage.

## Current status

Main includes order-driven purchasing and customer packaging/prices, receiving and
physical serialization, and order-linked production preparation (merged PRs #1,
#2, #4, #5 and #6). Scheduling and worker schedule is the next feature.
Real-Auth, independent-review and physical printer/scanner acceptance remain open.
See the build plan and feature documents for scope and verification evidence.
Repository merge status does not establish current deployment status.

## Start here

- [Project index and cross-session workflow](docs/README.md)
- [Current build plan](docs/build-plan.md)
- [Continue in Codex or ChatGPT Work](docs/continue-in-codex.md)
- [Mandatory engineering standards](AGENTS.md)

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

Use Node 24 and npm. `npm ci` installs the locked dependencies. Copy `.env.example` to `.env.local` only on a new checkout and fill in the project URL and publishable key; verify configuration on each new machine. Never commit `.env.local`.

Commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Use `npm run check` for the full current check suite; consult feature documents and CI for dated verification results. These checks do not substitute for signed-in owner review against the hosted database. On this Windows network, set `NODE_USE_SYSTEM_CA=1` before starting the app with Node 24.

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
