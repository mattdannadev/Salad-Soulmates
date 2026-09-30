# Worker scheduling — implementation contract

The Scheduler and Operations Manager are organization access profiles with `workforce.read` and `workforce.manage`. The existing Administrator profile already has both permissions. The calendar is scoped to the signed-in user's facility; cross-facility scheduling requires switching to a separately assigned facility profile. Other roles with `workforce.read` may view the schedule. The Scheduler profile uses the application's administrative shell but receives only workforce permissions.

Assignments are all day in this release. `start_on` is inclusive and `end_on` is exclusive. A single event can name several active employees in the same facility or remain unassigned. Categories are mixing, spices, making product, cleaning, off, and other (including warehouse work). Approved PTO is a separate private record. Production plan intervals are shown as contextual background bands. Work can link to a plan, planned mixer batch, its single spice preparation, or a production lot. These links are validated against the facility and parent plan. Production `finish_on` is inclusive and must be advanced one day for calendar display. Assigned work overlaps are blocked in the database.

The calendar uses the free, MIT-licensed MUI X Scheduler Community package. It is currently a beta dependency; it is isolated in the scheduler presentation component so the facility-scoped service and database contract do not depend on that vendor API. No paid scheduler, resource-lane license, or hosted calendar service is used.

The `facilities` table carries `weekly_capacity_hours`, initially 40, and a `schedule_granularity` field initially `day`. The hour value is reserved for the later timed scheduling mode; this release writes only full-day events. For all-day utilization, one scheduled workday counts as `weekly_capacity_hours / 5` hours. Off days count toward PTO day totals but add no scheduled work hours. Reports should count distinct employee days in each category for a selected range and bucket by facility-local calendar week. These are planning estimates, not payroll hours.

All writes use facility-scoped transactional database functions with revision checks and a facility lock that serializes concurrent changes. Deletion is physical in the editable draft, while the prior publication remains visible to workers until the next publish. The before snapshot remains in `workforce_schedule_history`; creates and edits also record snapshots, actor, and time. Publication, PTO and availability changes are audited. Schedule history can be read only with `audit.read`. Facility capacity changes use `settings.manage` and write to the existing audit log.

The manager edits a facility draft and publishes an immutable numbered snapshot. Workers see only their own assignments in the latest published revision through `get_my_workforce_schedule`. Private PTO notes never enter that response. Approved full-day, date-range and partial-day PTO blocks assignment saving and publishing, and PTO approval is blocked until conflicting draft or published work is reassigned or cancelled. Since work is all day, a shared date conflicts with any partial-day PTO. Weekly available days are recorded per employee; out-of-availability scheduling requires an override reason. The admin phone layout prioritizes lists and forms without requiring drag and drop.

## Approved next slice: plant configuration and worker-claimed queue

### Product-driven labor standards

The scheduler does not independently decide the normal crew requirement or effort for
product-specific production work. Each product will own configurable planning estimates
for ingredient prep and mixing: workers required per batch and estimated minutes per
batch. When a production plan is turned into daily scheduled work, the planner uses
the product standard multiplied by the planned batch count. A two-person, 90-minute
mix therefore creates one mixing task with two claimable crew slots and 180 planned
crew-minutes. Mixing minutes are summed against the plant's configured productive
mixing window—six hours per day for the Salad Soulmates reference—to flag work that
will not reasonably fit. These are capacity estimates, not employee performance
targets or a hard block on an authorized schedule change. Scheduler overrides remain
possible only with a visible reason; they do not alter the product standard.

### Demand, batch quota, and daily capacity

The customer order is the starting point, not a free-form batch count. The planner
keeps the customer-ordered cases, converts them through the selected packaging to
finished-goods volume (the Salad Soulmates reference is `cases × 4 bags/case × 1
gallon/bag`), and divides by the released recipe's target yield to obtain the
order's mixer-batch quota. The configured rounding/yield rule is visible.

