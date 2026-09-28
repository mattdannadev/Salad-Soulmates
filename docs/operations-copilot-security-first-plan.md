# Operations Copilot — security-first build plan

**Status:** design and security gate. This document authorizes no production AI
access, no provider key configuration, no automated operational writes, no schema
migration, and no deployment. Those changes remain blocked until the controls and
tests below are implemented and independently reviewed.

## 1. Product scope and phased rollout

Operations Copilot is an internal assistant for food-service manufacturing—not a
customer-feedback chat. It assists authorized users with recipes, orders,
inventory, purchasing, production planning, traceability, and related workflows.

### Product differentiation: fast to implement, self-administered by customers

Salad Soulmates should be positioned as a product customers can configure and
operate themselves, rather than one that requires ongoing vendor administration.
The tenant administrator experience is a core part of that promise: guided
onboarding, customer-owned setup data and picklists, reusable access profiles,
user/facility administration, readiness diagnostics, and plain-language help
for resolving configuration and safe application roadblocks. Platform operators
set the commercial module entitlement; customer tenant administrators configure
their own approved tenant data within their permissions. These are deliberately
separate boundaries.

The Administration Copilot is the conversational layer on top of that
self-service workspace. Its delivery sequence is:

1. Read-only tenant diagnostics and setup readiness with source links.
2. Guided configuration for tenant-owned reference data/picklists, units,
   access-profile defaults, and invitations: the assistant produces a typed
   draft, explains the impact, and opens the existing configuration screen.
3. Explicitly confirmed, permission-gated writes through the same existing
   validation/RPC paths used by the forms; never arbitrary database changes.
4. Curated SOP/runbook retrieval for setup and troubleshooting, with citations
   and organization-scoped access, after the document governance controls are in
   place.

The customer-facing message is: **"Implement quickly, configure it yourself,
and let the administration copilot explain what to do next."** It must not be
marketed as autonomous administration, broad database access, or a substitute
for tenant authorization controls.

1. **Phase 0 — foundation:** inventory the effective schema/RLS/grants, define a
   server-side tool registry and data contract, add audit/metering foundations,
   and pass isolation and security review.
2. **Phase 1 — read-only:** deliver bounded answers with citations/links to the
   source screens. A user may choose a workflow intent but never tables, SQL,
   arbitrary filters, or a model. No write tool exists in this phase.
3. **Phase 2 — typed drafts:** eligible operations produce a structured proposal
   from validated, minimal read data. A draft is not a database mutation and
   expires after a short, documented TTL.
4. **Phase 3 — confirmed writes:** only a named, permission-gated operation may
   be committed after explicit confirmation, fresh authorization and stale-state
   checks. Start with a low-risk, reversible workflow only after its dedicated
   tests and independent review are complete.

The existing uncommitted `operations-copilot` endpoint is a useful Phase-1
prototype because it only accepts the fixed intents `recipes`, `orders`, and
`inventory`; it is not a production authorization to add an AI provider or write
actions. The separate `ai-workspace` feedback-chat endpoint is legacy and out of
scope; it must not be reused as the Operations Copilot execution path.

## 2. Security and data segregation

**Tenant and facility boundary.** Resolve the signed-in active profile at every
request, then carry organization ID and active facility ID as server-owned
context. Organization-wide master data (for example, recipes/products, customers
and suppliers) must be queried with organization scope; operational records must
also be facility scoped. A requested URL, prompt, record ID, or client JSON must
never select another organization/facility. Platform-administration code remains
separate and server-only.

**Authorization.** The service must check the existing `has_permission` model for
every tool; navigation visibility is not authorization. Keep database RLS as the
independent final control. Add narrowly named Copilot permissions (for example
`copilot.read` and later per-write permissions) only through a reviewed migration
and access-profile update.

