# Repository engineering instructions

Read and follow root `AGENTS.md`, `docs/decisions.md`, and `docs/build-plan.md` for every change. Existing code is in scope. Do not weaken rules, hide errors, skip tests, or claim completion from partial checks.

During review, flag unchecked trust boundaries, ignored SDK errors, swallowed failures, success redirects after failed writes/sign-out, duplicate inventory postings, changes to immutable records, tenant/facility isolation failures, and operational changes disguised as refactoring. Require meaningful regression tests and the complete check results.

Keep incomplete work draft. Do not merge, deploy, or write test data to the shared hosted database. The current evidence and open acceptance gates are in `docs/engineering-refactor.md`.
