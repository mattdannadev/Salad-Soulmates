# UI/UX overhaul build plan

Status: complete — validated 2026-09-29.
Owner intent: make Salad Soulmates a calm, fast, beautiful operations application
where every screen is consistent, every workflow is recoverable, and missing
setup data can be resolved without losing work.

## Use this plan

Use this completed plan as the baseline before changing any user-facing route, component, navigation,
form, list, search, filter, empty state, dialog, or responsive behavior. It
supplements the engineering policy and feature requirements; it does not change
domain rules, permissions, RLS, inventory immutability, recipe release rules, or
the single-hosted-database decision.

Work in small screen-family increments. Preserve existing routes and deep links.
Do not treat a visual refresh as completed UX work: each change needs workflow,
keyboard, narrow-screen, loading, error, empty-state, and regression validation.

## Product principles

1. **Never strand an operator.** Every screen explains the next valid action.
2. **Preserve task context.** List → detail/create → save or cancel returns to
   the validated origin with useful query state, selection, and focus restored.
3. **One meaning per control.** Links navigate; buttons mutate state, disclose
   UI, or open a dialog. A navigation CTA may look like a button but remains a
   semantic link.
4. **Repair data in context.** Missing prerequisites offer a quick, safe create
   or configuration path and resume the originating workflow afterward.
5. **Make common work effortless.** Strong defaults, concise copy, visible
   status, predictable actions, and restrained motion beat decorative complexity.
6. **Accessible by default.** Semantic controls, visible focus, keyboard access,
   labeled fields, useful validation, status announcements, and responsive reflow
   are acceptance requirements, not optional polish.

## Shared contracts and primitives

### Return context

Implement one validated internal `returnTo` contract for all list → detail/create
→ save/cancel journeys. It must support pathname, query, fragment, optional focus
row, and a deterministic fallback. Reject external, malformed, unauthorized, or
otherwise unsafe destinations. Use `router.replace` after successful mutation
when the user should not return to a stale form via Back.

The contract applies to ingredients, customers, suppliers, products, recipes,
orders, purchasing, inventory, receiving packages, shipping, user management,
worker tasks, and all future operational records. A direct/bookmarked form must
use its documented fallback safely.

### Action system

Create and use shared primitives:

- `ActionButton`: primary, secondary, tertiary, destructive, and icon-only
  variants with one size/focus/loading vocabulary.
- `BackButton`: named destination when meaningful (for example, “Back to
  orders”), not history-only behavior.
- `FormFooter`: Save/Create, Cancel, pending, success/error feedback, and a
  stable responsive layout.
- `ConfirmDialog`: deliberate destructive confirmation with correct focus,
  Escape/cancel behavior, and focus return.
- `PageHeader`: title, short task-focused description, and one dominant action.

Use precise verbs: “Create customer”, “Save changes”, “Apply filters”, “Clear
all”, “Deactivate ingredient”. Avoid vague labels such as “Submit”, “Click here”,
or competing primary actions.

### Directory system

Create a shared `DirectoryToolbar` query contract:

`q`, structured filters, `sort`, `page`, result count, active filter chips, clear
all, and optional mobile filter disclosure. Store meaningful state in the URL.
Use one toolbar per collection. Do not combine an independent client-side quick
search with server URL filtering unless their scopes are explicit and necessary.

Make `ListGrid` controlled by this model, including sort/page state and row-focus
restoration. Use server-side filtering/pagination for operationally large data;
client filtering is reserved for genuinely small reference catalogs.

### Empty and recovery states

Use a shared `EmptyState` with one of these explicit reasons:

| State                | Required recovery                                          |
| -------------------- | ---------------------------------------------------------- |
| No records yet       | Explain the value and show the primary Create action.      |
| No matching results  | Show applied criteria and offer Clear all.                 |
| Missing prerequisite | Name it, offer Create/configure, then resume work.         |
| No permission        | Explain the permission/owner action without exposing data. |
| Load/service failure | Explain safely and offer Retry or an actionable fallback.  |

For simple subordinate records, use inline creation or a compact dialog. For
medium-complexity contextual setup, use a drawer. For complex product/recipe
setup, save the parent draft, use a full page with `returnTo`, and resume it after
creation. Do not nest modals beyond one level.