**RLS/grant audit.** Before any Copilot migration, produce an effective-schema
audit for every referenced table/RPC: RLS enabled, `anon`/`authenticated` grants,
all operation policies, view security, function owner/security mode/search path,
and `PUBLIC` execute privileges. Test each allow/deny case. Do not rely on a
policy alone: grants are evaluated first. Keep privileged functions in a private,
unexposed schema where feasible; use `SECURITY INVOKER` by default, and where a
definer helper is essential pin `search_path = ''`, schema-qualify references,
revoke `PUBLIC`, and grant only the intended role.

**Public-web boundary and secrets.** The browser may use only the Supabase
publishable key. Provider credentials and Supabase secret/service keys are
server-only, absent from `NEXT_PUBLIC_*`, client bundles, logs and analytics.
Use a service/secret key only in a server-owned administrative boundary that
performs its own authorization; it never backs a normal Copilot request.

**Prompt injection and minimization.** Treat every prompt, uploaded document,
recipe note, customer note, and model response as untrusted. The model receives
only tool-selected, allowlisted fields (bounded counts/lengths) and cannot alter
tool policy, invoke URLs, access secrets, retrieve a broader context, or execute
instructions embedded in business data. Exclude credentials, raw audit payloads,
unneeded contacts, full histories and cross-tenant identifiers. Redact known
secrets before provider transmission and log metadata/content hashes rather than
full prompts by default.

**Retention and audit.** Define configurable organization retention periods for
request metadata, tool events, encrypted/redacted content where business-approved,
proposal/confirmation records and cost ledger entries. Apply TTL jobs and legal
hold exclusions. Append an immutable audit event for request received, policy
denial, tools invoked, proposal generated, confirmed/expired/failed action, actor,
organization/facility, correlation ID, model version, source record versions and
cost. Never write full secret-bearing prompts into audit logs.

## 3. Tool architecture

Create a server-only registry whose static descriptors contain: tool ID, Zod input
schema, output schema, required permission, organization/facility scope,
read/write classification, maximum rows/bytes, source citation formatter and
implementation. The route validates the user request, resolves profile context,
authorizes, invokes a registry tool, validates result shape, writes audit/metering
metadata, and returns a bounded result.

The model may select only a tool ID from an already authorized, request-specific
allowlist and typed arguments validated again on the server. It never produces
SQL, table names, RPC names, raw filters, HTTP calls, code, credentials, or direct
database access. Each tool reuses the existing service/domain validation and the
established RPC/transaction for a business mutation; it must not recreate
business rules in a prompt or issue raw table writes.

## 4. Initial supported workflows

| Workflow               | Existing data/service boundary                                                                         | Phase-1 permission/scope                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Recipes/products       | `products`, `recipes`, `recipe_versions`, `recipe_sections`, `recipe_lines`; catalog/recipe services   | `products.read`; organization                                       |
| Order status/customers | `customers`, `customer_product_options`, `customer_orders`; order save/cancel services/RPCs            | `orders.read`; organization plus active facility for orders         |
| Inventory/shortages    | append-only `inventory_events`, receipts/lines, inventory balance domain helper; material requirements | `inventory.read`; organization + active facility                    |
| Purchasing             | material plans, purchase drafts/lines, demand coverage/requests; purchasing services/RPCs              | existing purchasing read permission; organization + active facility |
| Traceability           | source lots, receipt serialization, serialized units/events, production lots and traceability RPCs     | traceability permission; organization + active facility             |

The implementation must verify the final effective permission codes and policies
at the applied migration head. It should return source links/identifiers and
state when data is unavailable rather than infer an operational fact.

## 5. Write-action safety

A write-capable tool returns a typed proposal containing action type, normalized
arguments, affected IDs, display summary, required permission, precondition
versions/hashes, correlation ID, expiry, idempotency key and a correction path.
The UI renders it as a human-readable review card. Confirmation is a separate,
explicit user gesture bound to that proposal/correlation ID—natural-language
assent alone is insufficient.

