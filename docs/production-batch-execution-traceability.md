# Production-batch execution and traceability

Status: approved architecture plan; implementation and release remain separate.

## Purpose

Make a physical production batch the durable record that joins order planning,
ingredient preparation, source-material genealogy, yield, quality, finished
product, and recall scope. This plan supersedes the execution semantics of the
current batch worksheet; it does not replace order planning, receiving, or
packaging configuration.

## Product decisions

- A **planned batch** is demand and capacity planning only. It posts no
  inventory and is not proof that product was made.
- A **production batch** is one actual mixer charge. Salad Soulmates v1 enforces
  one planned batch to one production batch.
- A **preparation execution** serves one production batch by default. The data
  contract is allocation-capable for future plants, but the initial worker flow
  offers no extra allocation choices.
- A production batch gets an immutable UUID and a readable internal run code
  (product + local production date + non-reused sequence). Neither substitutes
  for a customer-facing finished/recall lot.
- A **finished recall lot** is the initial recall scope: facility + product +
  facility-local production date. All qualifying batches made for that product
  on that day contribute quantity to that lot. A recalled batch expands to its
  entire finished recall lot unless later evidence supports a narrower policy.
- Rework is not enabled in v1. Hold, reject/waste, and corrective notes are
  supported; future rework must be an explicit, quality-authorized material
  input that retains all ancestry.

## Canonical records

`planned_mixer_batches` remains immutable order planning. Add these execution
records rather than overloading it or `production_lots`:

1. `production_batches`: planned-batch link, product/recipe snapshots, readable
   run code, actual dates/times, equipment, workers, state, actual yield,
   variance, quality decision, audit revision.
2. `preparation_executions`: preparation status, preparers, actual start/end,
   source-material consumption and exceptions. Retain legacy worksheet evidence
   only as preparation evidence; never infer an actual mixer execution from it.
3. `production_batch_preparation_allocations` and
   `production_batch_material_allocations`: immutable, quantity-bearing input
   genealogy. v1 writes one preparation allocation per batch; direct additions
   retain their serialized package/source-lot origin.
4. `finished_recall_lots` and `production_batch_outputs`: a lot is the recall
   grouping; outputs record each batch's contributed, released, held, rejected,
   or wasted quantity.
5. Later `holding_tank_sessions`, transfers and `packaging_runs` consume only
   released output and create bag/case/pallet/shipment genealogy.

Batch lifecycle: `not_started → in_progress → awaiting_quality → released | on_hold | rejected | cancelled`.
Corrections append evidence; they never rewrite source consumption, run codes or
released genealogy.

## User experience

The schedule opens the planned batch. The worker sees product, short run code,
planned quantity, linked prep status, expected recipe and blockers. They scan or
select actual source packages, record only actual quantities and exceptions,
then record yield and required quality checks. The system displays product,
production date, prep operator, mixer operator, production lot/run code, status,
actual yield and finished recall lot in batch lists and details. UUIDs remain
internal.

## Delivery sequence

Current implementation checkpoint: the reusable operational work record is a
**Work Order** (currently backed by the worker work queue), while the calendar is
only its schedule/assignment projection. A Mixing work order can start multiple
physical production batches; an Ingredient Prep work order can link its actual prep
executions. Starting a batch is the Mixing event: the worker confirms the Mixing
work order, mixer and tank in that action. The system snapshots equipment identity,
display, type and usable capacity; the tank's usable capacity becomes the immutable
expected-yield quantity and unit. Facility/day preferences may prefill that choice,
but never replace the start-time confirmation. Actual yield, waste, output, tank
transfer and packaging remain deferred.

### Phase A — schema and safety contract

- Preflight existing rows; preserve immutable facts and label legacy prep-only
  records rather than fabricating production output.
- Add normalized tables, same-facility foreign keys, RLS, explicit grants,
  invoker RPCs, audit history, idempotency keys, locks and revision checks.
- Replace early lot creation on prep start with atomic creation at actual mix
  start. Refresh generated database types and retire stale read/write paths.

### Phase B — batch and prep execution

- Add start/resume, source capture, prep completion, mix start, yield, quality,
  hold/release, reject/waste and completion services/actions.
- Enforce planned-batch/prep relationship, recipe snapshots, valid UOMs,
  quantity reconciliation and no double inventory consumption.
- Add worker phone and admin batch-timeline views; scheduler links distinguish
  prep from actual mixing.

### Phase C — recall lot and traceability

- Create production-day product recall lots and batch-output allocations.
- Provide batch/date/prepper/run-code filters plus backward and forward trace
  views. Recall output must state its evidence scope and paginate/exhaust all
  matches before claiming completeness.

### Phase D — transfers and packaging

- Add tank sessions/transfers and released-balance reconciliation. A physical
  40-gallon mixer charge transfers into a 200-gallon holding-tank session; the
  session retains every contributing batch as commingled genealogy.
- Add packaging runs, bags, cases, pallets and shipment allocations. Packaging
  consumes a holding-tank session continuously and every output inherits every
  contributing batch/finished-lot ancestry. Product packaging profiles—not
  product names in code—set pouch size (for example, 1 gallon or ½ gallon).

## Required verification

- Two batches of one product on one day share one finished recall lot while
  retaining distinct prep, operator, source and yield evidence.
- A supplier package traces through prep/batch/output to every affected recall
  lot and shipment; a recalled batch expands to all same-lot batches/output.
- Partial prep, hold, waste, retry, stale update, concurrent consumption,
  tenant/facility isolation and unauthorized direct writes are rejected or
  recorded correctly.
- Product-specific charge/yield and packaging snapshots do not assume 40
  gallons. Quantity never crosses incompatible UOMs without an approved rule.
- Disposable PostgreSQL, focused browser phone/desktop flows, `npm run check`,
  independent review, and a mock recall are required before release.

## Explicitly deferred

Quantity-sharing prep across batches, rework, batch-specific customer recall
lots, tank commingling, returns and relabeling require their own approved policy
and acceptance criteria.
