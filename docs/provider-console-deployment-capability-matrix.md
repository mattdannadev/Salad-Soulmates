# Provider Console — Deployment Capability Matrix

Updated: September 29, 2026  
Status: Stage 0 working contract. It guides Provider Console design; it does not authorize runtime provisioning, deployment agents, customer-network access, migrations, or production release.

## Purpose

This matrix makes the Provider Console truthful across public-cloud,
private-cloud and on-premises offerings. A console action may be offered only
when its environment has a real, authorized and audited implementation. A
missing capability is shown as unavailable with an explanation; it is never
represented as an actionable control.

All offerings consume one versioned application release train: the same source
repository produces a signed, versioned runtime artifact and a compatibility
manifest. Deployment packaging, configuration, storage and connectivity may
differ by offering, but no offering receives a separately maintained product
codebase. An environment reports its deployed app version, schema compatibility
and supported capabilities to the Console before an upgrade can be offered.

### Initial supported release targets

The initial release standard is Linux `x86_64` with OCI container images and a
Docker-compatible container runtime. Salad Soulmates operates the cloud targets;
the appliance includes the approved runtime and a customer-server installer
validates the required runtime before enrollment. Kubernetes/Helm and Windows
server packaging are explicitly deferred. This keeps the artifact, upgrade
workflow, compatibility checks and support runbook uniform without forcing a
customer to administer Docker directly.

Each release publishes an immutable application image digest, management-agent
image digest, semantic version, compatibility manifest, migration/rollback
requirements, supported runtime range and release notes. The Provider Console
offers an upgrade only after the environment reports a compatible installed
version, successful preflight state and a current backup/recovery status where
the offering supports it. The installer or agent—not a browser—pulls and
verifies the approved artifact and returns an auditable result.

## Common control-plane record

At launch, each customer account has one isolated production tenant/organization
and one or more environment records. Environments may include Production and
multiple independent Sandboxes that a customer uses to test a release before
promoting it to another environment. The data model retains an explicit
customer-to-tenant link so a future contractual need for multiple organizations
per customer can be supported without changing the isolation model. The control
plane owns the following metadata and never copies operational tenant records
into it merely for administration convenience:

Two sandbox classes are planned: an empty/sample-data sandbox is the default;
an approved masked-production-copy sandbox is a later enterprise capability.
“Limited data” is a selection and masking policy applied to a sandbox, not a
third sandbox class. An unmasked full production clone is prohibited by default
and can only be evaluated as an exceptional, separately approved offering after
data masking, customer approval, retention, access audit and incident controls
are implemented.

| Field group                  | Examples                                                                                                                    | Rule                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and commercial link | customer account, tenant/organization link, contract reference, offering type                                               | The existing `organizations` record remains the tenant/data-isolation boundary. One active production organization per customer is the launch default; a customer can have many environments. |
| Runtime inventory            | environment purpose, owner, region when meaningful, endpoint/domain reference, app/schema compatibility, deployment version | The record describes actual infrastructure; it must not imply dedicated resources where none exist.                                                                                           |
| Connection and capability    | connector or agent identity/status, last contact, supported operation set, credential reference/rotation state              | Secret values and long-lived provider credentials are outside the Console database and browser.                                                                                               |
| Operations                   | request/job correlation ID, idempotency key, requested/started/finished timestamps, result code, redacted detail            | All provider-initiated work is immutable and attributable to a provider operator.                                                                                                             |
| Health and usage             | freshness, allow-listed health signals, aggregate enabled-user/facility counts and reconciled product usage                 | Enabled-user count is an operational visibility measure, not the selected pricing metric. No raw tenant data, event payloads, authentication tokens or customer secrets.                      |

## Launch capability matrix

| Capability                                                             | Public cloud                                                                                      | Private cloud                                                                                      | On premises                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Tenant/customer directory, lifecycle and entitlement view              | Available through the server-side Provider Console boundary                                       | Available after environment inventory exists                                                       | Available after environment inventory exists                                                       |
| Provision a logical tenant, first facility and tenant-admin invitation | Available only through the existing idempotent public-cloud provider workflow                     | Not available until an approved private-cloud provisioning design and recovery runbook exist       | Not available until an approved on-premises installation and enrollment design exists              |
| Suspend/reactivate tenant access                                       | Available only through the existing server-enforced lifecycle workflow                            | Inventory-only until a connector can prove suspension behavior across the customer deployment      | Inventory-only until an agent can prove suspension behavior across the customer deployment         |
| Environment/version/compatibility inventory                            | Available, derived from known shared runtime deployment metadata                                  | Available as customer/deployment inventory                                                         | Available as customer/agent-reported inventory                                                     |
| Sanitized health and freshness                                         | Available when backed by allow-listed provider service signals                                    | Available only from authenticated connector reports                                                | Available only from authenticated outbound agent reports                                           |
| Upgrade, migration, restart, backup or restore operation               | Not available in MVP unless a specific resource, authorization, rollback and runbook are approved | Not available in MVP                                                                               | Not available in MVP                                                                               |
| Remote support action touching tenant data                             | Not available in MVP                                                                              | Not available in MVP; future action needs customer approval, time limit, least privilege and audit | Not available in MVP; future action needs customer approval, time limit, least privilege and audit |
| Shell, arbitrary command, direct database or persistent network access | Never available from the Provider Console                                                         | Never available from the Provider Console                                                          | Never available from the Provider Console                                                          |

