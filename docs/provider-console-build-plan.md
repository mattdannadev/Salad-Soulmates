# Provider Console — Tenant Management Build Plan

Updated: September 29, 2026
Status: proposed execution plan. Extends the approved platform-control-plane slice; it does not authorize production release, billing, deletion, or impersonation.

## Purpose and boundary

Build an internal Provider Console for Salad Soulmates staff to manage the commercial and operational relationship with customers. It is separate from the tenant application and tenant-administrator login. It will manage customer and tenant onboarding, lifecycle, environment inventory, user and usage visibility, entitlements, diagnostics, and auditable support work.

The existing `/admin` portal is the first delivered slice: organization listing/provisioning, enabled-user count, suspension/reactivation, and Operations Copilot plan access. This plan expands it deliberately.

### Non-negotiable rules

- Tenant administrators never inherit provider authority. Provider access is explicitly granted, authorized server-side for every cross-tenant action, and logged.
- `organizations` remain the logical tenant/data-isolation boundary. Facilities are tenant sites, not automatically separate infrastructure environments.
- Retain the approved Production + Sandbox Supabase baseline with separate credentials. Do not promise per-tenant databases, independent restore, or per-tenant deployments unless those resources exist.
- Browser code gets no service credentials or broad cross-tenant database access. Dependencies flow presentation -> provider service -> limited repository/RPC.
- Lifecycle, entitlement, provisioning, and support operations must be attributable, immutable, correlated, and recoverable when feasible. Suspension preserves history; archive is not deletion.
- Default provider views show redacted metadata and aggregates. Secrets, token values, raw tenant data, and unrestricted impersonation are outside the MVP.

## Canonical vocabulary and sources

| Concept           | Meaning                                                              | Initial source of truth                               |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Customer account  | Commercial company, contacts, contract and owner                     | New provider-control-plane records                    |
| Tenant            | Customer workspace and primary isolation boundary                    | Existing `organizations`                              |
| Facility          | Operational site inside a tenant                                     | Existing `facilities`                                 |
| Environment       | Real Production, Sandbox, Demo, or Test isolation/deployment context | New inventory backed by infrastructure references     |
| Tenant membership | User's tenant role and status                                        | Existing profiles/access profiles/Auth lifecycle      |
| Provider operator | Authorized Salad Soulmates employee                                  | Existing `platform_admins`, evolved to provider roles |
| Entitlement       | Purchased/trial feature or limit                                     | Existing Copilot flag, then normalized records        |
| Usage metric      | Defined and reconcilable measurement by tenant/period                | New event/rollup subsystem                            |

Validate customer-to-many-tenants and tenant-to-many-environments before schema changes. Preserve the current single-organization provisioning path.

## Console scope

1. **Overview** — active customers/tenants; onboarding/provisioning failures; trials/renewals; usage alerts; environment health; incidents. Every metric includes definition and freshness.
2. **Customers** — search directory; commercial and technical contacts; owner; internal-only notes; linked tenants; contract/plan references; onboarding state.
3. **Tenants** — lifecycle; facilities; memberships; entitlements; usage; integrations; environments; recent operations; audit history.
4. **Environments** — purpose, status, shared/project placement, region where meaningful, app/schema compatibility, domain, redacted configuration summary, integration health, backup/recovery-test metadata.
5. **Provisioning** — guided customer/tenant setup; first facility; initial tenant-admin invite; plan choice; durable job status, retry and recovery.
6. **Users and access** — membership, invitation, enabled-seat and measured-activity views; provider-role assignment. Treat global user identities carefully when linked to more than one tenant.
7. **Usage and entitlements** — seats, selected product events, storage/processing where measured, limits, trends, exports, definitions and freshness.
8. **Operations and support** — redacted diagnostics; failed jobs; integration health; incidents; maintenance notices; safe retries.
9. **Commercial** — plan, trial/subscription status, renewal and external billing references. Payment and invoice mutations are deferred.
10. **Audit and settings** — provider audit search, role policy, alert routing, rollouts and retention/export policy.

### MVP exclusions

