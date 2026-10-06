# Work planning and execution build plan

Status: approved architecture and implementation plan; delivery, migration,
merge, and deployment remain separately authorized.

Current local handoff, 2026-10-05: Phase 1 functionality passed independent source
review, 35 native PostgreSQL concurrency tests, eight Work Plan browser scenarios
across desktop and 390px phone, and `npm run check` (974 tests plus production
build). After the owner requested stronger visual quality, the focused-directory
and editor redesign passed independent source/visual review and eight refreshed
desktop/phone browser scenarios, including search, keyboard recovery, and denied
retirement. The post-redesign `npm run check` passed formatting, lint, types,
all 974 tests, and the production build. Visual acceptance remains with the
owner; it is not inferred from functional tests. Phase 2 remains Applied Plans
and Work Packages, including
manager-selected optional steps. No merge, hosted migration or production
deployment has occurred.

## Purpose

Separate reusable operational workflow definitions from demand planning,
scheduling, floor execution, and immutable traceability evidence. The model must
serve Salad Soulmates' prep, mixing, quality, packaging, and recall workflows
without baking food-specific terminology or one plant's cadence into the product.

This plan supersedes the narrow assumption that each preparation execution is
pre-paired with one mixer batch. A preparation is an independently traceable
physical output. Its quantity-bearing connection to a mixing batch is made only
when the worker selects or scans it during actual mixing. The existing
`production_batch_preparation_allocations` boundary remains the basis for that
connection.

## Vocabulary and ownership

| Record                              | Class                    | Owns                                                                                                                        | Does not own                                                           |
| ----------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Work Plan                           | Master data              | Versioned workflow steps, dependencies, task/checklist templates, qualifications, inputs/outputs, and materialization rules | Dates, quantities, workers, orders, or operational status              |
| Work Plan Step                      | Master data              | A typed step and its predecessor/successor graph                                                                            | A physical unit of work                                                |
| Applied Plan                        | Transactional planning   | One frozen use of a Work Plan for demand/order/product context                                                              | Calendar lifecycle or actual execution evidence                        |
| Work Package                        | Transactional planning   | Scheduled quantity/capacity for an Applied Plan step, such as “mix 12 Ranch charges Tuesday”                                | A physical batch, actual operator, or source genealogy                 |
| Work Order                          | Transactional operations | A specific accountable physical output, such as one prep bucket or mixer charge                                             | Recipe/equipment/input/quality facts that belong to execution evidence |
| Work Task                           | Transactional operations | Assignable work within a Work Order, such as measure, mix, or QA verification                                               | A replacement for the Work Order's output identity                     |
| Execution event / production record | Immutable evidence       | Actual people, timestamps, equipment, inputs, quantities, yields, quality decisions, allocations, and corrections           | Mutable planning status                                                |
| Schedule event                      | Projection               | Calendar rendering of a Work Package or Work Order                                                                          | A second lifecycle or direct traceability evidence                     |

The existing `workforce_work_queue_items` remains the canonical Work Order
store. The implementation extends it and its claims/dependencies rather than
introducing a parallel queue. A Work Order is the smallest traceable physical
outcome; a Work Task is the smallest independently assignable/completable step.

## Workflow behavior

### Approved interaction: workflow shell to generated production schedule

Work Plans are maintained once in Settings, not configured from the Gantt or
recreated for each production run. The owner's reference shell is Intake,
Purchasing, Receiving, Prep, Mixing (Pre-Op, Mixing, Post-Op), Packaging,
Loading, and Maintenance. It is a configurable starting model, not a mandatory
linear chain or a requirement to generate every stage for every order.

The priority is to generate the appropriate prep, mixing, and packaging work
across production days from demand and a released workflow. Reuse the existing
production-proposal flow and scheduling board. A planner supplies product/demand,
quantity, and production/due-date context, reviews the generated proposal, and
adjusts its events directly in the Gantt. Creating production work from the
Gantt creates its underlying Applied Plan and Work Packages automatically;
there is no separate package-setup prerequisite. Those records support integrity
and execution behind the interface rather than adding another planning chore.

Timing comes from configured step dependencies/offsets, plant calendars,
capacity, recipe yield, and packaging configuration. Do not impose a universal
prep-day-before or packaging-day-after rule. Pre-Op, Mixing, and Post-Op are
separate Work Orders with their own planner commitments and dependency records.
Map system-triggered intake, purchasing, receiving,
loading, and maintenance to their existing canonical records before enabling
generation. Missing trigger mappings must not silently create duplicate work.
Maintenance may be parallel or equipment-driven rather than part of every run.