## Offering boundaries

### Public cloud

The existing shared Production environment is the only currently approved
runtime. The Console acts through server-side services and narrow repository/RPC
contracts. Tenant isolation continues to depend on `organizations`, active
profiles, explicit permissions and RLS; a provider operator must not obtain
authority through a tenant administrator role or client-provided tenant ID.

### Private cloud

The first private-cloud offering is a dedicated customer environment in a Salad
Soulmates-managed cloud account. The design must name the dedicated account or
project boundary, network boundary, identity boundary, backup/restore
responsibility, data residency, upgrade/migration owner and incident path. Until
that operating design is approved, the Console provides inventory only. Any
future connector is tenant-bound and may expose only explicitly declared
capabilities. Deploying into a customer-owned cloud account is a distinct future
offering, not the initial private-cloud model.

### On premises

On-premises means a customer-operated runtime with local data services. The
future agent must make mutually authenticated outbound connections, report only
allow-listed telemetry, rotate its identity, tolerate offline operation and
accept only short-lived, tenant-bound, idempotent requests. The Provider Console
does not open an inbound route into the customer network. Both Salad
Soulmates-provided appliance and customer-provided server installations are
supported deployment packages for the same release artifact and agent contract;
they differ only in infrastructure ownership and support responsibility.

## Unified customer management

The Provider Console directory is customer-first, not deployment-first. Each
customer record presents its linked tenants and environments across public
cloud, Salad Soulmates-managed private cloud, on-premises appliance and
on-premises customer-server deployments. Provider users can filter and report
by offering, lifecycle, release compatibility, health freshness and support
state, while a detail view retains the deployment-specific boundary and available
capabilities. Customer lists and aggregate metrics must remain redacted and must
not grant access to operational tenant data.

Public cloud is the initial commercial offering and the first implementation
target. On-premises and Salad Soulmates-managed private cloud are subsequent
offerings, designed in the same control plane but not represented as available
until their deployment packages, operational controls and support runbooks pass
their respective acceptance gates.

All environment records use the approved `draft`, `provisioning`, `active`,
`suspended`, `failed` and `archived` lifecycle states. `suspended` is reversible
and must deny or safely pause sessions, API mutations, jobs and integrations;
`archived` retains records and does not delete them. Purge is a separately
approved future workflow, not a state.

## Universal operation gate

Before the Provider Console exposes any mutation, all conditions below must be
true:

1. The environment declares the specific capability and its declaration has
   passed health/compatibility checks.
2. A server-side provider permission allows the real operator to request it.
3. The request includes tenant/environment scope, a reason, correlation ID,
   expiry and idempotency key.
4. The operation has input validation, expected result, failure state, rollback
   or explicit non-recoverability, and an owner runbook.
5. The Console and runtime both retain immutable, redacted audit evidence.
6. Any tenant-data support action has the required customer approval and
   expires automatically.
7. A Provider Owner approves high-risk actions: provider-role assignment,
   suspension, entitlement downgrade, export, support elevation and future purge.

## Stage 0 decisions still required

- The connectivity/proxy requirements, agent upgrade cadence,
  identity/certificate rotation, offline policy and support SLA for appliance
  and customer-server installations.
- Customer approval and visibility requirements for any future support
  elevation.
- The authoritative systems for deployment health, backups, telemetry, billing
  and usage reconciliation.
- The policy and commercial controls for a future customer account with multiple
  production tenant organizations; multiple customer environments are supported
  from launch.

## Verification needed before Stage 1

- A tenant administrator is denied all Provider Console APIs and direct RPCs.
- A provider operator cannot use a public-cloud action against the wrong tenant.
- Private-cloud and on-premises inventory cannot claim unavailable mutations.
- Connector/agent reports reject wrong tenant IDs, expired requests, replayed
  idempotency keys and incompatible versions.
- Console and runtime audit records correlate without storing secrets or raw
  tenant operational data.