- Payment-provider writes, invoices, credits, tax, and automated metered billing.
- Customer-data impersonation. A future version requires customer approval, scope, expiry, visible notice and real-actor audit.
- Reset, clone, restore, or infrastructure-creation buttons without real backing resources, authorization, validation, rollback, and runbooks.
- Irreversible deletion. Offboarding starts with export, retention checks and suspension.
- Generic SSO/SCIM; preserve the existing qualified midmarket acceptance gate.

## Provider roles

Start deny-by-default; permissions, not navigation visibility, control access.

| Role                       | Initial capabilities                                       | Excluded by default                                |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Provider Owner             | roles, high-risk approvals, policy/settings                | routine actions without audit and reauthentication |
| Provider Operations        | onboarding, lifecycle, provisioning recovery, plan changes | role assignment and irreversible actions           |
| Provider Support Read-only | directories, redacted diagnostics, audit lookup            | tenant/provider mutation and raw tenant data       |
| Provider Billing           | commercial references and future billing operations        | identity, access and infrastructure changes        |

Role assignment, suspension, entitlement downgrade, export, support elevation and future purge need a reason, recent authentication, specific permission, audit event and (when warranted) second approval.

## Architecture and data design

- **Presentation:** `src/app/admin` and provider components render data/intent only, including loading, empty and error states.
- **Service:** server-only provider services validate, enforce capabilities and lifecycle rules, coordinate jobs/idempotency, and record audit intent/result.
- **Data:** server-only repositories use narrow Supabase RPCs plus adapters for Auth, telemetry, billing, integrations and infrastructure.
- **Database:** reviewed migrations own constraints, RLS, transactions, append-only audit, and service-role-only provider RPCs.

Extend the patterns in `src/services/platform-admin.ts` and `src/data/platform-admin.ts`; do not add direct Supabase access to pages/components.

Add only after a source-of-truth map confirms no canonical record is duplicated: `customer_accounts`, `customer_contacts`, `tenant_account_links`, `tenant_environments`, `provider_roles`, `provider_role_assignments`, `tenant_entitlements`, `tenant_lifecycle_events`, `provisioning_jobs`, `operation_attempts`, `usage_events`, `usage_rollups`, `integration_health`, and `provider_audit_events`.

Existing organizations, facilities, profiles/access profiles, `platform_admins`, Auth identities, organization audit and operational records remain canonical. Provider audits include actor, effective permission, target customer/tenant/environment, reason, request/job correlation ID, outcome, timestamp, and redacted before/after summary—never secrets.

### Metering contract

Metering is not operational inventory/production usage. Before a metric becomes commercial usage, specify its event producer, tenant, period/timezone, inclusion/exclusion rules, idempotency key, correction behavior, freshness target, retention, rollup and reconciliation report. MVP metrics are enabled users/seats (clearly labeled), pending invitations, active facilities, and only product events that have passed reconciliation. Do not charge for safety/traceability entries before pricing and correction gates pass.

## Critical workflows

### Provision customer/tenant

Validate unique account/tenant identifiers and policy -> create a `provisioning_job` with idempotency key -> allocate organization, first facility and defaults -> configure entitlements -> health check -> issue tenant-admin invitation -> record ready or actionable failure. An identical retry cannot create duplicate tenants/invites; partial failures are visible and recoverable.

### Lifecycle, access, and entitlements

Support metadata updates, tenant-admin bootstrap, membership visibility, plan changes and suspend/reactivate. Suspension policy must consistently cover interactive sessions, APIs, background jobs and integrations; specify allowed read/export behavior. Reactivation preserves history and does not replay unsafe work.

### Environments and support

Begin with a truthful read-only environment inventory. Add mutation only when its real resource, authorization, validation, rollback and runbook are implemented. Support begins with redacted diagnostics. Any future tenant-context access is scoped, time-limited, tenant-visible where appropriate, and auditable under the real provider operator.

### Usage and health

Capture append-only events, deduplicate, accept late/corrected events and generate time-bounded rollups. Show source/freshness and thresholds. Alerts must lead to tenant detail or safe action rather than a cross-tenant data dump.

### Offboarding

Request -> export/retention check -> suspend -> retention wait -> separately approved purge job -> completion evidence. Purge is Stage 5 only.