At confirmation the server reloads authorization, organization/facility context,
permissions, current records and workflow constraints in the same transaction or
the canonical existing RPC. It rejects expired proposals, idempotency collisions
with mismatched payloads, deleted/revoked records, changed versions/balances and
cross-scope IDs with a safe refresh/re-draft response. Successful operations
persist a stable idempotency record and an immutable audit event. Corrections use
existing append-only reversal/correction workflows; no action silently rewrites
inventory, receipt/lot genealogy, confirmed orders or prior audit history.

## 6. Model/provider strategy

Define an internal `CopilotProvider` interface (request, tool calls, usage,
response ID and normalized error), with one environment-configured default model
selected on the server. Keep the provider/model ID in an allowlisted server
configuration—not user input or a browser API. Initial routing is deterministic:
one default model and a hard failure path. Later add task-class routing, feature
flags and provider failover behind the same interface with evaluation thresholds;
do not expose arbitrary model selection to users. Provider calls stay disabled
until the Phase-0 security gate passes and a key is deliberately provisioned.

## 7. Hosting and deployment

Deploy Next.js on Vercel with Supabase. Separate development, preview and
production provider projects/keys, Supabase projects or securely isolated
environment configuration as approved by the existing deployment policy. Keep
production secrets in server-only environment variables; use Vercel sensitive
variables, restrict access, rotate and revoke on suspicion. Preview must never
silently point to production AI credentials or operating data without explicit
release approval.

Instrument structured server logs, error reporting and performance traces with a
correlation ID; scrub personal/business content and secrets. Add health/readiness
checks, request timeouts, bounded retries, circuit breaking, dependency failure
messages with no leakage, alert routing, rollback instructions and a kill switch
that disables provider calls and write tools independently. Production readiness
requires the security review, tests, threat-model signoff, migration review,
environment checklist and explicit release authorization.

## 8. Usage metering and commercial model

Store an append-only `copilot_usage_ledger` keyed by organization, optional user,
request/correlation ID and tool/provider response IDs. Record timestamp,
environment, model, input/output/reasoning/cache tokens when supplied, tool calls,
estimated configured cost, outcome and redacted error code. Do not infer precise
cost if provider usage is unavailable; label it as estimated.

Enforce server-side organization and user quotas, concurrency/request rate limits,
per-request token/tool-result ceilings and organization monthly budgets before a
provider call. Emit alerts at configurable budget thresholds and hard-stop at the
limit. Commercially, define a plan-level included monthly allowance, prepaid
add-ons and explicitly priced overages; make the ledger exportable to authorized
tenant admins. Keep billing decisions separate from tool authorization so a quota
does not weaken data isolation.

## 9. Test plan and acceptance criteria

- Unit-test registry validation, required permission checks, query bounds,
  tool output validation, prompt-data minimization/redaction, response shaping,
  provider error handling, rate/quota enforcement and the provider kill switch.
- Use disposable PostgreSQL/Supabase-compatible tests for RLS plus grants: every
  supported tool allows the intended permission and denies anonymous users,
  missing permissions, another organization, another facility, inactive/suspended
  users, manipulated IDs and direct RPC/table access.
- Add contract tests that a model/request cannot name SQL/tables/tools outside
  the registry or smuggle different organization/facility context.
- For each write action: proposal-only produces no mutation; double confirmation
  is idempotent; stale records are rejected; permission changes before confirm
  are denied; transaction failure has no partial result; correction/reversal
  preserves lineage and audit records.
- Add integration/browser tests for explicit confirmation, source citations,
  accessible denial/error states and no cache of tenant-specific results. Run
  `npm test`, `npm run test:postgres`, `npm run lint`, `npm run typecheck` and
  `npm run build`; use the relevant browser suite before release.
- Independently review code, applied migration SQL, effective grants/RLS,
  provider configuration and test evidence. The acceptance gate is all tests
  green, no unresolved critical/high findings, production keys disabled until
  approval, and an explicit release decision.

## 10. Implementation work breakdown, sequence and risks

