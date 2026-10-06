# Planning Intelligence — build plan

**Status:** approved product direction; implementation, provider enablement,
schema changes, production deployment, and any write capability require the
applicable security and release gates in the [Operations Copilot security-first
plan](operations-copilot-security-first-plan.md).

## Purpose

Planning Intelligence is the planning and scheduling specialist within Salad
Soulmates. It helps an authorized planner turn operational intent into
explainable, feasible draft changes across customer demand, production plans,
material availability, plant capacity, task dependencies, and workforce
availability.

It is not a general chat bot and it is not an autonomous plant scheduler. The
deterministic planning, availability, conflict, authorization, and publication
rules remain the system of record. The agent may propose and, after an explicit
review/confirmation, submit narrowly defined changes through those existing
service/RPC boundaries.

## Product architecture

Build one product-wide agent platform rather than a separate planning-only
provider integration. Shared platform services own identity, active
organization/facility context, entitlements, provider configuration, rate and
cost controls, audit/retention, prompt-data minimization, citations, kill
switches, and proposal confirmation.

Planning Intelligence is one domain skill in that platform. Its tool registry,
permissions, result limits, decision rules, and UI are specific to planning and
scheduling. This prevents a planner prompt from accessing unrelated tenant data
or gaining broad operations-write authority, while permitting later skills such
as document guidance or traceability search to reuse the hardened platform.

## Deterministic boundary

The model can interpret a user objective, request approved tools, compare
already-computed scenarios, and explain tradeoffs. It must not calculate material
requirements, quantities, capacity, conflicts, labor standards, dates, or
feasibility from prose. Those answers come from typed, facility-scoped planning
and scheduling services.

Every response identifies assumptions, source records, data freshness, blocking
constraints, and which part is a recommendation versus a deterministic result.
Missing or stale data must produce an explicit uncertainty/refresh state, never a
plausible invented plan.

## Supported capabilities and staged writes

### Phase 1 — explain and simulate

- Explain why a plan cannot meet a requested pickup date.
- Surface material shortages, capacity overload, dependency issues, PTO,
  staffing gaps, unpublished/unclaimed work, and conflict warnings.
- Produce bounded what-if scenarios using a typed scenario request: move a task,
  alter a permitted draft date, change eligible staffing, or model a configured
  capacity-fill quantity.
- Show deterministic before/after impacts, source links, and a concise
  recommendation. No mutation exists in this phase.

### Phase 2 — draft changes

The agent may create an expiring, reviewable proposal for an authorized user to:

- create or adjust _draft_ production-related tasks;
- move a draft task within permitted planning dates and dependency rules;
- add or remove a worker assignment where availability, PTO, qualifications,
  crew-size, and conflict validation pass;
- produce a draft purchase recommendation or plan-review task from an existing
  deterministic shortage calculation; and
- add the required reason and planner attribution for an override.

A proposal contains normalized inputs, source versions, before/after impact,
affected order/plan/task IDs, required permissions, correlation ID, expiry,
idempotency key, and correction path. It does not mutate persistent operational
records.

### Phase 3 — confirmed application of a proposal

An authorized planner selects the exact proposal and explicitly confirms it in a
review card. The server then reloads organization/facility context, permissions,
record versions, dependencies, inventory/availability, PTO, conflicts, and
publication rules inside the canonical transaction/RPC. It rejects stale or
changed data and asks for a refreshed proposal.

Initial confirmed writes are limited to draft schedules/tasks and assignments.
Publishing a schedule, customer pickup-date changes, purchase-order submission,
production completion, inventory posting, recipe/label approval, and any
food-safety decision remain separate, named confirmations with their existing
authorization and audit contracts. Natural-language assent alone never confirms
a change.

## Skill tools and permissions

The Planning Intelligence skill receives only a request-specific allowlist. It
never receives SQL, table/RPC names, arbitrary filters, client-supplied scope,
or direct database credentials.

