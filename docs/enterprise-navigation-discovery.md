# Enterprise navigation — discovery checkpoint

Updated: September 29, 2026

## Scope and status

This checkpoint starts Phase 1 of the [enterprise navigation build
plan](enterprise-navigation-build-plan.md). It inventories the active application
shell and records the route-contract work required before a typed navigation
registry replaces it. It does not change route authorization, RLS, database
schema, feature scope, or production behavior.

## Current shell findings

- `src/components/shell.tsx` owns a static `homeNavigation` array and a static
  `navigationGroups` array. Desktop navigation, its permission filtering, active
  state, and the three-item mobile bar are derived there, but breadcrumbs are
  static top-bar text.
- The shell preserves the approved desktop collapse behavior, Spanish labels,
  link semantics, and accessible mobile drawer/focus handling. The registry
  migration must preserve those contracts.
- Purchasing remains a visible Inventory child in the shell. This conflicts with
  the September 21 owner decision: manual replenishment starts from Inventory or
  a Supplier and Purchasing is not a main-navigation destination.
- Customers and Suppliers appear both in their operational groups and again in
  Administration. This creates duplicate record destinations and needs an
  intentional canonical placement.
- `/app/planning` redirects to `/app/orders`; it is not currently a canonical
  production-planning screen. Existing worker preparations are reached through
  the focused `/worker/task/[assignmentId]` experience. A durable administrator
  entry point requires a separately defined route, permission, return path, and
  preservation of the worker workflow.
- Allergens exists at `/app/allergens` and is linked contextually from
  Ingredients, but is not a shell destination. This matches the open decision in
  the enterprise plan; it must not be promoted without confirming its independent
  maintenance workflow.
- Current access-request implementation is canonical at
  `/app/user-management/access-requests`; legacy `/app/access-requests` remains
  in browser coverage and needs redirect/compatibility confirmation.

## Proposed first registry slice

The first code slice should be behavior-preserving. It moves only existing,
already-canonical shell destinations into a typed registry, then derives desktop
links, mobile links, active-route matching and breadcrumbs from it. It must not
introduce new destinations, roles, commands, search, badges, or facility
selection.

| Contract        | Initial rule                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical route | One registered route per existing visible destination; preserve supported deep links with explicit redirects where needed.            |
| Visibility      | Keep the current permission predicates in the registry. Visibility is presentation only; server checks and RLS remain unchanged.      |
| Active state    | Exact route or registered descendant matching; do not rely on broad prefixes that mark unrelated siblings current.                    |
| Breadcrumbs     | Registry-derived Home → domain → destination labels, localized using existing English/Spanish copy.                                   |
| Mobile          | Continue using the approved Dashboard, Orders and Inventory priority bar plus More; source all eligible items from the same registry. |
| Accessibility   | Preserve real links, `aria-current="page"`, named landmarks, visible focus, drawer Escape and focus return.                           |

## Decisions or verification needed before IA migration

1. Confirm the administrator-facing production-planning route and its permission
   contract before adding it to the sidebar.
2. Confirm whether Allergens is a Catalog item or remains an Ingredient-context
   destination.
3. Confirm legacy access-request and receiving route compatibility before adding
   canonical redirects.
4. Confirm whether multi-facility work requires a persistent switcher; do not add
   one while existing facility authorization remains implicit.

## Validation baseline for the first code slice

- Preserve `tests/user-management-navigation.test.ts` expectations and expand
  them for registry validation, permission-filtered visibility, route matching,
  localized breadcrumbs and mobile priority links.
- Extend browser coverage for direct links, desktop expanded/collapsed states,
  mobile drawer open/close/Escape, route-selection close, Back/refresh, and
  lost-access behavior at the approved phone viewport.
- Run the affected Vitest suite, lint, typecheck and build before treating the
  registry slice as ready for review.

## Next implementation step

The registry and `Shell` migration are implemented. The desktop and mobile shell
now derive their destinations, permission visibility, active state and localized
breadcrumbs from one registry. The first IA migration also makes Purchasing a
contextual destination, removes duplicate Customers/Suppliers sidebar links,
adds Allergens to Catalog, and makes Scheduling the live Planning & production
destination.

Focused TypeScript, lint and unit coverage passed. Browser validation remains a
release gate: the local Playwright run could not start because port 3000 was
already occupied by an existing process; that process was not interrupted.

The administrator-facing `/app/planning` workspace is now a canonical,
`planning.read`-protected destination. It guides permitted users to customer
demand, ingredient availability and team scheduling while keeping worker tasks
inside their assignment-scoped mobile workspace. The next navigation slice can
add durable queue counts only after their service contracts are defined.

## Dashboard work-queue slice — in progress

The dashboard now derives permission-scoped counts and canonical directory URLs
for due pickups, purchase drafts awaiting review, unreceived deliveries,
ingredient shortages, and orders without a production plan. The Purchasing
directory's `delivery=unreceived` filter uses receipt-derived progress, so fully
received orders are not included in the queue results. The contract suppresses
Orders links unless the current user can open that directory, and queue copy does
not imply a write permission. Focused unit coverage verifies queue visibility,
counts, urgency and directory URL contracts.

Traceability-exception queues remain deliberately deferred: package availability
states such as Hold and Quarantined do not establish a genealogy exception, and
the product has no read-only contract for incomplete historical traceability.
Queue-to-record return context, browser Back/refresh and lost-access coverage
remain acceptance work for the next slice.
