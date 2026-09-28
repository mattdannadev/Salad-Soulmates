# Operations Copilot Phase 0: effective-schema audit

This audit covers migration definitions and the current TypeScript read path. It is a source review plus disposable database checks, not a live catalog dump from hosted Supabase. Policies/grants below are effective only when the migrations have been applied in order.

## Surface and scope

`POST /api/operations-copilot` accepts only `recipes` or `orders`, with bounded optional search and limit (1–25). A database request gate resolves the signed-in active administrator and assigned active access profile, checks `operations_copilot_enabled()` and `products.read` or `orders.read`, and enforces durable per-user and per-organization limits. The service and database reads carry a server-owned organization and facility. The route accepts neither table names nor SQL expressions, returns no-store responses, and maps timeouts to sanitized 503 responses. The five-second signal begins at route entry, bounds auth/profile lookup and data reads, and cancels the underlying Supabase transport. See `src/services/operations-copilot.ts`, `src/app/api/operations-copilot/route.ts`, `src/lib/auth.ts`, and `src/lib/supabase.ts`.

| Check   | Referenced data                                            | Scope and bound                                      | Effective data policy                                                    |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Recipes | `recipes` (`id,name,active_version_id`)                    | Signed-in organization; sorted; at most 25 rows      | Authenticated SELECT with organization and `products.read` RLS.          |
| Orders  | `customer_orders` (`id,customer_name,reference,needed_on`) | Signed-in organization and facility; at most 25 rows | Authenticated SELECT with organization, facility, and `orders.read` RLS. |

The application permission gate is not a substitute for RLS. Migration `20260927191415_copilot_recipe_read_permission.sql` aligns recipe reads with `products.read`; recipes remain organization scoped rather than facility scoped. Inventory is deferred and rejected by the administrator Copilot route. Its separate direct-read RLS tests remain useful future-release evidence but do not authorize an inventory Copilot response.

## Entitlement and administrative control

Migration `20260927154241_operations_copilot_entitlements.sql` adds three default-off controls: organization plan ceiling `organizations.operations_copilot_plan_enabled`, profile default `access_profiles.operations_copilot_enabled`, and nullable per-user override `profiles.operations_copilot_override` (null inherits the profile default). `operations_copilot_enabled()` is `STABLE SECURITY INVOKER`, uses an empty `search_path`, derives identity from `auth.uid()` and `current_org()`, and returns false unless the caller is active, the organization active and plan-enabled, and the assigned access profile active. No caller-supplied organization or profile ID participates. Follow-up migration `20260927231547_copilot_setter_active_profile_guard.sql` requires that same active assigned profile inside both direct setter RPCs, holding a share lock on the profile and named permission row before writes. Disposable database coverage proves an active user assigned to an inactive access profile cannot call either setter or create a Copilot setting audit event.

The entitlement function revokes execute from `PUBLIC` and `anon`, granting it to `authenticated`. The two tenant-setting functions are `SECURITY DEFINER` with empty search paths; they check an active actor and organization, lock relevant rows, require `settings.manage` or `access.manage`, enforce same-organization targets, and write audit events. Execute is revoked from `PUBLIC` and `anon`, then granted to `authenticated`. Column-level insert/update grants on `access_profiles` exclude the new Copilot default column, forcing changes through the audited setter.

Migration `20260927183127_platform_operations_copilot_plan_control.sql` makes plan administration server-only. It removes `organizations` UPDATE from `authenticated`, recreates the platform organization list and plan setter as `SECURITY DEFINER` with empty search paths, revokes execution from `PUBLIC`, `anon`, and `authenticated`, and grants only `service_role`. The setter checks platform-admin membership, validates the target and reason, locks rows, changes the plan ceiling, and audits the reason. `platform_admins` is RLS-enabled with all client-role table privileges revoked (service-role SELECT only; see `20260926202013_platform_control_plane.sql`).

## Native test evidence

