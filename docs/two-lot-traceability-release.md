# Two-lot traceability release gate

Status: **blocked — not a releasable capability in this repository state**.

This gate deliberately separates the implemented receiving/serialization and
production-preparation slices from a claim of end-to-end two-lot traceability.
It must be completed before applying a new migration, deploying an application,
or representing a finished product as recall-ready.

## Verified current boundary

`20260920031357_receiving_serialization.sql` establishes immutable source-package
identities and source supplier lots. `20260920032256_order_production_planning.sql`
creates planned mixer/spice-preparation work, but deliberately makes no inventory
posting. There is currently no schema for physical source allocation to a mixer
or spice-preparation batch, no finished production lot, and no backward or
forward recall query/workspace. Packaging and shipping migrations also explicitly
defer finished-stock allocation and fulfillment.

Accordingly, `src/lib/database.types.ts` cannot truthfully be regenerated for a
two-lot allocation/recall schema: no such migration exists in the checked-out
migration order. Do not add hand-authored placeholder types or claim generation
provenance. After the approved additive migration is present and applied to a
disposable database, regenerate types using the project-approved Supabase schema
workflow, commit the result, and prove every new table, view, and RPC is present.

## Historical-data preflight and containment

Never infer a supplier lot, physical package, or allocation from a receipt amount,
purchase order, ingredient, or date. Legacy posted receipts without a verifiable
supplier lot/physical source must remain unallocated and be reported as
`incomplete historical traceability`, with a reason and source-record reference.
They are ineligible for a complete two-lot allocation or recall-completeness
claim. Existing receiving serialization already rejects missing required supplier
lots and does not repost inventory when older receipts are serialized.

Before release, run a read-only scoped preflight against the target facility to
identify posted receipt lines with an empty supplier lot, no serialization, or an
unverifiable source link. Have the data owner approve every backfill from an
authoritative receiving record. Retain evidence for each approved link; do not
perform a bulk guessed backfill.

## Required acceptance evidence

The release candidate must prove all of the following in disposable local data:

1. Receive two distinct serialized source lots/packages, then allocate valid
   quantities from both to one physical production batch. Reject unavailable,
   held, expired, over-allocated, duplicate, stale, malformed, and cross-facility
   allocations.
2. Preserve immutable allocation edges, quantity, actor, timestamp, source
   supplier lot, and finished production lot. A retry must be idempotent and a
   conflicting retry must fail without extra consumption.
3. Run backward recall: product plus finished lot resolves to its production
   batch and both source packages/lots. Run forward recall: a source package or
   supplier lot resolves to every affected finished lot and all implemented
   downstream destinations. A lot-only ambiguous lookup returns candidates; it
   must not silently select a product.
4. Display incomplete historical traceability as incomplete, never as a completed
   recall chain.
5. Prove RLS and API hardening for administrator, worker, reviewer, receiver,
   another facility, another organization, and anonymous access. New tables/views
   must use facility-scoped policies, same-scope foreign keys, invoker-safe RPCs,
   explicit grants, immutable direct-write denial, and no anonymous execution.
6. Exercise the complete receive → allocate → backward/forward recall path at
   desktop and 390px phone width, including scan/keyboard entry, no page errors,
   and `documentElement.scrollWidth <= innerWidth`.

Add the migration to the disposable database loader and cover competing allocation
and retry cases in the native PostgreSQL suite. The existing browser tests cover
receiving serialization and planning separately, not this combined path.

## Release procedure

1. Review the additive migration, generated database types, permissions/RLS,
   backfill evidence, and schema order; do not apply it to hosted data yet.
2. Run `npm run check`, `npm run test:postgres` against the isolated local
   PostgreSQL 17 database, and `npm run test:browser`. Record exact outputs and
   the candidate commit.
3. Obtain independent review plus owner acceptance of the two-lot operational
   workflow. Real Auth/session validation and physical scanner/printer acceptance
   remain separate gates.
4. Only after explicit authorization, apply the single approved migration once,
   deploy the matching application, and perform an authorized operational smoke
   test with real records. Do not seed the hosted database for verification.

## Containment / rollback

If an allocation or recall result is questionable, stop production release and
fulfillment for the affected finished lots, retain the immutable evidence, and
quarantine the implicated source packages through the existing controlled package
workflow. Do not delete or rewrite allocations to make the trail appear complete.
Use a separately reviewed corrective event/migration after determining scope.

This document records release readiness only. It does not authorize a hosted
migration, deployment, production hold, backfill, or recall action.
