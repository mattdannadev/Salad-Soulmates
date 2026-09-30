# Provider Console — Tenant Management Build Plan

Updated: September 29, 2026
Status: proposed execution plan. Extends the approved platform-control-plane slice; it does not authorize production release, billing, deletion, impersonation, private-cloud provisioning, or customer-network access.

## Implementation checkpoint — September 30, 2026

Stage 1's read-only increment is implemented locally, pending a reviewed
production migration and deployment: separate provider roles, an explicit
founder Provider Owner bootstrap, service-role-only provider permission,
directory and tenant-detail RPCs, a server-only repository/service boundary, and
the `/admin/provider` directory with an individual detail route. The views show
only tenant identity, current lifecycle, facility count, enabled-user count and
creation time. Every successful directory/detail read writes a redacted,
append-only provider audit event. There are no mutations or private-cloud/on-
premises controls.

The bootstrap uses the owner-designated production Auth account only if it is
present at migration time; it does not promote legacy `platform_admins` or any
tenant administrator. Provider-role assignment/revocation remains deferred
until its own audited mutation workflow is implemented and tested.

The reusable Provider Owner fresh-authentication gate is implemented locally:
an Owner reconfirms their normal email/password or phone/password credential,
then each high-impact service action independently verifies a live Auth session,
signed recent password-authentication event, matching identity/session and exact
current Owner assignment. It is not yet connected to a provisioning mutation.
Focused automated coverage exercises the guard and SSR cookie boundary with
synthetic Auth responses. A production-like Supabase Auth sign-in, cookie and
revoked-session test remains required before enabling a high-impact mutation.

Verification completed locally: `npm run typecheck`, `npm run lint`, `npm run
build`, and the focused Provider Console Vitest suite. Remaining Stage 1 work:
production migration review/application, authenticated route check as the
explicit Provider Owner and a non-provider user, pagination/search for an
operationally large directory, and future role-management only after
server-verifiable recent authentication exists. No production deployment or data
change occurred.

### Stage 2 foundation — September 30, 2026

The customer-account foundation is implemented locally, pending reviewed
production migrations and deployment: explicit commercial customer accounts,
contact storage without contact-data read access, and explicitly approved
one-active-production-tenant links with archived history. The Provider Console
adds read-only customer-account directory/detail routes and an optional linked
account summary on tenant detail when the operator holds both `customers.read`
and `tenants.read`. Customer/tenant reads are redacted and append-only audited.

No existing tenant is inferred or backfilled from a name, slug, or tenant-local
operational customer record. Customer account creation, linking, provisioning,
invitations, jobs, billing, environments and lifecycle mutations remain future
work. Account state never changes tenant access in this slice.

## Purpose and boundary

Build an internal Provider Console for Salad Soulmates staff to manage the commercial and operational relationship with customers. It is separate from the tenant application and tenant-administrator login. It will manage customer and tenant onboarding, lifecycle, environment inventory, user and usage visibility, entitlements, diagnostics, and auditable support work.

The existing `/admin` portal is the first delivered slice: organization listing/provisioning, enabled-user count, suspension/reactivation, and Operations Copilot plan access. This plan expands it deliberately. The Provider Console is the common control plane for public-cloud, private-cloud, and customer-operated on-premises offerings; it does not turn those offerings into one shared trust boundary.

### Non-negotiable rules

- Tenant administrators never inherit provider authority. Provider access is explicitly granted, authorized server-side for every cross-tenant action, and logged.
- `organizations` remain the logical tenant/data-isolation boundary. Facilities are tenant sites, not automatically separate infrastructure environments.
- Retain the approved Production + Sandbox Supabase baseline with separate credentials. Do not promise per-tenant databases, independent restore, or per-tenant deployments unless those resources exist.
- Browser code gets no service credentials or broad cross-tenant database access. Dependencies flow presentation -> provider service -> limited repository/RPC.
- Lifecycle, entitlement, provisioning, and support operations must be attributable, immutable, correlated, and recoverable when feasible. Suspension preserves history; archive is not deletion.
- Default provider views show redacted metadata and aggregates. Secrets, token values, raw tenant data, and unrestricted impersonation are outside the MVP.
- The control plane stores deployment inventory, declared capabilities, health, version, entitlement and auditable operation state. Tenant operational data remains in its own approved environment and is not replicated into the control plane merely for convenience.
- Private-cloud and on-premises connectivity is outbound-only from the tenant environment wherever feasible. No inbound customer-network access, remote shell, database superuser path, or persistent support tunnel is in MVP.

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