- `tests/operations-copilot-entitlement-database.test.ts` initializes the gate database using the named migrations (`tests/integration/postgres-bootstrap.ts`). It covers default-off and plan ceiling behavior, profile default and tri-state override, override not bypassing the plan, unauthorized/cross-organization setting changes, direct update/insert bypass attempts, anonymous execution denial, and inactive user/profile denial.
- `tests/operations-copilot-read-rls.test.ts` proves anonymous, identity-free, missing-permission, cross-organization, wrong-facility, and inactive-profile direct reads for the recipe and order surface. Recipes are organization-scoped and require `products.read`; orders also require the current facility and `orders.read`.
- `tests/operations-copilot-inventory-rls.test.ts` proves the equivalent direct read boundaries for ingredients and inventory events. Ingredients require organization scope plus `master_data.read`; inventory events also require the current facility plus `inventory.read`.
- `tests/operations-copilot-inventory-consistency.test.ts` proves the deferred inventory intent is rejected before authentication or a database read.
- `tests/operations-copilot-audit-database.test.ts` checks the durable request gate, per-user and per-organization limits, grants/RLS, append-only request metadata, and completion rules.
- `tests/api-admin-auth.test.ts` and `tests/operations-copilot-route.test.ts` cover API auth responses and cancellation behavior.
- `tests/platform-operations-copilot-plan.test.ts` covers tenant denial, direct organization-update denial, service-only platform listing and plan changes, membership validation, minimum reason validation, and audit records.
- `tests/operations-copilot-route.test.ts` and `tests/mobile-operations-copilot.test.ts` are application-level tests, not PostgreSQL policy proofs for Operations Copilot reads.

## Remaining gaps before Phase 0 can be called closed

1. Inventory remains deferred until a bounded, facility-scoped aggregate or consistent snapshot can present balances as authoritative.
2. `list_platform_organizations(actor_user_id)` takes a caller-supplied actor ID and checks that it exists in `platform_admins`; its grant is service-role-only. Correctness assumes the service credential remains server-only and application code passes the authenticated platform actor ID. Validate the caller path and service-key handling as part of platform-control review.
3. Confirm the final catalog state (RLS enabled, policies, table privileges, function owner/security/search path and EXECUTE ACL) against a migrated database, including any later migrations, before enabling the feature for production tenants.

## Evidence paths

- `supabase/migrations/20260927154241_operations_copilot_entitlements.sql`
- `supabase/migrations/20260927183127_platform_operations_copilot_plan_control.sql`
- `supabase/migrations/20260927191415_copilot_recipe_read_permission.sql`
- `supabase/migrations/20260927231547_copilot_setter_active_profile_guard.sql`
- `supabase/migrations/20260927223625_copilot_read_audit_limits.sql`
- `supabase/migrations/202609180001_foundation.sql` (base table RLS/grants, inventory, ingredients)
- `supabase/migrations/20260919155843_permissions_and_reference_options.sql` (permission-driven policies)
- `supabase/migrations/20260919055744_recipe_master_and_approved_source_import.sql` (recipe schema)
- `supabase/migrations/20260920022110_customer_order_estimates.sql` (orders RLS/grants)
- `supabase/migrations/20260926202013_platform_control_plane.sql` (platform-admin table and active/suspended checks)
- `tests/integration/postgres-bootstrap.ts`
- `tests/operations-copilot-entitlement-database.test.ts`
- `tests/operations-copilot-read-rls.test.ts`
- `tests/operations-copilot-inventory-rls.test.ts`
- `tests/operations-copilot-inventory-consistency.test.ts`
- `tests/operations-copilot-audit-database.test.ts`
- `tests/platform-operations-copilot-plan.test.ts`
- `src/services/operations-copilot.ts`, `src/services/operations-copilot-entitlement.ts`, `src/data/operations-copilot-entitlement.ts`, `src/app/api/operations-copilot/route.ts`, `src/lib/auth.ts`, `src/lib/permissions.ts`