Generation proposes planned work only. It does not manufacture completed prep,
available inventory, batch genealogy, or execution evidence. Preserve explicit
manager selections for optional steps and actual approved, compatible,
unconsumed prep quantity as the mixing readiness gate.

1. An authorized plant administrator maintains reusable Work Plans. A plan can
   contain ordered, parallel, and conditional steps through a directed acyclic
   dependency graph. It has no dates or quantities. For the first version,
   conditional means a manager explicitly chooses optional steps when creating
   an Applied Plan; it does not mean automatically evaluated product rules.
2. Demand from customer orders, forecasts, or another supported source creates
   an Applied Plan that snapshots the selected Work Plan version.
3. A planner schedules Work Packages. They create aggregate commitments such as
   prep quantity/bucket estimate and mixing batch count; they never create,
   assign, edit, or complete individual physical batches from the planner page.
4. The plant app materializes a Work Order only when work needs an accountable
   physical unit: a worker starts/claims it, a lead explicitly reserves it, or
   a bulk operational action affects it. The operation is atomic and assigns a
   non-reused sequence within the applicable package.
5. Each Work Order contains Work Tasks from its Plan Step template. Task
   assignment, completion, attestation, exceptions, and verifier identity are
   recorded independently from the Work Order's aggregate state. Work Tasks are
   not Gantt-scheduled: the Gantt schedules aggregate commitments only.
6. A prep Work Order creates a Preparation Execution and physical prep-container
   identity. A mixing Work Order creates/links a Production Batch. At mixing,
   selecting one or more approved prep outputs creates quantity-bearing
   allocations. The system never infers allocation merely from date, count, or
   matching product.
7. A bulk action may create or update multiple Work Orders in one transaction,
   while preserving one Work Order and one execution record per physical unit.
   Shared defaults may be applied only to facts that are true for every selected
   unit; per-unit exceptions remain explicit.

### Material readiness and preparation consumption

Preparation output is a consumable, independently traceable supply for mixing;
it is not merely a predecessor checkbox. A Work Package that commits to a
mixing quantity must declare its required preparation quantity in the applicable
canonical unit. The planning/read model must separately report planned mixing
quantity, required preparation quantity, approved eligible preparation quantity,
quantity allocated to mixing, quantity consumed, and the remaining shortfall.

A preparation output contributes to available material readiness only when it
is approved, compatible with the selected recipe/process, within its allowed
use window, and neither held, voided, nor fully allocated. Its available
quantity is its approved yield less all quantity-bearing allocations to mixing
that have been committed by the execution workflow. Allocating prep output to a
mixing batch atomically reduces its remaining available quantity; a retry or
concurrent allocation must never over-consume it.

Mixing may begin only when the actual selected preparation outputs cover the
mixer's required preparation quantity. The system may express readiness as
`10 of 12 mixer charges ready` when each eligible prep output represents one
charge, but quantity—not bucket count—is authoritative. One prep container may
feed several mixing batches and one mixing batch may consume several prep
containers only where the process profile allows it; every allocation records
the actual container, amount, unit, worker, and time. The planner may see the
shortfall and readiness projection but cannot create inferred allocations or
override this execution gate.

## Information architecture and navigation

### Master data: Settings → Operations → Work plans

Work Plans are configuration, not planning transactions. The Work Plans
directory and detail/version editor belong under **Settings**, in an Operations
configuration group, with `settings.manage` plus an explicit operations-plan
permission when the permission model is expanded. It supports draft, review,
release, retirement, version comparison, dependency graph validation, and
referenced-record read-only protection. Product/recipe pages may link to a
compatible released plan, but must not become the general plan-template editor.

Related master data remains in its current home: products/recipes and process
profiles under **Products & recipes**; equipment under the future Operations
configuration area; employees/qualifications under **Production & team**. The
work-plan editor links to these records by stable ID and snapshots relevant
versions during application; it never copies editable master data into a plan.

### Transactional planning: Production Planning and scheduling

