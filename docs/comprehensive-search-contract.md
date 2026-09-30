# Comprehensive search contract

Status: implementation foundation

Global search is permission-aware discovery over canonical records. It is not a
client-side copy of tenant data and never returns a record, count, hint, or rank
for a resource the current caller cannot read.

## Searchable families

Customers, orders, suppliers, ingredients, products, recipes, allergens,
purchases, receipts/packages/lots, inventory/traceability references, schedules,
users, access profiles, access requests, login history, and permitted settings.
Each result must contain a canonical route, localized record type, primary label,
safe secondary context, and a source-domain grouping.

## Service contract

`searchWorkspace({ query, limit, cursor })` runs in the service layer after the
authenticated caller and organization/facility scope are resolved. Each data
adapter applies its own read permission and RLS-scoped query. The service merges
only permitted result sets, deduplicates canonical records, ranks exact ID/code
matches before normalized prefix/subsequence matches, and returns a stable
cursor. The presentation layer must not directly query Supabase or infer access
from sidebar visibility.

## Matching and typo tolerance

Normalize case, punctuation, whitespace, accents, and common unit/reference
separators before matching. Rank exact normalized matches, token-prefix matches,
and bounded edit-distance/subsequence matches. Keep the original query and the
matched field for explainable result labels. Do not silently broaden a short or
empty query into a tenant-wide directory; require at least two meaningful
characters before running a cross-family search.

## Safety and verification

- Enforce organization/facility scope and permission checks in every adapter.
- Never return hidden record names in no-result, spelling-correction, or count
  messages.
- Preserve `returnTo` search context when opening a result.
- Test typo ranking, duplicate suppression, cursor stability, each permission
  denial, cross-tenant negatives, and canonical-route output.
