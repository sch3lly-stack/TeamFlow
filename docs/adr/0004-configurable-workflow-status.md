# ADR-0004: Workflow columns as task status

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** None

## Context

The product requires configurable Kanban workflows, sprint progress, completion
metrics, and accurate historical throughput. A fixed status enum plus a separate
column model would create two sources of truth and drift during drag-and-drop.

## Decision

- A project owns ordered `WorkflowColumn` rows with `isDone` and optional WIP limit.
- A task's status is its `columnId`; there is no separate status enum.
- Moving into an `isDone` column sets `completedAt` (if unset); moving out clears
  it. Completion timestamps are preserved for burndown, cycle time, velocity, and
  on-time metrics.
- One or more columns may be marked done; at least one done column must remain.
  Columns containing tasks cannot be deleted; a project must retain one column.
- Sprint completion does not rewrite tasks; incomplete work stays attached until
  explicitly carried over, preserving report accuracy.

## Consequences

### Positive

- The board, task detail, sprint reporting, and analytics share one status source.
- Custom workflows are first-class without migration-heavy status mappings.
- Historical completion survives renames/reordering.

### Negative / trade-offs

- Moving between non-done columns does not change completion, by design.
- Changing `isDone` retroactively completes/clears tasks; this is audited and
  must be treated carefully.
- Reporting must join columns to determine done state.

### Follow-ups

- Add task-level status history if audit requirements grow.
- Add explicit sprint scope-change tracking in a future iteration.

## Alternatives considered

| Alternative | Why not chosen |
| --- | --- |
| Fixed enum + column mapping | Dual source of truth; drift and migration complexity. |
| Per-task custom status strings | No ordering/completion semantics; weak analytics. |

## Verification

Task move/completion tests, sprint reports, and project analytics all consume the
same `isDone`/`completedAt` contract. Seed data demonstrates custom workflow use.
