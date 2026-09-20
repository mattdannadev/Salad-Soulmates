# Task-scoped documentation index

Use this index from ChatGPT Work, Codex, an IDE, or a human development session.
The repository is the durable project record; a new conversation must not depend
on previous chat history. Load the smallest set of documents that safely answers
the task, then expand context only when the work shows it is needed.

## Always load for a task

1. [Engineering policy](../AGENTS.md).
2. The source files and tests directly relevant to the requested change.
3. Any nested instruction file that applies to those files.
4. Current branch, working-tree, `main`, and open-PR state.

## Route by work type

| Task | Load these documents in addition to the always-load context |
| --- | --- |
| General code change or bug fix | The directly affected feature document, if one exists; [database setup](database.md) only for database/data-access work; [review gates](review.md) only when release/review evidence is relevant. |
| Materials requirements or purchasing | [Materials and purchasing](materials-purchasing.md). |
| Receiving or serialization | [Receiving and serialization](receiving-serialization.md). |
| Customer orders or production planning | [Order-linked production preparation](order-production-planning.md) and [customers and operations dashboard](customer-dashboard.md) when the customer or dashboard behavior is affected. |
| Scheduling or worker schedule | The relevant scheduling requirements in [Build Specification v1.1](requirements/Salad_Soulmates_Build_Specification_v1.1.md) and [PRD v2.2](requirements/Salad_Soulmates_PRD_v2.2.md), plus [feature preservation](feature-preservation.md) when preserving the committed mobile/worker scope. |
| Packaging | [Packaging and label setup](packaging-setup.md). |
| Shipping | [Shipping preparation](shipping.md). |
| Recipe development | The recipe sections of [Build Specification v1.1](requirements/Salad_Soulmates_Build_Specification_v1.1.md) and [PRD v2.2](requirements/Salad_Soulmates_PRD_v2.2.md); load [feature preservation](feature-preservation.md) when reconciling retained recipe behavior. |
| Reference/dropdown data management | The directly affected source/tests, [database setup](database.md) for persistence or RLS changes, and the relevant requirement section only when behavior is unclear. |
| Roadmap, build-plan, completion status, sequencing, or selecting the next task | [Build plan](build-plan.md), then the candidate feature document(s). |
| Requirement conflict or owner decision | The relevant portions of [owner decisions](decisions.md), then only the conflicting requirement or mockup source. |
| Architecture or another major cross-cutting change | [Owner decisions](decisions.md), [Build Specification v1.1](requirements/Salad_Soulmates_Build_Specification_v1.1.md), [PRD v2.2](requirements/Salad_Soulmates_PRD_v2.2.md), [database setup](database.md), and the affected feature documents. |
| Refactor | [Engineering refactor and open acceptance](engineering-refactor.md), plus the affected source/tests and feature documentation. |
| Deployment, release, or production verification | [Review gates](review.md), [Browser Preview](browser-preview.md) when a Preview is involved, the affected feature document, and relevant release/hosting decisions in [owner decisions](decisions.md). Load [Build plan](build-plan.md) when determining release scope or completion status. |

## Supporting references

- [Continuation guide](continue-in-codex.md): current checkpoint and handoff format; consult when resuming implementation or preparing a handoff.
- [Refactor gate runbook](refactor-gate-runbook.md): only for the refactor acceptance gates it covers.
- [Mockup index](mockups/README.md): only when UI behavior or visual fidelity is part of the task.
- [Feature preservation](feature-preservation.md): only when retained scope, prototype inputs, or older-source reconciliation matters.

## Escalating context

Read the full PRD/build specification only when the task is broad, cross-cutting,
architectural, or remains ambiguous after consulting its feature documents and
relevant decisions. Read decisions before older requirements or mockups whenever
they conflict. Do not treat a documentation link as an instruction to load every
linked document.

## Keeping plans current

Record accepted product changes in decisions.md and update the affected build-plan
scope and feature acceptance criteria in the same change. Preserve versioned source
specifications; document overrides instead of creating competing PRDs.

For each implementation, record the branch/PR, delivered behavior, exact
verification results, remaining acceptance work, and the next step. Distinguish
implemented, merged, deployed, and owner-accepted: none automatically proves the
others.

When resuming, check current main, open PRs, working-tree changes and applicable
instructions before editing. Historical access failures and scratch paths are not
current status. Never overwrite another session's work.

Attached older PRDs, discovery worksheets and HTML prototypes are supporting inputs.
They do not supersede the versioned specifications or subsequent owner decisions.
Import a new source only with its provenance and reconcile conflicting requirements.

## Reusable starting request

Use mattdannadev/Salad-Soulmates. Read AGENTS.md, inspect current branch and open
PR state, then use docs/README.md to load only task-relevant source, tests, and
documentation. Implement the approved scope while preserving existing behavior and
data. Update the plan and decision log only when the task changes their content.
Verify the change, report the PR and remaining acceptance work, and follow the
current task's release authorization.
