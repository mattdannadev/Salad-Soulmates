# Continue Salad Soulmates development

Start with [the project index](README.md) and [root engineering policy](../AGENTS.md).
Use the existing repository `mattdannadev/Salad-Soulmates`.

## Verified repository checkpoint — September 20, 2026

Main was inspected at `3262e179a258c3cf1ae261f4f1bbae55dd5032d1`.
GitHub reports PRs [#1](https://github.com/mattdannadev/Salad-Soulmates/pull/1),
[#2](https://github.com/mattdannadev/Salad-Soulmates/pull/2),
[#4](https://github.com/mattdannadev/Salad-Soulmates/pull/4),
[#5](https://github.com/mattdannadev/Salad-Soulmates/pull/5), and
[#6](https://github.com/mattdannadev/Salad-Soulmates/pull/6) merged.
PR #3 is closed without merging; do not treat it as a separate delivered release.
There were no open PRs at this checkpoint before this documentation change.

Main includes engineering refactoring, order-driven purchasing and customer terms,
receiving/physical serialization, and order-linked production preparation.
See the feature documents for test and migration evidence from those releases.
This documentation checkpoint does not independently verify deployed app state.

**Next feature: scheduling and worker schedule**, subject to the remaining acceptance
items in the build plan. Physical production execution/consumption, packaging,
shipping, reference-data completion, recipe development/testing, recall and
QuickBooks scope remain tracked; product-grid replacement stays last in the
approved near-term sequence. Recipe-development placement needs an explicit
sequencing decision before it displaces a scheduled phase.

## Every session

1. Inspect current main, open PRs, local changes and nested AGENTS instructions.
2. Read decisions.md, build-plan.md and the relevant feature/acceptance documents.
3. Work in a focused branch. Reconcile concurrent changes; preserve existing work.
4. Implement the approved scope and keep plan, decisions and acceptance evidence
   current in the same PR.
5. For code changes run the required checks in AGENTS.md and relevant browser and
   disposable database coverage. For documentation-only changes verify links,
   source accuracy and the diff; report application tests as unrun.
6. Report delivered scope, PR/commit, verification, remaining gates and next step.
   Do not present a merged change as verified production deployment.

## Standing constraints

Preserve the single hosted database, real authorization and facility isolation,
immutable recipe/order snapshots, inventory history, idempotency and mobile access.
Tests use disposable environments; never add sample operating data to hosted data.
Keep real-Auth, independent review and physical printer/scanner acceptance visible.
Apply release authorization to its actual scope; earlier release approvals are not
blanket permission for unrelated production or database changes.

[Historical refactor recovery notes](history/continuation-2026-09-19.md) retain the
earlier checkpoints. Their access failures, local paths, test totals and restrictions
describe those historical tasks, not the current repository.