## Screen-family scope

### First-use and demo

- Provide a clearly labeled, isolated sample-workspace/demo path; never insert
  fabricated operating records into the shared production database.
- Add an empty-workspace checklist that makes setup order obvious: ingredients,
  suppliers/packs, products/recipes, customer pricing, customer order.
- Every checklist/empty-state action must preserve the user’s origin.

### Orders, customers, products, and recipes

- Order → missing customer → create customer → resume draft with the customer
  selected.
- Order → missing sellable product/package price/released recipe → configure it
  → resume draft with the record selected.
- Add directory search/filter/sort for customers, products, recipes, and orders.
- Orders need text, customer, product, order status, production status, pickup
  date range, sort, and an explicit historical view.
- Product/recipe filters should expose readiness, released version, packaging,
  pricing, and missing-setup states.

### Ingredients, suppliers, and inventory

- Ingredient → missing supplier → create supplier → return to ingredient → add
  supplier pack without context loss.
- Provide one ingredient/inventory toolbar, removing nested duplicate searches.
- Support text, type/category, active state, stock state, supplier, and
  missing-setup filters where the underlying data/permissions allow it.
- Customers, ingredients, suppliers, and users should have one primary record
  drill-in affordance, not duplicate name and “View details” links.

### Purchasing, receiving, shipping, and traceability

- Purchasing needs supplier, status, customer order, ingredient, due-date, and
  text search/filter, with return context to originating order/inventory work.
- Receiving packages need server-backed text, ingredient, supplier, hold/status,
  expiry, and balance filters.
- Shipping needs customer, pickup-date, readiness/status, and text filters; an
  empty shipping screen must make creating/opening an order possible.
- Keep traceability’s purpose-built lookups, but give each search a consistent
  URL namespace, validation message, clear action, result count, and reversible
  detail view.

### Administration, worker, and AI surfaces

- Users and login history require URL-backed search/filter/sort; login history
  requires date, user, and event filters rather than a fixed client-only sample.
- Worker task completion and package/label/detail screens must return to their
  actual origin, not a hard-coded generic page.
- AI/copilot surfaces share the application shell, action system, visual tokens,
  and escape/resume behavior; they must not become a separate visual system.

## Visual direction

Build a premium, restrained operations interface:

- Warm neutral canvas, clear working surfaces, deep green for primary action and
  active navigation, and sparse semantic status color.
- One spacing scale, typography hierarchy, control-height family, radius scale,
  border treatment, icon treatment, and elevation policy.
- Desktop data optimized for scanning: stable column layout, quiet dividers,
  left-aligned labels, right-aligned quantities/currency, consistent dates, and
  predictable row actions.
- Narrow screens stack toolbars/forms cleanly; preserve horizontal scrolling only
  inside data tables that genuinely need two-dimensional layout.
- Motion is brief and purposeful for feedback/state change, respects
  `prefers-reduced-motion`, and never delays repeat work.
- Visible focus must not be obscured by sticky headers or footers. Prefer
  comfortable 40–44px controls while meeting WCAG 2.2 AA target-size requirements.

## Delivery phases

### Phase 0 — Baseline and design contract

Document current route behavior and capture representative populated, empty,
filtered-empty, validation-error, and narrow-screen screenshots. Define tokens,
component API contracts, return-context validation, and success metrics. Add
characterization tests before changing existing behavior.

### Phase 1 — Navigation, actions, and forms

Implement the safe `returnTo` utility, shared action/form primitives, and apply
them to ingredients, customers, suppliers, orders, and user profiles. Replace
history-dependent post-save behavior with deterministic fallback behavior.

### Phase 2 — Directories and search/filter

Implement `DirectoryToolbar` and controlled `ListGrid`; migrate ingredients,
inventory, orders, users, customers, suppliers, products, recipes, purchasing,
shipping, packages, and login history in prioritized increments. Move large
operational data sets to server-side filtering/pagination.

### Phase 3 — In-context recovery and onboarding

Implement quick-create/drawer/full-page continuation patterns for the specified
prerequisite chains. Add empty-workspace onboarding and isolated demo/sample
entry points.

