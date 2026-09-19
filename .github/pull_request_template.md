## Problem and resulting behavior

Explain the concrete problem, what changes, and the user-visible result. Link the applicable build-plan phase and decisions.

## Validation

Record exact commands/results, relevant regression coverage, browser and disposable database checks, and unrun checks with reasons.

## Review checklist

- [ ] Root AGENTS policy followed across changed and affected existing code.
- [ ] Runtime validation, authorization/RLS, SDK errors, rejected promises, and safe diagnostics reviewed.
- [ ] Routes, public contracts, date/unit/recipe rules, inventory history, and retry behavior preserved.
- [ ] Complete `npm ci` and `npm run check` pass on the proposed commit.
- [ ] Relevant browser and integration gates pass; limitations and concurrency risks are documented.
- [ ] Migration history and generated types reconciled; no hosted test records or destructive migration side effects.
- [ ] Remaining work is explicit and this PR stays draft while acceptance is incomplete.

Merge and production deployment require their own review/authorization. A workflow definition alone is not proof that required checks are active.
