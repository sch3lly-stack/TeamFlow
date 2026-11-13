# Architecture Decision Records

ADRs capture significant, durable architecture decisions and their trade-offs.
They are not a substitute for issue acceptance criteria or API documentation.

Create a new ADR with [`template.md`](template.md) and open a documentation PR.
Decisions that change security boundaries, tenant isolation, persistence, or
realtime semantics require an ADR.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-monorepo-and-runtime-boundaries.md) | Monorepo and runtime boundaries | Accepted |
| [0002](0002-tenant-isolation-and-authorization.md) | Tenant isolation and capability authorization | Accepted |
| [0003](0003-session-and-token-strategy.md) | Session and token strategy | Accepted |
| [0004](0004-configurable-workflow-status.md) | Workflow columns as task status | Accepted |
| [0005](0005-in-process-realtime.md) | In-process realtime with a scale-out path | Accepted |