| Tool class      | Examples                                                                            | Permission and scope                                                                         |
| --------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Read            | plan feasibility, capacity, staffing, shortages, order due dates, task dependencies | Existing planning/scheduling read permissions; server-owned organization and active facility |
| Scenario        | compare allowed draft alternatives and return deterministic deltas                  | Planning/scheduling read; bounded dates, tasks, and alternatives                             |
| Proposal        | create a typed change proposal only                                                 | Named planning/scheduling proposal permission; affected records remain facility scoped       |
| Confirmed write | apply one reviewed draft-task or assignment proposal                                | Named per-operation write permission plus fresh existing authorization                       |

All tools must cap rows, bytes, time, alternatives, planning horizon, and linked
record count. Every invocation and outcome is appended to dedicated audit and
usage records without raw secret-bearing prompt content by default.

## User experience

Embed Planning Intelligence in the Planning workspace and scheduler command
center, with optional contextual entry from an order or shortage. The primary
output is a scenario/review panel, not a persistent chat transcript. It shows:

1. the objective and active constraints;
2. an evidence-backed summary of blockers and feasible alternatives;
3. a before/after schedule and material/staffing impact;
4. linked source records and data freshness; and
5. an explicit **Review changes** then **Apply changes** flow.

The UI must preserve the existing accessible keyboard/touch alternatives to
drag/drop. It must clearly distinguish draft from published work and never make
an agent-generated recommendation look already committed.

## Proposed prompts

These prompts express objective and preferences; they do not grant authority or
replace confirmation.

- “What could prevent us from completing orders due Wednesday? Show shortages,
  capacity, dependency, and staffing risks.”
- “Can we complete the Rivera order by Tuesday at 2 PM with Maria on approved
  PTO? Give me up to three feasible draft options and explain the tradeoffs.”
- “Move the prep and mixing work for order SO-1042 as early as possible without
  creating worker conflicts or exceeding daily mixing capacity. Prepare changes
  for review.”
- “Find an alternative assignment for the unclaimed Tuesday packaging task.
  Prefer workers already scheduled that day, but do not create overtime or PTO
  conflicts. Draft the best option.”
- “If we move Thursday’s two mixer batches to Wednesday, what orders, ingredient
  shortages, and staffing requirements change?”
- “Make a draft schedule for next week from confirmed orders. Keep prep one day
  before mixing, respect published work, and flag anything that needs a manager
  decision.”
- “Why is this plan over capacity on Friday? Show the exact tasks and give me
  legal draft changes that would relieve it.”
- “Apply the reviewed proposal to move task PT-208 to Tuesday and assign Jordan.
  Do not publish the schedule.”

## Acceptance and safety gates

- The same intent produces the same tool inputs and deterministic scenario
  result for the same record versions; the model cannot invent a constraint or
  mutate a calculation.
- All read, scenario, proposal, confirmation, rate/quota, and kill-switch paths
  enforce organization/facility isolation, authorization, bounds, no-store
  behavior, audit metadata, and source citations.
- Negative tests cover forged IDs, another organization/facility, inactive or
  suspended users, missing permissions, prompt injection in records, stale
  proposal, changed PTO/capacity/inventory, publication conflict, double
  confirmation, transaction failure, and idempotency collision.
- A confirmed write uses the canonical planning/scheduling service or RPC; no
  browser-to-database access and no duplicate business-rule implementation.
- Before provider enablement or a write release: complete the Copilot Phase-0
  effective-schema/RLS/grant audit, dedicated tests, independent review,
  environment/retention/quota configuration, and explicit release approval.

## Delivery sequence

1. Finish and verify the deterministic planning and scheduling service contracts
   and their source-link/result shapes.
2. Add the shared agent platform controls required by the Operations Copilot
   security-first plan; provider calls remain disabled.
3. Ship Planning Intelligence read-only feasibility and scenario explanations
   against fixed, typed tools.
4. Add proposal generation and the visual review experience.
5. Enable one low-risk confirmed write (draft task move or assignment) only after
   the relevant security, authorization, stale-state, idempotency, and rollback
   tests pass independently.
6. Expand one named operation at a time; publishing and commercial/operational
   commitments remain separately approved scopes.