The existing `/app/planning` production-planning hub remains an entry point for
order/forecast demand and generated proposals. The existing **Production
Planning** schedule at `/app/scheduling` remains the calendar/timeline and
publish surface for generated production commitments, and also supports direct
creation without prior package setup. Underlying Applied Plans and Work Packages
are created automatically in the same authorized use case. Contextual details
show aggregate demand, scheduled windows, capacity,
dependencies, publication, generation state, staffing gaps, and read-only batch
and prep progress after execution begins. A planner has no batch-level
completion or correction controls.

The planner calendar defaults to visible aggregate production commitments:
generated prep, mixing, and packaging events are the primary planning surface.
Individual Work Order detail remains hidden by default and read-only when shown.
Work Tasks are operational execution detail and are not displayed or managed as
Gantt bars. Authorized planners can inspect materialized operational
work in the same time context. Layer choices are presentation-only, URL-backed
where they are useful to share/return to, and do not alter schedule, work-order,
assignment, or execution state. Visible Work Orders are read-only from the
planner surface; contextual links open the permitted operational detail flow.

Operations supervisors also receive a permissioned Work Order directory/detail
surface under Production & team, reached from a package, schedule card, or
dashboard drill-in rather than a competing top-level planning workflow. It is
the place to inspect, hold, reassign, or correct an operational Work Order
within policy; worker task actions remain on the worker/mobile surface.

### Floor execution: Dashboard and worker mobile

The Dashboard remains the daily production-floor view. It shows current Work
Packages, status rollups, staffing gaps, and drill-ins to affected Work Orders.
The worker mobile experience remains **My Work**: users see only eligible
Work Tasks and their current Work Orders, not template management or planner
configuration. It supports single and bulk start/complete/hold/reassign actions
under the plant assignment policy, with explicit confirmation and actionable
failure recovery.

### Traceability: Traceability workspace

The existing **Traceability** destination remains the authoritative search and
recall workspace. It gains links from finished recall lot, production batch,
prep-container identifier, source package/lot, Work Order, equipment, and
operator evidence. It labels planned, unavailable, and incomplete history
clearly; a result is not represented as a complete recall chain until every
required allocation and downstream genealogy boundary is present.

All new directories follow the existing URL-backed filter/sort/pagination,
return-context, permission, bilingual, empty/loading/error, keyboard, and
narrow-screen contracts in `ui-ux-overhaul-build-plan.md`.

| User need                                       | Home                                          | Record class                   |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------ |
| Define or version a reusable workflow           | Settings → Operations → Work Plans            | Master data                    |
| Turn demand into a concrete workflow            | `/app/planning`                               | Transactional planning         |
| Schedule, publish, and rebalance aggregate work | `/app/scheduling`                             | Transactional planning         |
| Manage a specific active/held Work Order        | Production & team Work Order detail/directory | Transactional operations       |
| Perform assigned/claimable tasks                | `/worker` and its linked task flow            | Transactional execution        |
| Investigate genealogy or recall scope           | `/app/traceability`                           | Read-only operational evidence |

## Data and service boundaries

Additive schema work introduces, subject to detailed design review:

- `work_plans`, immutable released `work_plan_versions`, `work_plan_steps`, and
  `work_plan_step_dependencies` with no cycles;
- typed task/checklist templates and step materialization policy;
- `applied_work_plans` and `work_packages`, each scoped to organization and
  facility and able to link to permitted demand contexts;
- Work Package links on the canonical Work Order store, plus Work Order task,
  task-assignment, and append-only execution-event records;
- explicit prep-container identity and the existing/allocation-capable
  preparation-to-production-batch relationship; and
- read models for scheduler, dashboard, worker queue, and traceability.

Presentation invokes services; services own state transitions, dependency gates,
authorization, revision/idempotency and bulk orchestration; data modules own
RLS-protected queries and RPC persistence. Direct client persistence, mutable
released history, and planner-page writes to physical execution records are not
allowed.

## Delivery phases

### Phase 0 — decisions and characterization — in progress

Document the final lifecycle diagrams and state machines. Confirm which steps
materialize Work Orders versus only Work Tasks, permitted dependency types,
assignment policy, signature/verification rules, prep-container labeling,
allowed preparation-to-mix patterns, holding/void/correction policy, and
packaging/tank boundaries. Characterize current work-order, scheduler, worker,
production-batch, and traceability behavior before changes.

