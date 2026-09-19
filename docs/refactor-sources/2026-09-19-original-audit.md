# Engineering refactor: audit and acceptance criteria

**Status: draft, first hardening slice. The full-codebase refactor is not complete.**

Audit date: September 19, 2026. Repository: `mattdannadev/Salad-Soulmates`.
Source baseline: `168768a2008cd87473cc6dda26d16d4fa08567c0` on `main`.

## Delivery and access status

The connected GitHub tool could read the repository. A Git tree creation request
returned HTTP 403, `Resource not accessible by integration`. These changes are
therefore delivered as local files and a Git patch, not as a committed branch or
pull request. No remote code, database records, or deployment was changed.

The local runtime could not resolve `github.com` or `registry.npmjs.org`.
Consequently, this is a patch against retrieved source files, not a complete
repository checkout with its installed dependencies. The attached original-file
manifest records the baseline file hashes. The copied actions.ts, AGENTS.md,
ESLint configuration, and package.json were independently checked against the
GitHub blob hashes before edits.

## Observed baseline

The inspected package.json pins Next.js 16.3.5, React 19.3.0, TypeScript 6.0.3,
ESLint 9.39.5, Supabase SSR 0.12.7, and Supabase JS 2.116.0. It already defines
formatting, linting, type checking, tests, and build commands under `npm run check`.
The TypeScript configuration already enables strict mode.

The root AGENTS.md contains generated Next.js guidance but not the requested
project-wide policy. ESLint loads the Next.js presets, not the complete Airbnb
configuration. The inspected tree contains `docs/ci-workflow.example.yml`, but no
active `.github/workflows` directory. The main-branch response reports
`protected: false`; repository administration was not modified.

Current implementation decisions specify one hosted Supabase database and local,
disposable PGlite database tests. This refactor does not create another hosted
database or write test data into the shared one.

## Defects identified and changes prepared

| Area | Existing behavior | Change in this patch |
| --- | --- | --- |
| Callback redirect | A slash followed by a backslash passes the internal-path check and resolves to another origin. | Validate input, normalize the URL, enforce the same origin, and reject a normalized double-slash path before the subsequent URL resolution. |
| Cookie persistence | A comment-only catch suppresses every cookie-write exception. | Preserve the known read-only Server Component recovery case with a safe diagnostic; propagate unexpected writer failures with their causes. |
| Sign-out | Both callers discard the SDK error result and then redirect. | Use a typed helper that rejects SDK errors, invalid responses, and transport failures. Do not redirect to success after an error. |
| Password update | The getUser error result is discarded. | Handle the session-verification error explicitly. Distinguish successful password change from a subsequent failed sign-out. |
| Inventory retry | An error reading the prior request can be misreported as conflicting data. | Handle the lookup error separately and instruct the user to retry the same entry. UI retry behavior still needs integration verification. |

The redirect fix deliberately sends malformed/unsafe destinations to `/app`.
Normal internal paths, query parameters, and fragments remain supported. Inputs
longer than 2,048 characters are rejected. Encoded separators must not result in
an external origin when the returned destination is used as a redirect.

Cookie writes are not transactional: an unexpected later failure can occur after
an earlier write. The helper stops and reports failure; it does not claim to roll
back already-written cookies. The read-only error-message contract must be
verified against the installed, pinned Next.js version before merge.

## Standing policy and automated enforcement prepared

- AGENTS.md: the requested language/style policy, explicit error handling,
  validation, modularity, documentation, constants, and behavior-preserving
  refactoring requirements for existing and future work.
- Copilot repository instructions and a pull-request review checklist.
- Additional ESLint safety rules, including detection of comment-only catches,
  and a lint command that permits zero warnings.
- A GitHub Actions workflow definition using the runtime already specified by
  the repository's CI example, running `npm ci` and `npm run check`.
- Forty focused regression tests and updated Vitest discovery for the new test
  file. No new dependencies or lockfile changes are required by this slice.

**The ESLint additions are a safety subset, not complete Airbnb enforcement.**
Neither the written policy nor the workflow definition proves compliance or
production readiness. Branch protection requires a separate authorized setup
after the checks actually pass. No workflow has run for this local patch.

