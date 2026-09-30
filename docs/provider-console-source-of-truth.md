# Provider Console source-of-truth map

Status: Stage 0 baseline — 2026-09-29.

This map is the prerequisite for Provider Console schema and UI work. It keeps
the console a control plane: it may hold commercial, deployment and support
metadata, but it does not duplicate a tenant runtime's operational data,
credentials or authorization decisions.

## Glossary

| Term                   | Meaning                                                                                                                                                                                              | Canonical record now / later                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Customer account       | The commercial customer relationship. It can ultimately link to more than one production organization.                                                                                               | `customer_accounts` (new, Stage 2)                                               |
| Tenant                 | A customer-isolated application organization. The launch default is one production tenant per customer account.                                                                                      | `organizations`                                                                  |
| Data plane             | Application/database environment that stores tenant operational data. Standard public cloud shares one under logical isolation; dedicated/private and on-premises use customer-specific data planes. | Tenant runtime                                                                   |
| Provider Control Plane | Provider-only commercial, deployment, entitlement and audit metadata. It does not store tenant operational records.                                                                                  | Separate control-plane database before dedicated/private or on-premises delivery |
| Facility/site          | A real operational customer facility. It is not the Salad Soulmates web application or a subscription.                                                                                               | `facilities`                                                                     |
| Environment            | A deployment associated with a tenant, such as Production or an independently provisioned Sandbox.                                                                                                   | `tenant_environments` (new, Stage 4)                                             |
| Offering               | Public cloud, Salad Soulmates-managed private cloud, or on-premises.                                                                                                                                 | `tenant_environments.offering_type` (new, Stage 4)                               |
| Provider operator      | A Salad Soulmates employee operating the control plane under a provider role.                                                                                                                        | Auth user plus `provider_role_assignments` (new, Stage 1)                        |

## Canonical ownership

| Information                                                    | System of record                                                     | Provider Console representation                                    | Boundary                                                                                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant identity, slug and current legacy lifecycle             | `organizations`                                                      | Tenant directory summary; later account link                       | The console does not create a duplicate tenant identity.                                                                                                        |
| Facilities / operational sites                                 | `facilities`                                                         | Aggregate/count only until a tenant-detail permission is designed  | A facility is operational data; its rows remain tenant-scoped.                                                                                                  |
| User identity and tenant membership                            | Supabase Auth, `profiles`, `access_profiles`                         | Active production enabled-user aggregate only                      | No profile email, raw identity or membership is released through the first provider read slice.                                                                 |
| Tenant permissions                                             | `access_profiles`, tenant permission model and tenant RLS            | None                                                               | Provider roles are separate and never inferred from tenant roles.                                                                                               |
| Existing platform operator access                              | `platform_admins`                                                    | Legacy `/admin` compatibility only                                 | It is not automatically a Provider Owner assignment.                                                                                                            |
| Provider roles and explicit permissions                        | New `provider_roles`, `provider_role_assignments`                    | Provider Console access control                                    | Introduced only with narrow audited server/RPC checks.                                                                                                          |
| Customer commercial relationship and contacts                  | New `customer_accounts`, `customer_contacts`, `tenant_account_links` | Customer directory                                                 | Do not infer a customer record from organization name.                                                                                                          |
| Environment / offering / deployment inventory                  | New `tenant_environments`                                            | Environment directory and capability labels                        | Read-only inventory precedes remote actions.                                                                                                                    |
| Application version, schema compatibility and connector status | Environment runtime / agent attestation                              | Sanitized, freshness-labeled environment inventory                 | No shell, raw database, secret, or unrestricted diagnostic access.                                                                                              |
| Secrets and credentials                                        | Environment-specific secret system                                   | Secret reference, rotation state and access audit only when needed | Secret values never enter Provider Console storage, logs or UI.                                                                                                 |
| Pricing and entitlements                                       | Approved commercial policy and later entitlement records             | Pricing package/reference and entitlement state                    | The approved pricing direction is an operational facility/site base plus scale, package and support bands; it is not a per-user or flat-per-facility rate card. |
| Usage                                                          | Append-only event producer and reconciled rollups                    | Time-bounded, definition/freshness-labeled aggregate               | No event becomes billable until its metering and correction contract is approved.                                                                               |
| Provider actions and audit                                     | New `provider_audit_events`; tenant/runtime audit where applicable   | Redacted, immutable audit lookup                                   | Record real actor, effective permission, target, reason, correlation, outcome and timestamp.                                                                    |

## First Provider Console delivery boundary

The first delivery is a separate `/admin/provider` read-only public-cloud tenant
directory and tenant detail. It reuses the existing organization records and
shows only tenant-safe operational summary fields: identifier, name, slug,
lifecycle status, creation time, enabled-user aggregate and facility aggregate.
It does **not** add customer records, environments, health, usage, billing,
on-premises inventory or mutations.

The route must use the dedicated `tenants.read` provider permission, narrow
server-only repository/service calls, and redacted immutable audit events. A
successful directory read records `PROVIDER_TENANT_DIRECTORY_READ`; a successful
detail read records `PROVIDER_TENANT_DETAIL_READ` with its target organization
and effective permission. It does not replace `/admin`; that portal's existing
mutations stay behind the legacy `platform_admins` control until each is migrated
deliberately.

## Stage 0 acceptance and open decisions

The glossary, lifecycle model, pricing direction and deployment capability matrix
are now recorded. The founder is the intended initial Provider Owner. Before the
assignment migration runs, the founder must provide or approve the exact
production Auth user UUID (or exact account email for a privileged one-time
lookup), and the migration must record that explicit assignment with a reason.
Do not promote all current `platform_admins` automatically: that would broaden
existing authority without an audited decision.

Provider Owners will later assign and revoke the approved provider roles through
an Owner-only, audited control. That mutation additionally needs an accepted
recent-authentication policy; it may not rely on a client-supplied timestamp.

Private-cloud and on-premises rows remain a later inventory capability. They may
not render provider-action controls until their connector/agent identity,
declared capabilities, support approval, upgrade, certificate, connectivity and
offline-operation contracts are accepted.

## Linked records

- [Provider Console build plan](provider-console-build-plan.md)
- [Deployment capability matrix](provider-console-deployment-capability-matrix.md)
- [Owner decisions](decisions.md)
