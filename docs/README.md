# Project starting point

Use this index from ChatGPT Work, Codex, an IDE, or a human development session.
The repository is the durable project record; a new conversation must not depend
on access to previous chat history.

## Read in this order

1. [Engineering policy](../AGENTS.md): mandatory standards for existing and future code.
2. [Owner decisions](decisions.md): approved behavior and source precedence.
3. [Build plan](build-plan.md): delivery order, status, and remaining scope.
4. [Continuation guide](continue-in-codex.md): how to resume and verify current state.
5. [Build Specification v1.1](requirements/Salad_Soulmates_Build_Specification_v1.1.md)
   and [PRD v2.2](requirements/Salad_Soulmates_PRD_v2.2.md): detailed requirements,
   subject to later owner decisions.
6. The relevant feature document and acceptance checklist.

## Feature and verification references

- [Engineering refactor and open acceptance](engineering-refactor.md)
- [Feature preservation](feature-preservation.md)
- [Materials and purchasing](materials-purchasing.md)
- [Receiving and serialization](receiving-serialization.md)
- [Order-linked production preparation](order-production-planning.md)
- [Packaging and label setup](packaging-setup.md)
- [Customers and operations dashboard](customer-dashboard.md)
- [Shipping preparation](shipping.md)
- [Database setup](database.md)
- [Review gates](review.md)
- [Refactor gate runbook](refactor-gate-runbook.md)
- [Browser Preview](browser-preview.md)
- [Mockup index](mockups/README.md)

## Keeping plans current

Record accepted product changes in decisions.md and update the affected build-plan
scope and feature acceptance criteria in the same change. Preserve versioned source
specifications; document overrides instead of creating competing PRDs.

For each implementation, record the branch/PR, delivered behavior, exact verification
results, remaining acceptance work, and the next step. Distinguish implemented,
merged, deployed, and owner-accepted: none automatically proves the others.

When resuming, check current main, open PRs, working-tree changes and applicable
instructions before editing. Historical access failures and scratch paths are not
current status. Never overwrite another session's work.

Attached older PRDs, discovery worksheets and HTML prototypes are supporting inputs.
They do not supersede the versioned specifications or subsequent owner decisions.
Import a new source only with its provenance and reconcile conflicting requirements.

## Reusable starting request

Use mattdannadev/Salad-Soulmates. Read AGENTS.md and docs/README.md, then the current
decisions, build plan and relevant feature requirements. Inspect main and open PRs.
Implement the next approved incomplete item, preserving existing behavior and data.
Update the plan and decision log, verify the change, and report the PR and remaining
acceptance work. Follow the current task's release authorization.
