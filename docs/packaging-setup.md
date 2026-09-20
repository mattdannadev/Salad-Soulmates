# Packaging and label setup

The owner moved packaging setup ahead of scheduling and explicitly deferred
production completion and tank transfers. One label goes on every bag. Start with
a 3-inch wide by 5-inch high label; dimensions remain editable for later changes.

## Delivered behavior

Open Products, then expand **Packaging & label setup** under a product. Existing
bag/case defaults initialize the editor; the standard product defaults are one
gallon per bag and four bags per case. Label dimensions initially use 3 × 5 inches.
The product's approved ingredient wording is copied when available; recipe lines
are never converted into an ingredient statement.

Saving a draft creates an immutable version without changing product defaults.
Approving a version requires ingredient wording and explicitly confirms that
content, then updates product bag/case defaults and the ingredient statement in
the same transaction. Future default-packaging orders use those values. Existing
customer options and saved order packaging/price snapshots remain unchanged.
The label display name is independent of the catalog product name.

Every save appends a version. The latest approved version remains visible even
when a newer draft exists. History retains content, dimensions, template identity,
creator, approval actor and timestamps. Preview content is marked SAMPLE and
uses no real lot identifier. The preview illustrates layout; final printer fit,
stock, margins and font sizing remain part of production-label implementation.

## Data and access

`20260920051807_packaging_setup.sql` adds `packaging_profile_versions` and the
invoker RPC `save_packaging_profile`. Product setup is organization-scoped, like
the existing Products catalog; it is shared by facilities within that organization.
Reading requires `products.read`; writing also requires `products.write`.
Anonymous access is revoked. Table INSERT validation applies to direct API writes
as well as RPC calls; app roles cannot update or delete prior versions.

A product row lock serializes version creation. Expected-version checks reject
stale edits. Identical retries with the same request ID return the original result;
reusing an ID with different content is rejected. Audit records accompany saves.
Approval attribution is assigned by the database, never trusted from a client.

## Validation and release

Validation commands and final results are recorded in the PR. Tests cover input
bounds, approval requirements, default activation, immutable history, retries,
stale writes, direct API checks, cross-organization access, read-only access,
saved-order preservation, and desktop/phone editing. Native PostgreSQL tests cover
overlapping approvals and conflicting edits. All fixture records are disposable.

Local verification used `npm ci --no-audit --no-fund --offline=false` and
`npm run check` (formatting, zero-warning lint, strict types, 289 tests and the
production build passed). Browser checks used `npm run test:browser -- --config
playwright.local.config.ts` with the installed Chrome executable after downloading
the pinned Chromium timed out. The 14 existing desktop/phone cases passed; the
two packaging cases then passed after correcting history selectors and an actual
phone table-overflow defect. A regression now checks internal table overflow,
and both screenshots were visually reviewed. The temporary local browser config
was removed; CI continues to use its pinned browser.

Native `npm run test:postgres` could not start locally (`ECONNREFUSED` on the fixed
disposable port `127.0.0.1:55432`). Its 22 cases, including two new overlapping
packaging cases, must pass in CI. Initial formatting checks exposed Windows CRLF
checkout conversion; `.gitattributes` now preserves LF to match the existing
mandatory lint rules without weakening them.

The migration must be applied before deploying the dependent Products page.
The owner subsequently authorized all outstanding PR merges and deployment. The additive migration was applied to the existing hosted project on September 20. SQL is unchanged from candidate 20260920043402; do not apply both timestamps. Hosted RLS and immutable grants are verified, with no new security-advisor findings and no sample records.
Real Auth acceptance, independent review and physical printer checks remain open.
This does not implement filled-bag recording, waste, tank transfers, finished-goods
inventory, production-lot labels, print events or shipping. Those require the
later production/tank workflow and physical printer details. Scheduling remains
in the build plan.
