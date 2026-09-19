# Mandatory engineering standards

These instructions apply to the entire repository: existing code, new features,
bug fixes, refactors, tests, scripts, migrations, and documentation examples.
Apply them without asking the user to repeat them. Existing code is not exempt.
This file is the canonical engineering policy. Do not silently weaken it.

## Coding standards and style

- JavaScript and TypeScript must follow the Airbnb JavaScript Style Guide and
  applicable React guidance. Keep TypeScript strict. A partial ESLint ruleset
  does not demonstrate full Airbnb compliance.
- Python must follow the Google Python Style Guide and PEP 8.
- Other languages must follow their official or widely accepted community guides,
  such as Google Java Style and Rust API Guidelines.
- Use modular, single-responsibility functions with explicit, descriptive names.
  Avoid cryptic abbreviations, speculative abstractions, and needless indirection.
- Use clear JSDoc, docstrings, or strong types. Document public contracts,
  invariants, side effects, and non-obvious decisions. Do not write comments that
  merely repeat the implementation.
- Extract meaningful magic numbers and strings into named constants or
  configuration. Preserve business rules when moving their values.

## Validation, errors, and reliability

- Validate all input arguments before core logic. At trust boundaries use runtime
  validation: TypeScript does not validate form data, URL parameters, imports,
  external API responses, or persisted records by itself.
- Explicitly handle, log, or throw every potential error path. Never use empty or
  comment-only catch blocks, `pass` to suppress errors, or generic Python
  `except Exception:` without logging or re-raising.
- Check both rejected promises and SDK responses containing an `error` result.
  Never report a failed write, failed lookup, or failed sign-out as success.
- Recovery must be specific and documented. Preserve error causes and propagate
  unexpected failures. Keep framework redirects/not-found control flow outside
  broad catches. Do not blindly wrap every function in try/catch.
- Return actionable, safe user messages. Use structured operation identifiers
  and safe error codes in logs; do not log passwords, tokens, cookies, privileged
  keys, personal information, submitted forms, or raw database queries.
- Preserve server-side authorization, organization/facility isolation, row-level
  security, immutable released records, and inventory idempotency.
- Never expose service-role credentials to the browser. Do not use unchecked
  casts, `any`, non-null assertions, skipped tests, lint suppressions, or weaker
  compiler settings to conceal defects. Review existing instances explicitly.

## Existing-code refactor workflow

1. Inspect the actual repository, branch, dependency versions, requirements,
   tests, and deployment configuration before changing code. Do not rebuild a
   replacement app or invent database schema from memory.
2. Record a reproducible baseline. Add characterization tests before restructuring
   and a regression test for every corrected defect.
3. Refactor in small, reviewable increments. Preserve routes, public contracts,
   interface behavior, stored data, and business workflows unless an intentional
   change is requested or a confirmed defect is being fixed. Explain each change.
   Rewrite a module when warranted, not the entire app by default.
4. Separate UI, validation, business logic, and data access appropriately. Keep
   the architecture proportional to this application's needs.
5. Run `npm ci` and `npm run check`: formatting, linting, type checking, automated
   tests, and a production build. Run relevant browser and integration tests too.
6. Cover invalid input, missing records, unauthorized access, duplicate submissions,
   conflicting writes, external failures, retries, and empty/loading/error states.
7. Report changed files, exact commands, test results, remaining risks, and unrun
   checks. Never declare production readiness or full-codebase compliance based
   on a partial audit or a passing subset of tests.
8. Keep incomplete work in a draft PR. Do not merge, deploy to production, alter
   production records, or apply destructive migrations as a side effect of a
   code-quality refactor.

Do not bypass checks to obtain a green build. Resolve real framework/TypeScript/
lint-tool compatibility issues without silently weakening the requested style
or security standard. Enforce mechanically testable requirements in CI; use
review for design quality and other requirements that lint cannot prove.

For genuine ambiguity in performance, type safety, or environment constraints,
inspect existing source and decisions first. Ask a focused question before
finalizing code only when a consequential constraint remains unresolved. Do not
ask again for information already supplied.

## Code Review Rules

Flag swallowed exceptions, ignored SDK errors, success redirects after failures,
missing validation/authorization, unsafe redirects, duplicate inventory postings,
and operational changes disguised as refactors. Require tests for corrected
failure paths. Do not approve incomplete enforcement as complete compliance.

## Salad Soulmates preservation requirements

Read `docs/decisions.md` and current owner decisions before older requirements
or mockups. Preserve incremental delivery, approved lot/date rules and facility
timezone, units/conversions, recipe/version invariants, inventory history,
tenant isolation, scheduling, and mobile/worker workflows. Follow the existing
one-hosted-database decision; database tests use disposable local databases and
must not write sample records to the shared hosted database.

See `docs/engineering-refactor.md` for completed changes and remaining acceptance
criteria. These standards are mandatory; that audit must distinguish the target
standard from what has actually been implemented and verified.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