### Phase 4 — Visual consolidation and accessibility

Replace divergent page/module styling with shared tokens/primitives; audit all
screens for keyboard, focus, dialog, zoom, reflow, reduced-motion, bilingual, and
mobile behavior. Do not remove useful density from operational tables.

### Phase 5 — Validation and iteration — Complete (2026-09-29)

Run task-based owner testing using the journeys below, inspect analytics/error
rates where authorized, and refine only with measured evidence. Record completed
screen families, checks, remaining risks, and owner acceptance in the build plan
and relevant feature documentation.

#### Evidence — 2026-09-29 production acceptance pass

- Completed screen families: dashboard setup and read-only demo; Login History
  directory controls; Packages directory filters; and the 390px mobile
  navigation drawer (open and Escape-to-close).
- Production checks: each of the above routes loaded with its expected controls;
  the Packages directory loaded package results after the related Supabase
  migration was applied. Ingredients and Products both rendered their
  filtered-empty states, and Packages had no horizontal overflow at a 320px
  viewport. The inspected production session had no browser console errors.
- Automated checks: 32 focused tests passed across directory toolbar,
  return-context, workspace onboarding, and dialog-accessibility coverage.
  Three focused desktop browser regressions also passed: customer directory
  search/focus/edit return and order missing-customer recovery with suspended
  draft restoration.
- Return-state check: the production customer Cancel control exposes the
  expected filtered-directory destination (`/app/customers?q=Directory%20focus`)
  and that destination loads with the query preserved. The browser automation
  session did not trigger client-side link navigation, so the physical
  click-to-cancel step remains an owner check rather than a product defect.
- Ongoing regression scope: the full collection-by-collection, zoom, and
  injected permission/service-error matrix remains part of ordinary regression
  coverage. Permission-denied and service-failure responses are deliberately
  fixture-only because production checks do not use destructive or privileged
  Supabase scenarios. The Playwright download cache remains unavailable locally
  because Windows denied creation of its cache lock, but the focused suite runs
  successfully against the installed Chrome executable.
- Owner acceptance: the owner authorized closure of this UI/UX plan after the
  documented production review and automated acceptance coverage. No production
  operating data was written during validation.

## Acceptance journeys

Every affected increment must verify, at minimum:

1. Open a filtered/sorted collection, open a record, save or cancel, and return
   to the identical meaningful collection state with focus on the changed row.
2. Start a parent workflow, encounter a missing relationship, create/configure
   it, resume the workflow with prior input preserved, then save successfully.
3. Load each collection with no records, no matching results, missing setup,
   denied permission, and recoverable service failure.
4. Complete primary task paths using keyboard only, a narrow viewport, and zoom;
   test dialogs for accessible name, focus trap, Escape, Cancel, and focus return.
5. Validate both English and Spanish interface copy, accurate business terminology,
   and no accidental translation/change to owner-entered business records.

## Required verification

- Unit tests for return-path validation and query-state preservation.
- Component tests for action semantics, loading/error/success feedback, form
  footer behavior, empty-state recovery, and controlled toolbar state.
- Browser tests for all acceptance journeys and representative screen families.
- Accessibility checks for labels, error summary/field association, live status,
  keyboard interaction, focus visibility, dialogs, contrast, reflow, and reduced
  motion.
- Existing `npm run check` plus focused browser/database checks appropriate to
  the changed feature. Do not claim live-browser review, production readiness, or
  deployment without actually completing those checks.

## Explicit non-goals and safeguards

- No production/sample operating-data writes as part of UI work.
- No relaxation of authorization, RLS, validation, inventory idempotency, or
  immutable release/history rules for a smoother UI.
- No generic global search until directory query contracts and authorization-safe
  result boundaries exist.
- No automatic domain defaults that fabricate inventory, allergen, supplier,
  pricing, or financial facts.
- No broad CSS rewrite without screen-family acceptance tests and visual review.

## Source basis

This plan incorporates the September 2026 UI/UX audit and authoritative guidance
on action semantics, contextual creation, empty-state recovery, accessible forms,
dialogs, status feedback, and responsive reflow. External guidance informs the
interaction patterns; existing Salad Soulmates domain rules remain authoritative.
