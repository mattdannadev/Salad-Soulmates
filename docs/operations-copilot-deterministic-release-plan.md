# Deterministic Operations Copilot release plan

**Status:** first-release implementation in progress; production gate open. This scope is the fixed-intent,
read-only assistant currently implemented in `src/services/operations-copilot.ts`.
It makes no AI provider call and needs no provider key. The broader
`operations-copilot-security-first-plan.md` includes later model, draft, and write
phases; those requirements do not describe the behavior of this release candidate.

## Accepted first-release contract (2026-09-27)

The owner selected administrator-only, deterministic, read-only **recipes and
orders** for the first production release. Inventory and mobile worker/receiver
summaries are deferred. Mobile pages, links, and API are behind the server-only
`MOBILE_OPERATIONS_COPILOT_ENABLED` switch, which defaults off and must remain
unset in the first production release. No provider key or model metering is needed. The
implementation selects only fixed intents; it does not accept SQL, table names,
client scope, or a tool identifier.

The proposed conservative operating defaults are 20 accepted requests per user and 100 per
organization in any rolling hour. A denied or exhausted request returns 403 or
429; requests are limited to 2,048 bytes, results to 25 rows and 32,768 bytes,
and execution to five seconds. Database reads receive an abort signal. Audit
rows record only actor, organization, facility, intent, outcome, correlation ID,
and timestamp. They contain no search text or record contents. A service-role
maintenance function removes rows after 90 days unless they are under legal hold.
The operator must approve or adjust these defaults, then schedule and verify
maintenance after migration rollout. The thresholds and retention period are
implementation proposals, not an owner-accepted business policy.

## Implementation sequence

1. Replace the service's intent branches with a static, server-only registry.
   Each descriptor must define the accepted input and validated output, required
   permissions, organization/facility scope, maximum rows and response bytes,
   source-link formatter, and read-only execution. Reject unknown intents and
   client-supplied table, SQL, organization, facility, or tool identifiers.
2. Move direct database access behind narrow data functions that reuse the
   canonical workflow reads where available. Verify that recipe, order, and
   mobile summaries match the source screens. For inventory, implement the
   aggregate/snapshot decision from above before displaying an authoritative
   on-hand balance.
3. Add a durable, server-enforced rate limit and append-only request audit with
   actor, organization, facility, intent, outcome, timestamp, and correlation ID.
   Exclude record contents and search text from the audit. Apply reviewed grants,
   RLS, and retention, then prove allow/deny behavior in a disposable database.
4. Bound request bytes, execution time, database rows, and response bytes. Abort
   underlying reads on timeout; returning a timeout response while queries keep
   running is insufficient. Return safe 400/401/403/413/429/503 responses with
   no-store headers. The request-byte bound is implemented in the route; the
   remaining limits need tests.
5. Validate the effective migration head: table grants, RLS policies, function
   owner/security/search path and execute ACL, active/suspended profiles, and
   other-organization/facility denial. Run the complete project check, local
   database suite, authenticated browser paths, independent security review,
   Preview verification, then the separately authorized release procedure.

## Current evidence and open gates

The code now has a static registry for recipes/orders, strict request validation,
default-off entitlement, database-enforced role/permission/rate gate, metadata
audit, no-store responses, bounded result rows/bytes, and abortable read timeout.
Inventory is not callable through this route or visible in its UI. The database
migration and disposable database tests are local only. Final effective-catalog
check, full project check, authenticated browser/Preview review, retention job,
independent security review, and production migration/deployment remain open.
A passing unit suite does not close the production gate.