Checkpoint, 2026-10-05: the generic Work Plan / Applied Plan / Work Package /
Work Order boundary is recorded in `decisions.md`. Preparation output is
confirmed as quantity-bearing, approved, eligible consumable capacity for
mixing—not only a workflow predecessor. A 12-charge mixing commitment with
only 10 charge-equivalents of eligible preparation reports a two-charge
shortfall and cannot start unsupported mixing work. Remaining Phase 0 policy
items include the final assignment/signature, prep-container label, hold/void,
and packaging/tank rules; they must be settled before later execution phases.

### Phase 1 — versioned Work Plan master data — implemented locally

Implement the master-data model, validation, permissions, audit, versioning,
dependency-cycle rejection, and Settings → Operations → Work Plans management
surface. A released version is immutable; only new versions may change steps or
dependencies. Add links from applicable product/recipe/process configuration
without coupling the model to food-specific names.

The following checkpoints are historical. The current local handoff above and
final verification checkpoint below supersede their previously open local gates;
they do not waive merge, production rollout or later-phase policy approvals.

Checkpoint, 2026-10-05 (local, unmerged, not deployed):

- Added the additive `20261005120000_work_plan_master_data.sql` migration for
  facility-scoped Work Plans, versions, steps, dependencies, explicit
  permission, audit events, immutable released history, draft creation,
  revision-checked draft replacement, release, and version-directory reads.
- Added domain, data, and service contracts with server-side authorization and
  optimistic revision handling.
- Added Settings → Operations → Work Plans with an AG Grid directory, draft
  creation, release control, and a draft step editor. All rendered plan and
  step lists use the shared AG Grid component.
- Verified targeted linting, `npm run typecheck`, and the disposable Work Plan
  database suite (four passing tests). The draft-save test found and corrected
  direct JSON step extraction in the database function.

Browser checkpoint, 2026-10-05: the disposable Playwright Work Plans suite now
passes on desktop and 390px phone. It covers draft creation, directory reload,
step addition, dependency persistence, release with editing controls removed,
cloning into a second draft, and comparison visibility. Run with
`npx playwright test --config playwright.work-plans.config.ts`; use the installed
Chrome executable through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when required.
The create RPC was corrected to accept the domain's `key` step field.
Composition controls and an initial comparison are implemented; stale-save,
permission-denial, cycle-recovery, full comparison accuracy, bilingual and
visual verification remain open.

Phase 1 is not complete. The original implementation task was draft composition:
add, remove, reorder, and visually link steps while preserving dependency edges;
then add version comparison, browser coverage at desktop/390px, bilingual copy,
and product/recipe/process configuration links. Do not mark this phase accepted
until those checks and an independent review are complete.

Editor hardening checkpoint, 2026-10-05 (local, not deployed): draft reads and
saves preserve task instructions; newly added step keys avoid collisions after
deletion; controlled fields retain edits when reordered. Comparison uses the
latest preceding release and detects instruction/order changes, with its step
change list rendered through AG Grid. Release is disabled for unsaved name,
step, or dependency changes; successful saves clear local overrides while failed
saves retain them. Typecheck and focused lint passed. Four database tests passed,
including instruction read-back. The expanded browser checks passed on desktop
and 390px phone in a clean rerun after an initial login/startup timeout. This is
not a Phase 1 acceptance.

Integration checkpoint, 2026-10-05 (local, uncommitted, no production changes):

- Directory reads now follow presentation → service → data, with permissions
  and runtime response validation in the service/domain. Clone failures are
  safely logged/handled, and duplicate codes receive actionable feedback.
- Dependency and comparison collections use AG Grid. Instructions have explicit
  label associations; editing is disabled during mutations. Released versions
  expose read-only step/instruction/dependency evidence. English/Spanish static
  copy and feedback preserve owner-entered data. Products and Recipes provide
  bilingual links gated by both Work Plan management permissions.
- Database constraints reject malformed task templates and cross-version
  dependency endpoints; immutable guards check both old and new parent versions.
  Cycle checks use bounded distinct reachability rather than enumerating paths.
  Clone requests serialize on the plan, recover an existing mutable draft, and
  audit new versions. Recovery is not durable operation-token idempotency:
  retrying after another actor releases the recovered draft can create the next
  version. Do not extend this pattern to execution/inventory writes.
- Independent Reviewer (GPT-6.1 Sol / Extra High) verified malformed-input
  rejection, isolation, immutable history, clone recovery/audit, and branched-DAG
  performance; no remaining high-priority authorized-path defect was found.