## Staged delivery plan

| Stage                   | Deliverable                                                                                                      | Exit criteria                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 — Decisions           | glossary, source-of-truth map, lifecycle machine, permission matrix, metric definitions, environment truth table | Product/engineering agree what customer, tenant, facility and environment mean; no misleading UI |
| 1 — Secure read-only    | provider roles; protected directories/detail; audit pipeline                                                     | tenant/provider denials and scoped cross-tenant reads are tested                                 |
| 2 — Onboarding          | customer records; idempotent jobs; invitation; checklist; retry/recovery                                         | happy path, duplicate, interrupted, failed dependency and recovery pass                          |
| 3 — Lifecycle/access    | lifecycle, membership/seat view, entitlements, hardened suspension                                               | every mutation is server-enforced, reasoned, auditable, recoverable                              |
| 4 — Usage/operations    | reconciled rollups, alerts, environment/integration inventory, safe retries                                      | late/duplicate/corrected usage reconciles; stale data is labeled                                 |
| 5 — Advanced/commercial | billing, approvals, controlled support, export/offboarding, qualified dedicated isolation                        | every high-impact action passes authorization, failure, recovery and runbook gates               |

MVP is Stages 0–4 with a small role set, account/tenant directories, truthful environment inventory, reliable create/invite, lifecycle management, membership/seat visibility, selected reconciled metrics and auditable diagnostics. Stage 0 is required before schema/UI expansion.

## Verification and rollout

Required verification:

- Direct API/RPC denials as well as UI tests; tenant-admin-to-provider denial; cross-tenant negative tests using at least two tenants and multiple provider roles.
- Concurrent/idempotent provisioning, partial failure/retry, invitation expiry and duplicate identity cases.
- Suspension effects across session, API, jobs and integrations.
- Usage deduplication, late event, correction, timezone boundary and rollup reconciliation.
- Audit completeness/redaction, pagination/search, loading/empty/error states and accessibility.
- Export/offboarding, credential-compromise and incident-runbook exercises before high-risk controls are enabled.

Roll out read-only access internally, then provider provisioning for an internal/demo tenant behind a feature flag, then one controlled customer onboarding with UAT/recovery ownership, then gradual expansion after failure/audit/metric review. Maintain runbooks for failed provisioning, accidental suspension, wrong entitlement, credential compromise, telemetry gap, export and offboarding.

## Decisions required before Stage 0 exits

1. Can a customer own multiple tenants, and what is contractual scope?
2. What isolation/environments actually exist versus shared Production/Sandbox resources?
3. Which provider employees get which permissions and who approves high-risk operations?
4. What is the authoritative active-user/seat and product-usage definition?
5. Is early provisioning strictly logical tenant creation on shared infrastructure?
6. What are lifecycle states, retention periods, export obligations and deletion authority?
7. Which external systems are authoritative for billing, support, telemetry, backups and infrastructure health?

## Risks and mitigations

| Risk                                           | Mitigation                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Provider privilege inherited from tenant admin | separate identities/permissions, server/RPC checks, negative tests         |
| UI implies nonexistent isolation               | environment truth table and resource-backed actions only                   |
| Duplicate tenant/user truth                    | source-of-truth map; preserve current organization/profile/Auth canonicals |
| Duplicate/partial provisioning                 | durable idempotent jobs, correlation IDs, recovery UI                      |
| Unreconcilable billable usage                  | meter contract, correction logic, reconciliation gate                      |
| Cross-tenant PII/secrets exposure              | redacted diagnostics and least-privilege reads                             |
| Irreversible action mishandling                | staged offboarding, approval/reauth, retention/recovery evidence           |

## Implementation anchors

- Current portal: `src/app/admin/page.tsx` and `src/components/admin/organization-controls.tsx`.
- Existing server/provider boundary: `src/services/platform-admin.ts`, `src/data/platform-admin.ts`.
- Existing control-plane migrations: `20260926202013_platform_control_plane.sql` and `20260927183127_platform_operations_copilot_plan_control.sql`.
- Governing constraints: `docs/build-plan.md` and `docs/decisions.md` under Platform tenant administration control plane.