The initial offer is public cloud. On-premises and Salad Soulmates-managed
private cloud are secondary offerings that use the same Provider Console and
release contract after their deployment and support gates are complete. At
launch, a customer account has one isolated production `organization` and may
have many linked environments, including multiple independent sandboxes for
release testing and promotion. Retain the customer-to-tenant link so a future
customer with multiple production organizations can be added without changing
the tenant isolation boundary.

Sandbox policy has two classes: empty/sample-data sandbox by default and a later
approved masked-production-copy sandbox. “Limited data” is a sandbox data policy,
not a separate environment type. Unmasked production cloning is excluded unless
a separately approved exceptional offering supplies masking, customer approval,
retention, access-audit and incident controls.

## Deployment offerings and control-plane boundary

The Provider Console must present one consistent customer and tenant interface across these deployment offerings, while accurately representing their materially different operational boundaries:

The working [deployment capability matrix](provider-console-deployment-capability-matrix.md) and [source-of-truth map](provider-console-source-of-truth.md) are the Stage 0 contracts for which controls may appear for each offering and which system owns each record.

| Offering      | Tenant runtime                                                                                                                                            | Control-plane connection                                                                                               | Initial Provider Console capability                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public cloud  | Salad Soulmates shared Production environment; tenant isolation remains in `organizations`, RLS and server authorization                                  | Internal, narrowly scoped provider service/RPC boundary                                                                | Provision logical tenant, invite, lifecycle, entitlement, version and redacted health                                                               |
| Private cloud | Salad Soulmates-managed, customer-dedicated cloud account, project or network after a contracted isolation requirement and operated-resource design exist | Dedicated deployment connector with tenant-scoped credentials held outside browser code                                | Inventory, version, declared capability and sanitized health first; mutations only once backed by runbooks and rollback                             |
| On premises   | Salad Soulmates appliance or customer-provided server running the same release artifact and local data services                                           | Customer-installed agent makes authenticated outbound requests to the control plane and reports allow-listed telemetry | Unified customer inventory, version, agent status and sanitized health first; no inbound access, shell, raw database access or unrestricted support |

Standard public cloud is logical tenant isolation in a shared data plane; it is
not marketed as physical isolation. Dedicated private cloud is the physical
isolation tier: a customer-specific application and database environment
operated by Salad Soulmates. On-premises uses a customer-operated application
and database. The Provider Console evolves into a separate control plane that
holds commercial, deployment, entitlement and audit metadata only; it does not
become a shared store of tenant operational data.

Every `tenant_environment` must declare its offering type, environment purpose, ownership, provider/customer support boundary, app and schema compatibility, connector/agent status, data-residency region where meaningful, and its verified action capabilities. An unavailable capability must render as unavailable—not as a disabled-looking promise of a provider action.

The console owns commercial and operational metadata: customer/tenant relationships, lifecycle, entitlements, deployment inventory, support request state, audit, approved aggregate usage and operation/job state. Each runtime remains authoritative for tenant data, identities, RLS authorization, operational records, local integrations and backup/restore evidence. Secrets stay in the environment-specific secret system; the console retains only a reference, rotation state and access audit where necessary.

Provider-initiated operations must use an explicit connector/agent contract with mutually authenticated, tenant-bound requests, correlation IDs, idempotency keys, expiry, least-privilege capability scopes, signed result envelopes and immutable provider/runtime audit records. For private-cloud and on-premises environments, support elevation additionally requires tenant approval, a time limit and a tenant-visible reason when the action can touch tenant data.

## Console scope

1. **Overview** — active customers/tenants; onboarding/provisioning failures; trials/renewals; usage alerts; environment health; incidents. Every metric includes definition and freshness.
2. **Customers** — search directory; commercial and technical contacts; owner; internal-only notes; linked tenants; contract/plan references; onboarding state.
3. **Tenants** — lifecycle; facilities; memberships; entitlements; usage; integrations; environments; recent operations; audit history.
4. **Environments** — offering type, purpose, status, shared/project placement, region where meaningful, app/schema compatibility, domain, redacted configuration summary, connector/agent status, declared capabilities, integration health, backup/recovery-test metadata.
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

Provider Owner, Provider Operations, Provider Support Read-only and Provider Billing are the approved launch roles. Role assignment, suspension, entitlement downgrade, export, support elevation and future purge need a reason, recent authentication, specific permission, immutable audit event and Provider Owner approval. Tenant roles and navigation visibility never grant provider authority.