- Final focused command covering copy/domain/services/master-data database and
  preview/bootstrap permissions passed 39 tests across six files. Work Plan
  Playwright checks passed four tests (English recovery and Spanish creation on
  desktop/390px), including instruction reload, cycle correction, and no captured
  page errors. TypeScript, focused lint, and a production build passed; the
  phone screenshot was visually inspected.
- `npm run check` stopped at formatting. Generated `.next-scheduling-test`
  output is now excluded like `.next`; six unrelated formatting failures remain.
  The full automated suite initially reported 915 passing, 17 failing and five
  skipped tests. Two permission-fixture failures caused by this feature were
  corrected and verified separately; the full suite has not been rerun afterward.
  Other failures concern sample data, dashboard fixtures, production execution,
  generated planner work, navigation, and copilot inventory setup. Full lint
  initially exhausted memory scanning generated output; its clean-source rerun
  completed and reported 520 errors across the repository. Focused changed-file
  lint passed. Final direct TypeScript checking passed. No tests or source checks
  were weakened. `npm ci` was not run during this shared dirty-worktree session.
- Three real PostgreSQL race tests were added to the existing disposable runner
  for save/save, save/release and clone/clone overlap. They remain unrun: no
  server responds on localhost:55432 and Docker/psql are unavailable on PATH.
  Provision a disposable local PostgreSQL instance before claiming concurrency
  acceptance. Never use the shared hosted database for these tests.

Phase 1 remains in progress: complete real concurrency verification, durable
retry/lifecycle requirements as needed, stale/permission UI recovery coverage,
and the required integrated check. Phase 0 assignment/signature, container-label,
hold/void/correction and tank/packaging decisions remain gates for later phases.

Native concurrency checkpoint, 2026-10-05: with owner authorization, the cached
`postgres:17.11` image ran in a separate disposable container with temporary
PGDATA, synthetic credentials and a loopback-only port. The existing application
Supabase stack was not modified. Windows reserves ports 55388–55487, so binding
the runner's default 55432 failed; `SS_TEST_POSTGRES_PORT=54329` provided a
validated override without allowing a remote host or inherited database URL.
Nine target/safeguard tests passed. `npm run test:postgres` then passed all 33
native multi-session tests, including save/save, save/release and clone/clone
Work Plan races with observed lock overlap. The test database and container were
removed afterward; no application/hosted operating data was changed. This
resolves the missing-native-PostgreSQL gate, not the outstanding full-project
check, lifecycle/retry scope or Phase 0 product-policy gates.

Lifecycle/recovery checkpoint, 2026-10-05 (local, unmerged, not deployed):

- Added audited, revision-checked draft → review and review → draft transitions.
  Review definitions are read-only; return to draft before changing content.
  Draft/review can release, and released → retired changes lifecycle metadata
  only. Retired versions preserve their original release identity, timestamp,
  instructions, steps and dependencies; they cannot return to a mutable state.
- Clone operations now require a stable request UUID and persist private,
  tenant/facility/actor-scoped receipts. A retry returns the original version
  even after it has been released. The browser retains a pending token across
  reloads and clears it only after a confirmed successful response.
- Added lifecycle/retry, permission/isolation, stale-save recovery and bilingual
  copy regressions. Final integrated and browser evidence will be recorded below
  after the coordinated verification run. Assignment/signature and execution
  policies have not been inferred or enabled by this increment.
- The owner approved manager-selected optional steps. Phase 1 stores a typed,
  default-required optional marker in versioned step templates; save/read/clone,
  comparison and bilingual views preserve it. Actual selection, applied
  snapshots and dependency validation remain Phase 2 work, not execution rules.

### Phase 2 — Applied Plans and Work Packages

