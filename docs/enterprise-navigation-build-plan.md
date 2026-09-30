# Enterprise navigation build plan

Updated: September 29, 2026

## Purpose and status

This is the active, cross-cutting plan for reorganizing the operational web
application's navigation around user work, business domains, and canonical
records. It complements the [UI/UX overhaul build plan](ui-ux-overhaul-build-plan.md);
it does not authorize a production deployment, database migration, relaxed
authorization, or removal of existing deep links.

## Product model

The application must distinguish these types of work without exposing database
terminology as the primary user interface:

| Type                    | User need                                    | Required pattern                                                                        |
| ----------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Master/reference data   | Find and maintain durable business objects   | Stable noun list, canonical detail, relationships, history and archive state            |
| Transactional work      | Understand or progress a business event      | Status/date-oriented list, lifecycle-aware detail and linked source records             |
| Setup/configuration     | Control how the organization operates        | Separate permissioned settings, explicit scope, save behavior and impact                |
| Action/work queue       | Resolve what needs attention now             | Priority/owner/due-date lens over canonical records, never a duplicate record hierarchy |
| Reporting/investigation | Understand performance or trace an exception | Measures and filters that lead to source records while preserving context               |

Action queues are views over canonical objects. Queue-to-record navigation must
preserve a usable return context; a record reached from a dashboard, search,
relationship, or queue retains one canonical route.

## Target information architecture

The desktop sidebar contains durable business destinations. The header contains
global discovery and user/facility context. Page-level navigation contains peer
views. Record actions remain beside the content they affect.

| Area                     | Intent                                         | Initial destinations                                    |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------- |
| Home                     | Current work and exceptions                    | Dashboard, My work / needs attention                    |
| Catalog                  | Product reference data                         | Ingredients, Allergens, Products, Recipes               |
| Customers & orders       | Customer demand through fulfillment            | Customers, Orders, Shipping                             |
| Procurement              | Supply-side maintenance and execution          | Suppliers, Purchasing, Receiving                        |
| Inventory & traceability | Stock, adjustments, compliance investigation   | Inventory, Traceability                                 |
| Planning & production    | Convert demand into executable production work | Demand coverage, Production planning, Lots/preparations |
| Administration           | Organization controls                          | Team, Users, Access profiles, Settings, Audit history   |

Do not make “Master data” or “Transactions” literal top-level labels unless
validated user research shows users prefer them. Business nouns and tasks are
the primary labels.

## Current-state decisions to resolve

1. Make Purchasing discoverable in the main IA or retain the explicit prior
   decision to start it only from Inventory/Supplier flows; do not leave its
   discoverability accidental.
2. Give Planning/Production a durable destination when the active worker
   preparation workflow requires administrator navigation. Preserve the
   prior owner decision that customer Orders remain the sole demand-entry flow.
3. Canonicalize access-request and receiving routes. A focused receiver
   workspace may remain distinct from the administrator receiving workspace,
   but their roles and exit paths must be explicit.
4. Choose whether Allergens is a Catalog destination or a contextual Ingredient
   tab based on its independent maintenance workflow.
5. Confirm whether multi-facility users need a persistent facility/workspace
   switcher before adding one. Existing organization/facility authorization and
   server-side isolation remain authoritative.

## Implementation plan

### 1. Discovery and route contract

- Inventory routes, role workspaces, permissions, record lifecycles and
  cross-record links.
- Define canonical URL, redirects, breadcrumb hierarchy and permitted roles for
  every destination.
- Map the five product-model types above to page patterns and task flows.
- Validate the proposed IA with representative flows: customer order through
  fulfillment, shortage to purchase, purchase to receipt, lot investigation,
  and access administration.

**Acceptance:** each critical task has a discoverable domain route and every
record has exactly one canonical destination.

### 2. Typed navigation registry

- Add a typed registry as the single source for canonical route, localized
  labels, icon, section, item type, permission, allowed roles, parent,
  mobile priority, breadcrumb and search keywords.
- Generate desktop navigation, mobile navigation, active-state resolution and
  breadcrumbs from that registry.
- Preserve page/service authorization and RLS checks. Hiding a navigation item
  is not authorization.
- Replace broad path-prefix special cases and duplicated mobile grouping with
  tested route matching.

