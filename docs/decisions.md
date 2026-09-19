# Implementation decisions

## 2026-09-18 — One hosted database

The owner explicitly chose one Supabase database for this small company, superseding the separate staging-database recommendation in PRD v2.2 and Build Specification v1.1. Keep those source documents unchanged as historical reference; this decision governs the implementation.

- GitHub: `mattdannadev/Salad-Soulmates`, initial branch `main`, both confirmed by the owner.
- Supabase: **Salad Soulmates**, organization **Danna Lab**, project `ddpfmzssgxkvvfkpcvuv`.
- Use this project for the application. Do not create a second hosted staging database.
- Automated database tests run in disposable local PostgreSQL through PGlite; tests never write to the hosted database.
- Keep schema changes in versioned `supabase/migrations` files and apply transactionally.
- Do not load sample orders, ingredient balances, or fake operating records into the shared database.
- The single-database decision does not enable receiving, production consumption, packaging, or shipping before their acceptance gates.
- Auth roles and organization/facility isolation remain enforced. No database password or privileged service key belongs in the browser or Git repository.

## Reference precedence

Current explicit owner instructions > this decision log > Build Specification v1.1 > PRD v2.2 > illustrative mockup values. Scheduling/PTO and Spanish worker mobile remain committed Increment 1A scope despite a leftover PRD sentence calling scheduling a later slice.

## 2026-09-19 — Refactor scope and revised delivery order

The owner directed that all three supplied engineering documents be executed as the first build-plan refactor phase: the mandatory AGENTS policy, the refactor audit/acceptance criteria, and the continuation instructions. Apply the policy to existing and future code; do not treat documenting it as completing the refactor.

The approved remaining delivery order is: full engineering refactor → materials requirements and purchasing → complete receiving/serialization → customer orders and production planning → scheduling and worker schedule → packaging → shipping → dropdown-list/reference-data management → third-party product-grid replacement last.

Preserve current receiving, access-approval, settings/reference-list, and other newer work. The later placement of reference-data completion does not authorize deleting implementation already present. This is a sequencing change, not an authorization to change confirmed operational rules. See `docs/build-plan.md` and `docs/engineering-refactor.md` for scope and actual progress. No automatic merge, production deployment, new hosted database, or shared-database test writes are authorized by this refactor.

## 2026-09-19 — Preserve the full app in the isolated Preview

The owner asked to finish the refactor and include Recipes and the other missing
original features. The Preview's incomplete synthetic administrator permissions
hid existing destinations; correct the fixture rather than weakening production
authorization. Products and Recipes were placeholder pages in current main.
Connect read-only catalog/version views to the existing schema and explicitly
carry forward authoring and the remaining original requirements in the build
plan. Keep the Preview synthetic, and keep production and shared data unchanged.

The owner explicitly reaffirmed full administrator access. The synthetic Preview
administrator receives all seeded permissions, and admin capabilities must remain
available on phones as well as desktop. This does not authorize shared-database
writes or enable unfinished operational modules. The reattached September 16
prototype package is retained as requirements context, with later explicit
business decisions and the current build specification taking precedence.