## Verification actually performed

| Check | Result | Scope and limitation |
| --- | --- | --- |
| Original callback logic reproduction | Off-site redirect reproduced | Executed the inspected validation expression with a slash/backslash destination in Node.js. |
| Focused regression assertions | 40 passed; 0 failed; 0 skipped | Node.js 22.16.0 with native experimental TypeScript stripping. The test's runner import was changed from Vitest to node:test in a temporary copy; the assertions and application helper sources were unchanged. This is not a run of the repository's pinned Vitest. |
| Independent helper type checking | Passed | Locally available TypeScript 5.8.3, strict mode, noUncheckedIndexedAccess, and exactOptionalPropertyTypes. Only the three dependency-free helpers were checked, not the full application or pinned TypeScript 6.0.3. |
| ESLint configuration syntax | Passed | `node --check`; this does not execute ESLint rules or resolve plugin compatibility. |
| Git patch verification | Passed | Applied cleanly to a fresh copy of the retrieved baseline files; resulting files matched the delivered replacements. This does not establish compatibility with later repository commits. |
| Full application checks | Not run | npm ci, pinned Prettier/ESLint/TypeScript/Vitest, existing database tests, Next.js build, browser tests, and live authentication integration remain unverified. |

See `verification/` in the delivery package for the actual isolated-run output.
Node reported experimental type-stripping and module-detection warnings in the
standalone harness; they were not suppressed or "fixed" by changing the app's
module configuration.

## Remaining required work

1. Obtain a complete checkout at the current commit and install the pinned
   dependencies. Run and record the existing baseline, then the patch's complete
   `npm run check`. Resolve all failures without weakening the standards. Check
   the installed Next.js documentation, cookie error contract, SDK signatures,
   password reset, sign-out, and Server Component session refresh behavior.
2. Configure complete, compatible Airbnb JavaScript/React enforcement and
   TypeScript-aware promise/unsafe-operation checks. Update and verify the
   lockfile if dependencies change. Document framework-mandated conventions;
   do not silently replace the requested guide with a weaker configuration.
3. Add action-level characterization and regression tests, then split the large
   saveRecord action into focused, validated operations. Cover permissions,
   invalid input, SDK errors, transport failures, inventory duplicates/retries,
   and the success/failure redirects changed by this patch.
4. Audit all application code: authentication/profile loading, proxy handling,
   queries, forms, ingredient import, domain logic, and implemented workflows.
   Replace unchecked casts with generated database types and appropriate runtime
   validation. Reconcile schema types and versioned migrations using authorized
   reads; do not invent schema or modify hosted data during this audit.
5. Review unit conversion, decimal precision, recipe versions, lot/date handling,
   concurrency, transaction boundaries, idempotency, observability, and mobile
   usability. Preserve confirmed operational rules; test negative paths and the
   actual supported workflows. Scope the audit to implemented code rather than
   building unimplemented product modules as part of the refactor.
6. Add relevant browser and local database integration coverage. Pin third-party
   workflow actions to reviewed immutable references as part of supply-chain
   hardening. Make successful quality checks required on main and require review
   through authorized repository administration; verify the resulting settings.

## Completion criteria

All in-scope hand-written code is reviewed against AGENTS.md. Compatible full
style/type-safety enforcement is active. The complete checks pass on the actual
proposed commit. Critical workflows and failure paths have regression coverage,
including relevant browser and local database integration tests. Remaining risks
are explicit. Changes are reviewed before merge and separately authorized before
production deployment. Until then, this work remains a draft refactor.

## Source records

Source files were retrieved through the connected GitHub tool at the exact
baseline commit, including AGENTS.md, package.json, tsconfig.json,
eslint.config.mjs, vitest.config.ts, src/app/actions.ts,
src/app/auth/callback/route.ts, src/lib/supabase.ts, docs/decisions.md,
and docs/ci-workflow.example.yml. Public references consulted were the official
Airbnb JavaScript guide, Next.js cookies documentation, Supabase signOut and
server-side authentication documentation, and OpenAI AGENTS.md guidance.