**Acceptance:** new routes are registered once; desktop/mobile visibility,
active state, breadcrumbs and search metadata remain consistent.

### 3. Shell and contextual navigation

- Preserve the existing desktop collapse/expand behavior, Spanish labels and
  accessible mobile drawer/bottom-navigation intent from the UI/UX baseline.
- Replace the static top-bar location text with route-derived breadcrumbs.
- Use page tabs only for peer views of one area or record; do not create a third
  sidebar depth.
- Make record relationships explicit links, such as Supplier, Ingredient or
  Purchase Order, rather than forcing users to traverse the sidebar.
- Preserve durable list filters, sort, page, selected view and queue-return
  state in shareable URLs; define Back behavior before implementation.

**Acceptance:** direct links, refresh and browser Back retain meaningful task
context across list, detail, creation and queue flows.

### 4. Work queue and discovery

- Turn the dashboard into a clear action surface for due pickups, shortages,
  unconfirmed purchases, unreceived deliveries, planning readiness and
  traceability exceptions.
- Define queue status/count contracts in services; do not display decorative or
  drifting badges.
- Add a permission-aware command palette for destinations and safe commands.
- Add secured entity search only after search contracts, authorization and
  ranking requirements are defined. Recents/favorites are additive
  personalization and must not reorder the shared core navigation.

**Acceptance:** queue → record → Back restores the queue; command results never
expose unavailable destinations or records.

### 5. Accessibility, verification and rollout

- Use named navigation landmarks, real links, disclosure buttons,
  `aria-current="page"`, visible focus, skip navigation, logical keyboard order,
  Escape/focus-return behavior for overlays and mobile drawers.
- Do not use ARIA menu semantics for ordinary sidebar navigation.
- Add unit coverage for registry validation, permission visibility, active-route
  matching, canonical redirects and search filtering.
- Add browser coverage for administrator, reviewer, receiver and worker flows;
  desktop collapsed/expanded states; mobile navigation; English/Spanish labels;
  direct links; refresh; Back; and lost-access states.
- Roll out in reversible slices: registry first, IA migration second,
  contextual navigation third, queues and command palette last. Measure task
  completion, navigation failures and search no-results before further expansion.

## Technical approach and libraries

Retain Next.js App Router, `next/link`, the existing custom shell/CSS and
`lucide-react`. A navigation framework will not solve information architecture.

- **No new library required** for the registry, sidebar, breadcrumbs and URL
  contracts.
- **Radix UI** is the preferred optional unstyled primitive foundation for
  Dialog, Dropdown Menu, Tooltip, Collapsible and Tabs when existing custom
  controls need stronger keyboard/focus behavior.
- **cmdk** is the preferred optional command-palette primitive; the application
  owns permissions, asynchronous entity search, ranking and shortcut scope.
- **nuqs** is optional for dense typed URL state. Adopt only when many list views
  need shared filter/sort/paging contracts, and explicitly select server refresh
  and browser history behavior.
- Do not introduce MUI, Ant Design, SAP UI5 or shadcn solely for this change.
  shadcn is conditional on a separately approved Tailwind/design-system
  migration.

## Non-negotiable preservation rules

- Preserve server-side authorization, organization/facility isolation, RLS,
  record immutability, inventory idempotency, bilingual behavior, existing
  deep links and role-specific focused workspaces.
- Keep the Orders workflow as the single demand-entry path unless a later owner
  decision changes it.
- Do not add a facility switcher, global entity search, notifications or
  production execution merely because the shell supports them; each requires
  confirmed scope and service/data contracts.

## Sources

- [Carbon global header](https://carbondesignsystem.com/patterns/global-header/)
  and [left panel](https://carbondesignsystem.com/components/UI-shell-left-panel/usage/)
- [SAP list report and object page](https://help.sap.com/docs/SAPUI5/b2f662dd9d7a4ec680056733050b4d34/c0eec49db81a441e878f528c8f3d28de.html)
- [SAP action placement](https://www.sap.com/design-system/fiori-design-web/v1-120/foundations/best-practices/global-patterns/action-placement)
- [Next.js navigation](https://nextjs.org/docs/app/getting-started/linking-and-navigating)
- [W3C consistent navigation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html)
  and [disclosure navigation](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/)