| Sequence | Owner/files                                                                                                                   | Deliverable and dependencies                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 0        | Security reviewer: `supabase/migrations/**`, `tests/**`                                                                       | Effective RLS/grants/function audit; resolve findings before Copilot schema work.                                                   |
| 1        | Backend owner: `src/services/operations-copilot.ts`, `src/app/api/operations-copilot/route.ts`, new `src/services/copilot/**` | Convert prototype into registry-backed bounded reads; no provider. Depends on verified permissions and tests.                       |
| 2        | Data owner: new reviewed migration plus `src/lib/database.types.ts`                                                           | Copilot permissions, audit/proposal/idempotency/usage ledger tables and RLS/grants. Generate types only after migration validation. |
| 3        | Test owner: `tests/operations-copilot*.test.ts`, `supabase/tests/**`                                                          | Unit, native PostgreSQL and isolation/denial coverage. Depends on Steps 1–2.                                                        |
| 4        | Provider owner: `src/services/copilot/provider.ts`, server configuration, deployment docs                                     | Internal abstraction, provider kill switch, metering and redaction; no browser key. Depends on review and credential authorization. |
| 5        | Workflow owners                                                                                                               | Add one read workflow at a time; then one independently reviewed confirmed-write workflow using canonical services/RPCs.            |
| 6        | Release owner                                                                                                                 | Environment review, observability, quota/budget configuration, independent security review and explicit production authorization.   |

Primary risks are effective-policy drift across migrations, confused organization
versus facility scoping, `SECURITY DEFINER`/grant exposure, stale operational data,
prompt-injection-driven overreach, provider data retention, unexpected cost, and
the current single shared database/preview arrangement. Mitigations are the
gates, transaction reuse, cross-boundary denial tests, data minimization,
metering, kill switch and staged release above.

## Current implementation blockers (independent review, 2026-09-27)

The following findings block provider enablement, write proposals and production
release. They define the first Phase-0 work rather than being waived by this plan.

1. The legacy feedback AI path sent feedback comments and conversation data to a
   provider and offered a direct feedback-status update without the required
   proposal/confirmation/audit controls. It is now fail-closed by default using
   `OPERATIONS_COPILOT_AI_ENABLED`; do not set that value to `true` until the
   controls in this plan are implemented and independently approved.
2. The read-only prototype uses only existing domain permissions, not an explicit
   Copilot permission, and has no immutable request/tool audit, correlation ID,
   quota, rate/concurrency control or retention model. It is therefore not ready
   for provider access.
3. Inventory balance calculation pages through the entire facility event ledger.
   Replace this with a verified, facility-scoped aggregate/projection or bounded
   canonical RPC before exposing it broadly; enforce database, response, timeout
   and rate ceilings.
4. Native PostgreSQL bootstrap/tests do not yet represent the effective migration
   head, and no Copilot tests exercise anonymous, missing-permission, other-org,
   other-facility, inactive/suspended or forged-input denial paths.
5. API handlers currently turn authentication redirects into generic 500s. Add an
   API-specific auth boundary with tested 401/403 behavior before release.
6. The generic audit table lacks facility/correlation/model/cost/retention fields;
   use dedicated append-only Copilot audit and usage records with a documented
   purge/legal-hold design. Audit every referenced definer RPC's owner, search
   path, exposure and execute grants before registry adoption.

## Current documentation basis

This plan follows the current official guidance that RLS and grants must both be
validated for exposed Supabase data, secret keys bypass RLS and must remain
server-side, and `SECURITY DEFINER` requires a pinned search path and restricted
execution: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys),
and [Supabase database functions](https://supabase.com/docs/guides/database/functions).
For deployment, Vercel documents separate environment scopes and sensitive
variables: [environment variables](https://vercel.com/docs/environment-variables)
and [sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).
OpenAI provider credentials stay server-side and are configured through
`OPENAI_API_KEY` per the [official quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request).
