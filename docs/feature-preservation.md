# Feature preservation and remaining build scope

Checked September 19, 2026 against current remote main
`028880cebe49140271ce37f69ed6ddd406a79640` and the refactor checkout.

The original isolated Preview granted its synthetic administrator only five
permissions. That hid seven existing menu destinations. No newer GitHub commit
was omitted: remote main still matches the refactor's original baseline. Products
and Recipes were placeholder pages in that baseline; the recipe schema and
illustrative builder mockups did not constitute a working recipe editor.

## Existing routes retained

| Area                | Routes                                                                                    | Current implementation                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                | `/app`                                                                                    | Existing dashboard retained.                                                                                                                                                     |
| Ingredients         | `/app/ingredients`                                                                        | Ingredient editing, reviewed Spanish names, allergens and supplier packs retained; `/app/allergens` remains available.                                                           |
| Suppliers           | `/app/suppliers`                                                                          | Existing supplier maintenance retained.                                                                                                                                          |
| Products            | `/app/products`                                                                           | Now reads persisted product, packaging and linked recipe data under existing RLS.                                                                                                |
| Recipes             | `/app/recipes`, `/app/recipes/[id]`                                                       | Now reads recipes, released/draft/retired version history, preparation sections, ingredients, quantities, notes and quality checks. Active released versions remain the default. |
| Inventory           | `/app/inventory`                                                                          | Existing ledger, balances, opening/adjustment forms and retry safeguards retained.                                                                                               |
| Receiving           | `/app/receiving`, `/receiving`                                                            | Existing receipts, receiver screen, feedback and request-id handling retained.                                                                                                   |
| Access              | `/app/access-requests`                                                                    | Existing review/invitation/approval workflow retained; partial failures have explicit recovery guidance.                                                                         |
| Settings            | `/app/settings`                                                                           | Existing access profiles, permissions and reference-list administration retained.                                                                                                |
| Feedback            | `/app/feedback` and existing drawer                                                       | Existing submission and review retained.                                                                                                                                         |
| Orders and planning | `/app/orders`, `/app/planning`                                                            | Existing phase gates retained; operational workflows remain in the approved build plan.                                                                                          |
| Team and worker     | `/app/team`, `/worker`                                                                    | Existing phase gates/shell retained; scheduling, PTO and Spanish mobile production remain required.                                                                              |
| Account access      | `/login`, `/register`, `/access`, `/forgot-password`, `/reset-password`, `/auth/callback` | Existing routes retained; service-failure handling and deployment-specific callbacks hardened.                                                                                   |

The Preview now grants all 19 seeded administrator permissions. A regression test
compares its permission set with the migration seed. Synthetic examples populate
recipe/product/ingredient screens and selected settings so these views can be
reviewed. They are clearly labeled UI examples, not approved formulations or
shared-database records. Business-data writes remain disabled.

## Requirements still included in the build

The latest delivery order remains in `build-plan.md`. Preserve the following
requirements when completing those phases; the absence of a finished screen
must not silently remove them from scope:

- Recipe authoring/builder, new drafts and revisions, controlled release,
  immutable released versions, sections/stages, approved operator instructions,
  quality checks and scaled batch/worksheet preview. Current work adds browsing;
  it does not claim to implement these editing workflows.
- Carry-forward recipe requirements: taste-test records, shelf-life testing and
  linkage to the recipe revision being evaluated. Complete their data and
  acceptance design with the recipe authoring work; do not invent results.
- Released-recipe materials calculation, inventory availability, purchasing
  recommendations and PO drafts. Do not transmit supplier orders automatically.
- Receiving completion, serialization, supplier lots and approved lot/date rules.
- Customer orders and production planning, using pinned released recipe versions.
- Administrator scheduling, draft/publish revisions, assignments/conflicts, PTO,
  and worker-visible published schedules.
- Spanish-first mobile batch worksheets, step progression, controlled ingredient
  and instruction translations, mixer execution and serialized package usage.
- Packaging, shipping, reference-data completion, and the third-party product
  grid replacement last.

Product and recipe browsing is an explicit addition requested while preserving
the refactor. Recipe authoring acceptance must precede relying on author-created
recipes for materials/planning. This dependency does not reorder the owner's
remaining delivery phases or imply that gated modules are finished.

## Original handoff reattached by the owner

The September 16 START_HERE, PRD v1.3, desktop/mobile HTML mockups and discovery
worksheet were rechecked during this continuation. The worksheet is unfilled;
its `[Type here]` prompts are questions, not confirmed operating rules. The HTML
files explicitly simulate records and reset on reload. Later September 18 build
specification/PRD decisions continue to govern sequencing and operational details.

The original handoff additionally preserves full administrator access on phones,
prep-bucket filling history/checklists, storage-versus-staged accounting without
double consumption, customers, configurable packaging/labels, source-to-shipment
and reverse traceability, hold/release and recall evidence, exports, and QuickBooks
invoice review/synchronization with duplicate prevention. These are not removed.
The current build specification places dedicated trace/recall and QuickBooks in
subsequent increments. Keep those items explicit after the approved near-term
phases; the mockups are not evidence that the deployed backend implements them.

Latest owner instruction: the administrator must have full access. The isolated
test administrator has every seeded permission and every existing administration
route. Keep equivalent feature access on desktop and phone; worker restrictions
must not be applied to administrators. Preview business-data writes remain
disabled by the isolation boundary, independently of the administrator's role.