Deliver demand-driven, Gantt-first generation of prep, mixing, and packaging
across production days. Create demand-linked Applied Plans and Work Packages
behind that workflow, without a separate setup wizard or template editing in the
Gantt. Reuse the existing proposal/confirmation flow and avoid a competing
planning interface with the scheduling-board implementation. Reuse the
existing scheduling projection, capacity checks, publication, assignments, and
dependency graph where they fit; migrate only after behavioral parity is
demonstrated. The planner can revise unstarted aggregate work, but cannot reduce
counts below materialized/started/completed units or mutate historical facts.
Generation must be idempotent and revision-aware: retries or demand/date changes
must not duplicate commitments, erase planner adjustments without review, or
rewrite started execution. Validate multi-day offsets/calendars, capacity and
dependency constraints, recipe/yield and packaging quantities, trigger ownership,
and preview-to-confirmation changes before publication.
Snapshot the manager's optional-step selections with the applied version and
validate the resulting dependency graph. The template's optional marker alone
does not skip work or authorize omission of a required predecessor. Define and
verify dependency handling before enabling optional selections; no automatic
product/process conditions are part of this increment.

### Phase 3 — Work Orders, tasks, and plant mobile execution

Extend the canonical Work Order store with Work Package context and implement
lazy single/bulk materialization, non-reused sequence reservation, task
assignment/attestation, and state transitions. Implement separate prep-bucket
and mixer-batch work-order flows. Worker bulk actions must be transactional,
idempotent, revision-checked, and present per-unit exceptions before commit.

### Phase 4 — allocation, genealogy, and operational controls

Require actual prep-output selection/allocation when mixing, enforce quantity
reconciliation and compatible product/recipe/process rules, and connect batch
operators/equipment/quality facts to the immutable execution record. Add hold,
void/correction, and release gates. Do not infer genealogy from planned work.

### Phase 5 — traceability, packaging integration, and rollout

Extend backward/forward trace views and recall exports. Integrate released
outputs with holding-tank, packaging, and shipment genealogy only after their
own verified execution boundaries are available. Run a facility floor
simulation, migration preflight, staged rollout, and mock recall before any
production release.

## Migration and compatibility

Use additive migrations and compatibility read models. Do not fabricate Work
Orders, worker identities, prep-container IDs, allocations, equipment, yields,
or source genealogy for historical planned/legacy records. Existing work orders
remain readable and linked to a documented legacy model until migrated under an
explicit, reviewed mapping. Records with insufficient evidence are marked
historical/incomplete, never traceable by implication. Run preflight counts and
foreign-key/RLS/permission checks before enabling any new write path.

## Acceptance and verification

- A template can define sequential, parallel, and conditional steps; released
  versions cannot be edited or made cyclic.
- A planner creates production work directly from the Gantt or demand proposal,
  without configuring a template or setting up packages for each run. The system
  generates the required multi-day prep, mixing, and packaging commitments and
  their underlying applied snapshot/aggregate records without duplicate work.
- A planner creates only aggregate commitments, including a
  12-batch mixing commitment, and cannot manage individual batches from the
  planner workflow.
- The planner calendar defaults with aggregate production events visible and
  individual Work Orders hidden; optional detail persists through an appropriate shared
  URL/return context, and exposes no execution mutation controls.
- Two workers can concurrently request the next available batch; exactly one
  receives each sequence and no package count is over-consumed.
- A worker can bulk-complete eligible units, with one atomic action, individual
  Work Orders/executions, consistent shared facts, and explicit exceptions.
- A prep bucket can remain unallocated, feed several mixing batches, and a
  mixing batch can consume several prep buckets only where facility rules allow;
  quantities reconcile and incompatible inputs are rejected.
- A commitment for 12 mixer charges with eligible prep capacity for only 10
  reports a two-charge-equivalent shortfall and permits no more than the
  quantity-supported work to start. Concurrent or retried allocations cannot
  consume more approved prep quantity than is available.
- Finished output traces backward to source package/lot, prep output,
  operator, equipment, and mixing batch; forward tracing preserves recall-lot,
  package, and shipment scope as those modules are enabled.
- Tenant/facility isolation, role denial, stale revision, duplicate/lost-response
  retry, conflicting bulk action, hold/release, void/correction, and immutable
  history behavior are covered in disposable PostgreSQL tests.
- Planner desktop, dashboard, worker phone at 390px, keyboard, Spanish/English,
  return context, loading/error/empty, and permission-denied flows have focused
  browser coverage. `npm run check`, targeted database tests, and independent
  review pass before release.

## Explicit non-goals

This plan does not authorize production deployment, automatic reassignment,
rework, generic global search, inferred genealogy, unrestricted split/merge
transformations, customer-facing recall narrowing, or changes to immutable
inventory, finished-lot, RLS, or authorization safeguards. Each requires a
separately approved policy and implementation increment.
