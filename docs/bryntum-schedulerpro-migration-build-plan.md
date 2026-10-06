# Bryntum Scheduler Pro migration build plan

Status: approved for implementation planning and non-production validation

Decision: replace the MUI X Scheduler presentation control with the **regular** licensed Bryntum Scheduler Pro React packages, pinned to `7.3.7`:

```text
@bryntum/schedulerpro@7.3.7
@bryntum/schedulerpro-react@7.3.7
```

Do not use the thin package family in the first implementation. Salad Soulmates currently uses one Bryntum product, so thin's shared-package optimization does not outweigh the additional dependency and compatibility surface. Do not copy the downloaded Bryntum distribution into the application tree; install licensed packages through Bryntum's private registry. A valid commercial license and registry access are prerequisites.

## Goal and non-goals

The goal is a client-only Bryntum Scheduler Pro surface for the existing facility-scoped workforce schedule. It must preserve all current business behavior: all-day assignments, multi-employee assignment, PTO protection, availability overrides, draft versus published comparison, publication, locale, and authorization.

This work does not change the scheduling database schema, Supabase RPC contracts, server actions, permissions, publication rules, or worker schedule response. It also does not authorize timed scheduling, production completion, inventory posting, or a production deployment.

## Existing contracts to preserve

| Concern                                        | Canonical owner                                       | Migration rule                                                                     |
| ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Facility/date range and authorization          | `src/services/scheduling.ts`                          | Continue server-side loading and permission checks.                                |
| Validation and local calendar-date semantics   | `src/domain/scheduling.ts`                            | Keep `end_on` exclusive in persistence and transform only at the UI boundary.      |
| Persisting edits, PTO, settings and publishing | `src/app/app/scheduling/actions.ts` and database RPCs | Bryntum interactions call the existing actions; no browser-to-Supabase access.     |
| Scheduling page data shaping                   | `src/app/app/scheduling/page.tsx`                     | Preserve its typed props or move presentation-only mapping to a dedicated adapter. |
| Current UI/vendor boundary                     | `src/components/scheduling/scheduler.tsx`             | Remove MUI Scheduler imports only after Bryntum replacement passes acceptance.     |

## Delivery sequence

### 1. Dependency and compatibility gate

- Obtain licensed Bryntum npm registry access and add the two regular packages at exact version `7.3.7`; do not use `^`, trial aliases, or thin packages.
- Add one Bryntum structural stylesheet and one selected theme globally, without leaking its selectors into unrelated application UI.
- Build a small read-only Scheduler Pro proof of concept against the project’s Next.js 16 / React 19 setup. It must dynamically import with `ssr: false` and live behind a `'use client'` wrapper because Scheduler Pro requires browser APIs.
- Confirm the current licensed release is compatible with React 19. Avoid JSX event renderers until that is demonstrated; use supported configuration or DOM/string renderers in the first pass.

**Gate:** `npm run typecheck`, `npm run build`, and a browser rendering test pass without server-rendering or duplicate-bundle errors.

### 2. Presentation adapter and read-only parity

- Create a scheduler-specific adapter that translates application objects to Bryntum resources, events, assignments, time ranges, and display labels.
- Resources are facility employees; scheduling work is an event; a multi-employee work item becomes one event with multiple Bryntum assignments.
- Translate the application’s inclusive display `endDate` to Bryntum’s required end representation without altering persisted `start_on`/exclusive `end_on`.
- Render production-plan context as non-editable background/range data and PTO as protected, clearly labeled unavailable time. Never expose private PTO notes.
- Preserve English and Spanish task labels, the current facility/date/work-type filters, published-versus-draft cues, staff utilization, and accessible non-drag controls.

**Gate:** the board displays the same assignments, dates, people, contextual production bands, PTO state, filters, and publication state as the MUI view.

### 3. Controlled mutation integration

- Connect create/edit/delete gestures and non-drag form actions to the existing `saveScheduleEvent` and `deleteScheduleEvent` actions.
- Treat Bryntum optimistic changes as provisional. On a rejected action, revert the UI to server-backed data, display the safe server message, and refresh the route. Do not trust client conflict detection as authoritative.
- Keep the existing modal/editor as the complete fallback and mobile path; desktop drag/drop is an accelerator, never the only way to create or change work.
- Retain PTO, employee-availability, capacity-settings, and publication actions outside the widget or wire them through the same existing server boundary.

**Gate:** permission denial, stale revision, assignment conflict, PTO conflict, and unavailable employee responses leave no incorrect client-side schedule.

### 4. Replace MUI and remove its scheduler dependency

- Replace `EventCalendar` use in `src/components/scheduling/scheduler.tsx` with the Bryntum composition, preserving the component’s public props initially.
- Remove MUI Scheduler-specific event/resource types, locale/theme setup, and styles that no longer apply. Keep unrelated MUI dependencies only if another feature still uses them.
- Remove `@mui/x-scheduler` only after a repository search confirms it has no remaining imports. Do not remove `@mui/material`, Emotion, or date-fns solely because the scheduler migration is complete.

**Gate:** no `@mui/x-scheduler` import remains; the page has no visual or interaction regression in desktop or narrow/mobile layouts.

## Test and review plan

- Add adapter unit tests for all-day/end-date conversion, multi-resource assignments, localized labels, production ranges, PTO visibility boundaries, and draft/published indicators.
- Retain and run existing scheduling domain, action, and database tests: `tests/scheduling-domain.test.ts`, `tests/scheduling-actions.test.ts`, and `tests/scheduling-database.test.ts`.
- Add browser coverage for loading the schedule, filtering, accessible create/edit fallback, desktop move/resize if enabled, rejected conflict/PTO mutations reverting visibly, publication, and Spanish rendering.
- Run `npm run lint`, `npm run typecheck`, targeted Vitest suites, required Playwright coverage, and `npm run build`. Independently review the completed vendor swap for SSR, client/server data-boundary, private-PTO, localization, accessibility, and permission regressions.

## Risks and explicit decisions

- **License/registry:** installation cannot start until a valid licensed registry login is available. Never commit registry credentials or an unpacked vendor distribution.
- **React 19:** prove wrapper compatibility before migrating writable flows.
- **Vendor model mismatch:** Bryntum stores are UI state only. The existing service/action/RPC layer remains the source of truth.
- **Data integrity:** database conflict, PTO, availability, facility scope, revision, audit, and publish controls remain unchanged and authoritative.
- **Performance:** start with regular packages. Reconsider thin only after a production bundle measurement shows a material need or a second Bryntum product is introduced.

## Suggested implementation handoff

> Implement `Code/docs/bryntum-schedulerpro-migration-build-plan.md` in the `Code` application. Use regular, licensed Scheduler Pro 7.3.7 packages—not thin. Preserve server actions, domain validation, database RPCs, and all existing scheduling behavior. Begin with the Next.js/React 19 read-only client-only compatibility gate, then migrate controlled mutations, test, and remove only `@mui/x-scheduler` after proven parity.