## Lifecycle model

Customer tenants and customer environments use the following lifecycle states.
Every transition is server-authorized, records its actor/reason/correlation ID,
and preserves history.

| State          | Meaning                                               | Access and transition rules                                                                                                                                                                  |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`        | Commercial or environment record is being configured. | No tenant access; may move to `provisioning` or be cancelled without a runtime.                                                                                                              |
| `provisioning` | Idempotent setup or enrollment work is in progress.   | No normal tenant access; retry/recovery records determine `active` or `failed`.                                                                                                              |
| `active`       | Normal customer operation.                            | Authorized lifecycle transition can move to `suspended`; environment promotion follows its separate release gate.                                                                            |
| `suspended`    | Reversible operational hold.                          | Interactive sessions, API mutations, background jobs and integrations are denied or safely paused; records remain retained. Only an authorized, audited reactivation returns it to `active`. |
| `failed`       | Provisioning or a supported operation needs recovery. | No claimed availability; recovery is explicit and auditable, returning to `provisioning`, `active` or `suspended` as appropriate.                                                            |
| `archived`     | Inactive record retained after offboarding.           | No tenant access; export/retention evidence remains available to authorized provider users. It is not deletion.                                                                              |

Purge/deletion is not a lifecycle state or normal action. It remains a future,
Provider Owner-approved workflow after export, retention and recovery obligations
have been satisfied.

## Architecture and data design

- **Presentation:** `src/app/admin` and provider components render data/intent only, including loading, empty and error states.
- **Service:** server-only provider services validate, enforce capabilities and lifecycle rules, coordinate jobs/idempotency, and record audit intent/result.
- **Data:** server-only repositories use narrow Supabase RPCs plus adapters for Auth, telemetry, billing, integrations and infrastructure.
- **Database:** reviewed migrations own constraints, RLS, transactions, append-only audit, and service-role-only provider RPCs.

Extend the patterns in `src/services/platform-admin.ts` and `src/data/platform-admin.ts`; do not add direct Supabase access to pages/components.

Add only after a source-of-truth map confirms no canonical record is duplicated: `customer_accounts`, `customer_contacts`, `tenant_account_links`, `tenant_environments`, `provider_roles`, `provider_role_assignments`, `tenant_entitlements`, `tenant_lifecycle_events`, `provisioning_jobs`, `operation_attempts`, `usage_events`, `usage_rollups`, `integration_health`, and `provider_audit_events`.

Existing organizations, facilities, profiles/access profiles, `platform_admins`, Auth identities, organization audit and operational records remain canonical. Provider audits include actor, effective permission, target customer/tenant/environment, reason, request/job correlation ID, outcome, timestamp, and redacted before/after summary—never secrets.

### Metering contract

Enabled-user count is an operational visibility and entitlement measure, not the launch pricing metric: it means enabled profiles in an active production organization, excluding pending invitations, deactivated profiles and sandbox-only accounts. In commercial planning, a site means a customer operational facility—not the Salad Soulmates web application or subscription. The approved pricing direction is a customer-account or facility/site base plus operational-scale, package and support bands; it expressly does not select flat per-facility or pure per-user pricing. Final price points and any order/activity allowance remain commercial-policy inputs, not Provider Console behavior. Before any metric becomes commercial usage, specify its event producer, tenant, period/timezone, inclusion/exclusion rules, idempotency key, correction behavior, freshness target, retention, rollup and reconciliation report. Do not charge for safety/traceability entries before pricing and correction gates pass.

## Critical workflows

### Provision customer/tenant

Validate unique account/tenant identifiers and policy -> create a `provisioning_job` with idempotency key -> allocate the organization, first facility, defaults and approved customer link in suspended/provisioning state -> configure entitlements -> health check -> issue tenant-admin invitation -> activate after successful delivery or record actionable recovery state. An identical retry cannot create duplicate tenants/invites; partial failures are visible and recoverable.

### Lifecycle, access, and entitlements

Support the approved `draft`, `provisioning`, `active`, `suspended`, `failed` and `archived` lifecycle states alongside metadata updates, tenant-admin bootstrap, membership visibility and plan changes. Suspension must consistently cover interactive sessions, APIs, background jobs and integrations; specify allowed read/export behavior. Reactivation preserves history and does not replay unsafe work. Purge remains separate from lifecycle and is not a normal action.

### Environments and support

Begin with a truthful read-only environment inventory. Public-cloud actions use the existing server-side provider boundary. Private-cloud and on-premises actions require the applicable deployment connector or outbound agent, a verified capability declaration, authorization, validation, rollback and runbook before appearing. Support begins with redacted diagnostics. Any future tenant-context access is scoped, time-limited, tenant-visible where appropriate, tenant-approved for private/on-premises data access, and auditable under the real provider operator.

### Usage and health

Capture append-only events, deduplicate, accept late/corrected events and generate time-bounded rollups. Show source/freshness and thresholds. Alerts must lead to tenant detail or safe action rather than a cross-tenant data dump.

### Offboarding

Request -> export/retention check -> suspend -> retention wait -> separately approved purge job -> completion evidence. Purge is Stage 5 only.

## Staged delivery plan

| Stage                   | Deliverable                                                                                                                                       | Exit criteria                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Decisions           | glossary, source-of-truth map, lifecycle machine, permission matrix, metric definitions, environment truth table and deployment capability matrix | Product/engineering agree what customer, tenant, facility and environment mean; every offering's real control-plane boundary is documented; no misleading UI               |
| 1 — Secure read-only    | provider roles; protected directories/detail; audit pipeline                                                                                      | tenant/provider denials and scoped cross-tenant reads are tested                                                                                                           |
| 2 — Onboarding          | customer records; idempotent jobs; early suspended organization allocation; invitation; checklist; retry/recovery                                 | happy path, duplicate, interrupted, failed dependency and recovery pass; organization allocation precedes invitation delivery; activation follows delivery, not acceptance |
| 3 — Lifecycle/access    | lifecycle, membership/seat view, entitlements, hardened suspension                                                                                | every mutation is server-enforced, reasoned, auditable, recoverable                                                                                                        |
| 4 — Usage/operations    | reconciled rollups, alerts, environment/integration inventory, safe retries                                                                       | late/duplicate/corrected usage reconciles; stale data is labeled; private/on-prem actions appear only for verified capabilities                                            |
| 5 — Advanced/commercial | billing, approvals, controlled support, export/offboarding, qualified dedicated isolation                                                         | every high-impact action passes authorization, failure, recovery and runbook gates                                                                                         |

MVP is Stages 0–4 with a small role set, account/tenant directories, truthful environment inventory, reliable create/invite, lifecycle management, membership/seat visibility, selected reconciled metrics and auditable diagnostics. The Stage 0 source-of-truth, pricing and deployment artifacts are documented; initial provider-role assignment ownership and exact assignments remain the final authorization gate before schema/UI expansion. The launch public-cloud entitlement includes all currently released core functionality. Future package-gated add-ons require an explicit product and commercial decision; existing internal feature entitlements do not by themselves create an add-on offering.

The initial cross-offering release standard is Linux `x86_64` OCI images on a Docker-compatible runtime, delivered from one versioned release train. The cloud targets are operated by Salad Soulmates; appliance and customer-server targets use supported installer/agent packaging. Kubernetes/Helm and Windows server packaging are deferred. See the deployment capability matrix for release eligibility and upgrade gates.

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

1. What commercial policy and controls will govern a future customer with multiple production tenant organizations? The launch default is one production organization and many environments per customer.
2. What isolation/environments actually exist versus shared Production/Sandbox resources?
3. The founder is the intended initial Provider Owner; provide the exact production Auth user UUID or approve an exact account-email lookup for the audited seed. Which recent-authentication mechanism and maximum age will authorize later Provider Owner role assignments and other high-risk operations?
4. Pricing direction is approved as a customer-account or facility/site base plus scale, package and support bands. Which final price points, order/activity allowances and scale thresholds will the commercial policy use?
5. Is early provisioning strictly logical tenant creation on shared infrastructure?
6. What retention periods, export obligations and deletion authority apply? Lifecycle states are approved as `draft`, `provisioning`, `active`, `suspended`, `failed` and `archived`.
7. Which external systems are authoritative for billing, support, telemetry, backups and infrastructure health?
8. Which Salad Soulmates-managed private-cloud topology and customer responsibilities will be offered first?
9. What connectivity/proxy requirements, customer-installed agent upgrade channel, certificate/identity rotation and offline behavior are supportable for appliance and customer-server on premises?
10. Which support actions need tenant approval, and how will approval, scope, expiry and tenant visibility be enforced per offering?

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