Ingredient prep is a quota-bearing task: each prep task declares how many of those
mixer batches it prepares. Mixing tasks do the same. Across the plan, the scheduled
batch quantities must reconcile to the order quota. The planner may distribute them
across days; each day's mixing load is `product mixing minutes/batch × batches that
day`, compared with that date's effective productive mixing window. The plant's
configured six-hour reference is only a default: a dated, reasoned override can
extend or reduce capacity for a particular production day. Crew size is a separate
staffing requirement for the task, not a multiplier of the physical mixer time.

### Final demo acceptance scenario

The completed slice will seed a two-week-out customer order for **Jason's**: 270
cases of **Leo's Italian**. The configured package is four one-gallon bags per
case, so the demand is 1,080 gallons. With a 40-gallon released-recipe yield, the
derived quota is exactly 27 mixer batches (10 cases per batch). Jason's customer
price will be configured at $78 per case for a $21,060 order total. The schedule
must distribute the 27-batch prep and mixing quota over dates using effective
daily mixing capacity, rather than assuming a single fixed 360-minute day.

A senior scheduler/manager creates daily draft tasks from the order-driven
production schedule and may add supporting work, then explicitly publishes the
day's queue. The existing supervisor-assigned schedule remains intact. The next
slice adds this separate daily queue, configured per plant as **supervisor
assigned**, **worker claimed**, or **hybrid**. Only a published queue item may be
claimed. In a worker-claimed or hybrid plant, an active worker may atomically
claim an available queue item; a supervisor-assigned plant instead names workers
based on availability and rejects worker claims. At the Salad Soulmates reference
plant, the senior scheduler creates and publishes the daily plan while workers
self-assign by claiming tasks. Claiming records the actor, time, policy, revision
and immutable before/after history, and it is not physical completion of
receiving, loading, ingredient prep, mixing, packaging or cleaning.

Every queue task has a required crew size and can retain more than one worker
claim or supervisor assignment. Scheduler gap reporting must show required versus
claimed/assigned workers and unfilled worker slots by task and work type, not
merely whether a task has its first worker.

Daily queue work belongs to the linked order-to-pickup plan. Scheduler views must
show the related requested pickup date and planned production/packaging dates
beside queue staffing gaps, making an at-risk order visible before its pickup
date rather than treating a daily task list as an isolated workflow.

## Consolidated scheduler UI contract

The scheduler is one compact plant-operations command center, not a collection
of stacked dashboards. Its calendar/timeline is the primary surface: customer
pickup commitments, expected/received PO deliveries, production and packaging
milestones, and daily tasks appear on their relevant dates. Selecting a day or
task opens a contextual side panel/drawer for task detail, crew requirement,
named assignment or worker claims, publication state and the linked operational
workflow. Do not append independent full-width queues, pickup panels or staffing
reports below the calendar.

Task cards use terse status and crew indicators (for example, `1/2 claimed`).
Draft, published-unclaimed/understaffed, claimed and complete states must be
recognizable at a glance; pickup risk and staffing gaps have visual priority,
while routine completed work recedes. Creation/editing uses one contextual task
editor, and both supervisor assignment and worker claims are shown on the same
task card.

The default planning view is the **plant workweek**: a compact row of daily
calendars for the configured workweek, rather than a generic seven-day month or
personal-calendar view. Each day displays its planned work hours against that
plant's configured productive capacity, broken down by the scheduled tasks and
their expected durations. The weekly view makes the preparatory day, mixing day,
hold/cooling time, packaging day, PO deliveries and pickup commitment legible as
one connected plan. Day view is a focused drill-in; it does not replace the
workweek as the planning default.

Queue work types are Pre-Op, Post-Op, receiving outstanding purchase-order
deliveries, loading for shipment, ingredient prep/batch prep, mixing, packaging,
cleaning and other work. Ingredient prep replaces “spice prep” in new
worker-facing language because it can include dry and wet ingredients. Scheduler
data includes draft, published-unclaimed, claimed and completed counts plus an
unclaimed-by-work-type view, so acceptance gaps are explicit. The plant
configuration also defines planning cadence, prep lead time, productive mixing
hours, make-ahead policy/horizon, packaging lead time, cases per pallet, and
cycle-count cadence/scope. The Salad Soulmates defaults are only defaults: Friday
weekly planning, one-day prep lead, six productive mixing hours, one-day packaging
lead, 45 cases per pallet, and a weekly raw-ingredient count.

The queue orchestrates work; it is not a second transaction system. A receiving
item opens **Receiving Inventory** in the linked outstanding PO/delivery context;
ingredient prep opens the linked Batch Worksheet/ingredient-preparation flow;
mixing opens the mixer batch; packaging opens the packaging run; and shipment
loading opens the fulfillment/shipping record. Pre-Op and Post-Op remain tied to
the applicable plant or production context. A claim never posts inventory or
completion; only the linked workflow can do that. The UI must reject a task with
an incompatible or inaccessible context rather than falling back to a generic
checklist.

The desktop scheduler labels **Calendar view** controls separately from **Schedule work** actions. Facility, day/week and work-type controls filter the displayed calendar only. The Staffing panel ranks people by utilization for the active calendar window; selecting people focuses the calendar and pre-fills a new assignment. A manager creates work by clicking an empty calendar day or using **New assignment**. Drag/drop may accelerate desktop editing, but it is never the sole creation method or required instruction. Calendar cards expose the work type plus available note, product, customer or location context.

Permissions and data rules live in `supabase/migrations/20260927210000_worker_scheduler.sql` and additive `20260927223514_workforce_schedule_publication.sql`. The second migration must follow the first. Worker task details display the exact published assignment and linked identifiers. Physical production execution is a separate workflow; calendar actions never post inventory or mark production complete.
